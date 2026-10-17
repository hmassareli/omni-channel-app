import { ChannelStatus, Prisma, type Channel, type WhatsAppChannel } from "@prisma/client";
import { emitDeskEvent } from "../../events/bus";
import { prisma } from "../../prisma";
import { syncWhatsAppChats } from "./sync";
import * as waha from "./waha";
import { ensureWhatsappSessionWebhook, resolveWhatsappWebhookUrl } from "./webhook-config";

export type WhatsappChannelRecord = Channel & { whatsappDetails: WhatsAppChannel };

/** Status ao vivo no WAHA; "NOT_FOUND" = a sessão não existe mais lá. */
export type WahaLiveStatus = waha.WAHASessionStatus | "NOT_FOUND";

export interface WhatsappHealth {
  /** Status do canal gravado após a checagem. */
  status: ChannelStatus;
  /** null = WAHA inacessível (status do canal mantido). */
  wahaStatus: WahaLiveStatus | null;
  /** Número conectado (só com sessão autenticada). */
  me: { phoneNumber: string; pushName: string | null } | null;
  /** Webhook da sessão aponta para o app (com segredo). undefined = não dá para avaliar. */
  webhookOk?: boolean;
  /** O webhook estava errado e foi reconfigurado nesta checagem. */
  webhookRepaired?: boolean;
  error?: string;
  /** O status gravado mudou nesta checagem. */
  changed: boolean;
}

export function mapWahaStatusToChannelStatus(wahaStatus: waha.WAHASessionStatus): ChannelStatus {
  switch (wahaStatus) {
    case "WORKING":
      return ChannelStatus.WORKING;
    case "STARTING":
    case "SCAN_QR_CODE":
      return ChannelStatus.CONNECTING;
    case "STOPPED":
      return ChannelStatus.STOPPED;
    case "FAILED":
    default:
      return ChannelStatus.FAILED;
  }
}

/** O webhook configurado na sessão entrega os eventos do app, com o segredo (se houver). */
export function isSessionWebhookOk(
  session: waha.WAHASession,
  storedWebhookUrl: string | null,
): boolean | undefined {
  const expected = resolveWhatsappWebhookUrl(storedWebhookUrl);
  if (!expected) return undefined;
  const secret = process.env.WEBHOOK_SECRET;
  return (session.config?.webhooks ?? []).some((hook) => {
    if (hook.url !== expected) return false;
    const events = hook.events ?? [];
    const hasMessages = events.includes("message.any") || events.includes("message");
    if (!hasMessages || !events.includes("session.status") || !events.includes("message.ack")) {
      return false; // sessão antiga sem ack: será reconfigurada
    }
    if (!secret) return true;
    const header = (hook.customHeaders ?? []).find(
      (h) => h.name.toLowerCase() === "x-webhook-secret",
    );
    // Algumas versões do WAHA podem omitir o valor; o nome do header já basta.
    return !!header && (header.value === undefined || header.value === secret);
  });
}

/** Emite channel.updated para a operação dona do canal. */
export function emitChannelUpdated(channel: Pick<Channel, "id" | "operationId">) {
  if (!channel.operationId) return;
  emitDeskEvent({ type: "channel.updated", operationId: channel.operationId, channelId: channel.id });
}

/** Grava o novo status (e o número, se vier); emite evento se o status mudou. */
export async function persistChannelStatus(
  channel: Channel,
  status: ChannelStatus,
  phoneNumber?: string | null,
): Promise<boolean> {
  const changed = channel.status !== status;
  if (changed) {
    await prisma.channel.update({ where: { id: channel.id }, data: { status } });
  }
  if (phoneNumber && phoneNumber !== channel.externalIdentifier) {
    try {
      await prisma.channel.update({
        where: { id: channel.id },
        data: { externalIdentifier: phoneNumber },
      });
    } catch (error) {
      // Mesmo número já vinculado a outro canal (constraint única): mantém o atual.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        console.warn(`[Channels] Número ${phoneNumber} já está em uso por outro canal`);
      } else {
        throw error;
      }
    }
  }
  if (changed) emitChannelUpdated(channel);
  return changed;
}

/**
 * Consulta a sessão no WAHA ao vivo e sincroniza o status do canal.
 * "Session not found" vira STOPPED (desconectado), nunca erro.
 * Ao (re)conectar: reconfigura o webhook se necessário e dispara o sync de chats.
 */
export async function checkWhatsappChannelHealth(
  channel: WhatsappChannelRecord,
): Promise<WhatsappHealth> {
  const { sessionName, webhookUrl } = channel.whatsappDetails;

  let session: waha.WAHASession;
  try {
    session = await waha.getSession(sessionName);
  } catch (error) {
    if (waha.isWahaSessionNotFound(error)) {
      const changed = await persistChannelStatus(channel, ChannelStatus.STOPPED);
      return {
        status: ChannelStatus.STOPPED,
        wahaStatus: "NOT_FOUND",
        me: null,
        webhookOk: false,
        error: "Sessão não existe no WhatsApp (WAHA). Reconecte o canal.",
        changed,
      };
    }
    return {
      status: channel.status,
      wahaStatus: null,
      me: null,
      error: `Não foi possível consultar o WhatsApp: ${
        error instanceof Error ? error.message : "erro desconhecido"
      }`,
      changed: false,
    };
  }

  const status = mapWahaStatusToChannelStatus(session.status);
  const phoneNumber = session.me?.id?.split("@")[0] || null;
  const becameWorking = status === ChannelStatus.WORKING && channel.status !== ChannelStatus.WORKING;
  const changed = await persistChannelStatus(channel, status, phoneNumber);

  let webhookOk = isSessionWebhookOk(session, webhookUrl);
  let webhookRepaired: boolean | undefined;

  if (session.status === "WORKING") {
    if (becameWorking || webhookOk === false) {
      try {
        const configured = await ensureWhatsappSessionWebhook(sessionName, webhookUrl);
        if (configured && webhookOk === false) {
          webhookOk = true;
          webhookRepaired = true;
        }
      } catch (error) {
        console.error("[Channels] Falha ao reconfigurar webhook:", error);
      }
    }
    if (becameWorking) {
      syncWhatsAppChats(channel.id, sessionName).catch((error) => {
        console.error("[Channels] Erro no sync após WORKING:", error);
      });
    }
  }

  return {
    status,
    wahaStatus: session.status,
    me: phoneNumber ? { phoneNumber, pushName: session.me?.pushName ?? null } : null,
    webhookOk,
    ...(webhookRepaired ? { webhookRepaired } : {}),
    changed,
  };
}

/** Última mensagem INBOUND por canal (uma consulta; usa o índice conversationId+sentAt). */
export async function lastInboundAtByChannel(channelIds: string[]): Promise<Map<string, Date>> {
  if (channelIds.length === 0) return new Map();
  const rows = await prisma.$queryRaw<Array<{ channelId: string; lastInboundAt: Date | null }>>`
    SELECT c."channelId" AS "channelId", MAX(li."sentAt") AS "lastInboundAt"
    FROM "omni_conversations" c
    CROSS JOIN LATERAL (
      SELECT m."sentAt"
      FROM "omni_messages" m
      WHERE m."conversationId" = c."id" AND m."direction" = 'INBOUND'
      ORDER BY m."sentAt" DESC
      LIMIT 1
    ) li
    WHERE c."channelId" IN (${Prisma.join(channelIds)})
    GROUP BY c."channelId"
  `;
  const map = new Map<string, Date>();
  for (const row of rows) if (row.lastInboundAt) map.set(row.channelId, new Date(row.lastInboundAt));
  return map;
}
