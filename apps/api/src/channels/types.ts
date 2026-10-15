import type { Channel, ChannelStatus, ChannelType, IdentityType } from "@prisma/client";

/**
 * Contrato entre o núcleo de conversas e os canais (WhatsApp, e-mail, ...).
 * O núcleo NÃO importa nada específico de canal; só fala com estas interfaces.
 */

export interface NormalizedInboundMessage {
  /** Identidade do interlocutor no canal (ex.: telefone E.164 sem "+"). */
  identity: { type: IdentityType; value: string; displayName?: string | null; avatarUrl?: string | null };
  /** ID da mensagem no provedor (idempotência). */
  externalMessageId: string;
  /** "fromMe" no WhatsApp => OUTBOUND (enviada pelo próprio número, fora do app). */
  direction: "INBOUND" | "OUTBOUND";
  text: string | null;
  hasMedia: boolean;
  sentAt: Date;
  /** Payload cru do provedor, guardado para auditoria/reprocessamento. */
  raw: unknown;
}

export type ChannelEvent =
  | { kind: "message"; sessionKey: string; message: NormalizedInboundMessage }
  | { kind: "status"; sessionKey: string; status: ChannelStatus; externalIdentifier?: string | null }
  | { kind: "ignored"; reason: string };

export interface OutboundMessage {
  /** Valor da Identity do destinatário (ex.: telefone). */
  to: string;
  text: string;
}

export interface ChannelAdapter {
  readonly type: ChannelType;
  /** Converte o corpo bruto do webhook em eventos normalizados. */
  parseWebhook(body: unknown): ChannelEvent[];
  /** Envia uma mensagem pelo canal; devolve o ID externo. */
  send(channel: Channel, message: OutboundMessage): Promise<{ externalId: string | null }>;
}
