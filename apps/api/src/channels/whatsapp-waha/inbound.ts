import { ChannelType, Prisma, type Channel } from "@prisma/client";
import { emitDeskEvent } from "../../events/bus";
import { prisma } from "../../prisma";
import { ingestChannelMessage, type IngestResult } from "../../services/conversations/ingest";
import type { ChannelEvent } from "../types";
import { logWebhookDebug, MISSING_CHANNEL_REASON } from "./parse";
import { ensureWhatsappSessionWebhook } from "./webhook-config";
import { syncWhatsAppChats } from "./sync";

type MessageEvent = Extract<ChannelEvent, { kind: "message" }>;
type StatusEvent = Extract<ChannelEvent, { kind: "status" }>;
type IgnoredEvent = Extract<ChannelEvent, { kind: "ignored" }>;

function wahaIdOf(raw: unknown): string | null {
  const id = (raw as { id?: unknown } | null)?.id;
  return typeof id === "string" ? id : null;
}

/**
 * Localiza o Channel da mensagem: pelo número (externalIdentifier), depois pelo
 * nome da sessão WAHA; se nada existir, cria um canal órfão (sem operação).
 */
async function resolveChannel(event: MessageEvent): Promise<Channel> {
  const channelIdentifier = event.externalIdentifier ?? "";
  const sessionName = event.sessionKey || null;

  let channel = await prisma.channel.findFirst({
    where: {
      type: ChannelType.WHATSAPP,
      externalIdentifier: channelIdentifier,
    },
  });

  if (!channel && sessionName) {
    const whatsappChannel = await prisma.whatsAppChannel.findUnique({
      where: { sessionName },
      include: { channel: true },
    });

    if (whatsappChannel) {
      channel = whatsappChannel.channel;

      // Atualiza o externalIdentifier para facilitar buscas futuras
      await prisma.channel.update({
        where: { id: channel.id },
        data: { externalIdentifier: channelIdentifier },
      });

      console.log(
        `[Ingest] Channel ${channel.name} atualizado com externalIdentifier: ${channelIdentifier}`,
      );
    }
  }

  if (!channel) {
    console.log(`[Ingest] Criando channel órfão para ${channelIdentifier}`);
    const apiKey = (event.message.raw as { apiKey?: unknown } | null)?.apiKey;
    channel = await prisma.channel.create({
      data: {
        name: `WhatsApp ${channelIdentifier}`,
        type: ChannelType.WHATSAPP,
        externalIdentifier: channelIdentifier,
        metadata:
          typeof apiKey === "string"
            ? ({ apiKey } satisfies Prisma.JsonObject)
            : undefined,
      },
    });
  }

  logWebhookDebug("inbound:channel-selected", {
    sessionName,
    channelId: channel.id,
    channelIdentifier,
    operationId: channel.operationId ?? null,
  });

  return channel;
}

/** Grava o corpo cru do webhook (RawWhatsappMessage) e delega ao núcleo. */
export async function handleWhatsappMessage(
  event: MessageEvent,
  body: unknown,
): Promise<IngestResult> {
  // wahaId é único: reenvio do webhook reaproveita o registro cru (idempotência).
  const wahaId = wahaIdOf(event.message.raw);
  const existingRaw = wahaId
    ? await prisma.rawWhatsappMessage.findUnique({ where: { wahaId } })
    : null;
  const rawRecord =
    existingRaw ??
    (await prisma.rawWhatsappMessage.create({
      data: {
        wahaId,
        payload: body as Prisma.JsonObject,
        processed: false,
      },
    }));

  const markProcessed = () =>
    prisma.rawWhatsappMessage.update({
      where: { id: rawRecord.id },
      data: { processed: true },
    });

  try {
    const channel = await resolveChannel(event);
    const result = await ingestChannelMessage(channel, event.message, {
      rawRecordId: rawRecord.id,
    });
    await markProcessed();
    return result;
  } catch (error) {
    logWebhookDebug("inbound:error", {
      rawRecordId: rawRecord.id,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/** Eventos descartados pelo parser: guarda o cru (já processado) para auditoria. */
export async function handleIgnoredWhatsappEvent(
  event: IgnoredEvent,
  body: unknown,
): Promise<{ skipped: true; reason: string }> {
  if (event.reason !== MISSING_CHANNEL_REASON && event.raw !== undefined) {
    const wahaId = wahaIdOf(event.raw);
    const exists = wahaId
      ? await prisma.rawWhatsappMessage.findUnique({ where: { wahaId } })
      : null;
    if (!exists) {
      await prisma.rawWhatsappMessage.create({
        data: {
          wahaId,
          payload: body as Prisma.JsonObject,
          processed: true,
        },
      });
    }
  }

  logWebhookDebug("inbound:skipped", { reason: event.reason });
  return { skipped: true, reason: event.reason };
}

/** Atualiza o status do canal; ao conectar, reconfigura webhook e sincroniza chats. */
export async function handleWhatsappStatus(event: StatusEvent): Promise<void> {
  const session = event.sessionKey;

  // Encontra o canal pelo nome da sessão
  const whatsappChannel = await prisma.whatsAppChannel.findUnique({
    where: { sessionName: session },
    include: { channel: true },
  });

  if (!whatsappChannel) {
    console.log(`[Webhook] Sessão ${session} não encontrada no banco`);
    return;
  }

  const previous = whatsappChannel.channel;
  await prisma.channel.update({
    where: { id: whatsappChannel.channelId },
    data: {
      status: event.status,
      // Salva o número quando conectar
      externalIdentifier: event.externalIdentifier || previous.externalIdentifier,
    },
  });

  if (previous.operationId && previous.status !== event.status) {
    emitDeskEvent({
      type: "channel.updated",
      operationId: previous.operationId,
      channelId: previous.id,
    });
  }

  console.log(
    `[Webhook] Canal ${whatsappChannel.channel.name} atualizado: ${event.status}`,
  );

  // Se acabou de conectar (WORKING), dispara sync dos chats
  if (event.status === "WORKING") {
    console.log(
      `[Webhook] Sessão ${session} conectada - iniciando sync de chats...`,
    );

    await ensureWhatsappSessionWebhook(session, whatsappChannel.webhookUrl);

    // Executa sync em background para não bloquear o webhook
    syncWhatsAppChats(whatsappChannel.channelId, session)
      .then((result) => {
        console.log(
          `[Webhook] Sync concluído: ${result.totalChats} chats, ${result.newConversations} novos`,
        );
      })
      .catch((error) => {
        console.error(`[Webhook] Erro no sync:`, error);
      });
  }
}
