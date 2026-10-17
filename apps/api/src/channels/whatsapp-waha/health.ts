import { ChannelStatus, ChannelType, Prisma, type Channel, type WhatsAppChannel } from "@prisma/client";
import { emitDeskEvent } from "../../events/bus";
import { prisma } from "../../prisma";
import { syncWhatsAppChats } from "./sync";
import * as waha from "./waha";
import { ensureWhatsappSessionWebhook, isSessionWebhookOk } from "./webhook-config";

export { isSessionWebhookOk };

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
  /** Diagnóstico da última tentativa de conexão que falhou (só com status FAILED). */
  failure?: ConnectFailure;
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

/** Status em que a sessão já "decidiu": QR pronto, conectada ou falhou. */
const SETTLED_STATUSES: waha.WAHASessionStatus[] = ["SCAN_QR_CODE", "WORKING", "FAILED"];

/**
 * Logo após o start o WAHA responde STARTING; a recusa do WhatsApp chega segundos depois.
 * Consulta até a sessão assentar (ou o tempo acabar) para responder o resultado real.
 */
export async function settleSessionStatus(
  sessionName: string,
  initial: waha.WAHASession,
  timeoutMs = Number(process.env.WAHA_SETTLE_TIMEOUT_MS ?? 15000),
  intervalMs = 1000,
): Promise<waha.WAHASession> {
  let current = initial;
  const deadline = Date.now() + timeoutMs;
  while (!SETTLED_STATUSES.includes(current.status) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
    try {
      current = await waha.getSession(sessionName);
    } catch {
      return current;
    }
  }
  return current;
}

export type ConnectFailureCode = "SESSION_FAILED" | "WAHA_CANNOT_CONNECT";

export interface ConnectFailure {
  code: ConnectFailureCode;
  error: string;
  at: string;
}

/**
 * Última falha de conexão por canal (memória do processo). O WAHA só informa "FAILED",
 * sem motivo; o diagnóstico vem de como a falha aconteceu.
 */
const connectFailures = new Map<string, ConnectFailure>();

export function getConnectFailure(channelId: string): ConnectFailure | undefined {
  return connectFailures.get(channelId);
}

export function clearConnectFailure(channelId: string) {
  connectFailures.delete(channelId);
}

/**
 * fresh=false: reiniciou com a credencial salva (pode ter sido desconectada no celular).
 * fresh=true: sessão nova, sem credencial, e mesmo assim nem gerou QR: o problema é o
 * próprio WAHA (tipicamente versão antiga recusada pelo WhatsApp).
 */
export async function recordConnectFailure(channelId: string, fresh: boolean): Promise<ConnectFailure> {
  let failure: ConnectFailure;
  if (!fresh) {
    failure = {
      code: "SESSION_FAILED",
      error:
        "A sessão salva não conectou. Se o aparelho foi desconectado no celular (Aparelhos conectados), ela não volta mais: gere um novo QR code.",
      at: new Date().toISOString(),
    };
  } else {
    let version = "";
    try {
      const info = await waha.getServerVersion();
      version = info.version ? ` ${info.version}` : "";
    } catch {
      // versão é só informativa
    }
    failure = {
      code: "WAHA_CANNOT_CONNECT",
      error: `O servidor do WhatsApp (WAHA${version}) não conseguiu se conectar ao WhatsApp nem para gerar o QR code. Isso acontece quando o WAHA fica desatualizado e o WhatsApp passa a recusá-lo: atualize o serviço "whatsapp" e tente de novo.`,
      at: new Date().toISOString(),
    };
  }
  connectFailures.set(channelId, failure);
  return failure;
}

/** Emite channel.updated para a operação dona do canal. */
export function emitChannelUpdated(channel: Pick<Channel, "id" | "operationId">) {
  if (!channel.operationId) return;
  emitDeskEvent({ type: "channel.updated", operationId: channel.operationId, channelId: channel.id });
}

/**
 * Vincula o número ao canal dono da sessão conectada. Se outro canal ainda guarda o
 * número (ex.: canal antigo cuja sessão sumiu), ele perde o vínculo: quem está com a
 * sessão ativa é a verdade, senão as mensagens seriam roteadas para o canal velho.
 */
export async function claimChannelNumber(channelId: string, phoneNumber: string): Promise<void> {
  const [released] = await prisma.$transaction([
    prisma.channel.updateMany({
      where: { type: ChannelType.WHATSAPP, externalIdentifier: phoneNumber, id: { not: channelId } },
      data: { externalIdentifier: null },
    }),
    prisma.channel.update({ where: { id: channelId }, data: { externalIdentifier: phoneNumber } }),
  ]);
  if (released.count > 0) {
    console.warn(`[Channels] Número ${phoneNumber} transferido para o canal ${channelId}`);
  }
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
    await claimChannelNumber(channel.id, phoneNumber);
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

  if (session.status === "WORKING" || session.status === "SCAN_QR_CODE") clearConnectFailure(channel.id);
  const failure = session.status === "FAILED" ? getConnectFailure(channel.id) : undefined;

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
    ...(session.status === "FAILED"
      ? {
          error:
            failure?.error ??
            "A conexão com o WhatsApp falhou. Tente reconectar; se não resolver, gere um novo QR code.",
          ...(failure ? { failure } : {}),
        }
      : {}),
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
