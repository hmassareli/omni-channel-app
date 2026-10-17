import type { Channel, ChannelStatus, ChannelType, IdentityType } from "@prisma/client";

/**
 * Contrato entre o núcleo de conversas e os canais (WhatsApp, e-mail, ...).
 * O núcleo NÃO importa nada específico de canal; só fala com estas interfaces.
 */

/** Tipos de mídia que o núcleo entende (independente do provedor). */
export type MediaKind =
  | "image"
  | "sticker"
  | "video"
  | "audio"
  | "voice"
  | "document"
  | "location"
  | "contact";

/** Status de entrega de uma mensagem enviada (do pior para o melhor). */
export type DeliveryAck = "pending" | "sent" | "delivered" | "read";

export interface NormalizedLocation {
  lat: number;
  lng: number;
  name?: string | null;
}

export interface NormalizedMedia {
  kind: MediaKind;
  mimetype?: string | null;
  filename?: string | null;
  /** Legenda (o mesmo valor vai em `text`). */
  caption?: string | null;
  /** De onde baixar o arquivo (opaco para o núcleo; o adaptador sabe buscar). */
  sourceUrl?: string | null;
  location?: NormalizedLocation | null;
  /** Cartão de contato (vCard), quando kind = "contact". */
  contact?: { name?: string | null; phone?: string | null } | null;
}

/** O que dá para extrair de um payload cru já gravado (mensagens antigas). */
export interface StoredPayloadDescription {
  media: NormalizedMedia | null;
  replyToExternalId: string | null;
  quotedText: string | null;
  ack: DeliveryAck | null;
}

export interface NormalizedInboundMessage {
  /** Identidade do interlocutor no canal (ex.: telefone E.164 sem "+"). */
  identity: { type: IdentityType; value: string; displayName?: string | null; avatarUrl?: string | null };
  /** ID da mensagem no provedor (idempotência por [conversationId, externalId]). Null = sem idempotência. */
  externalMessageId: string | null;
  /** ID da conversa/chat no provedor (ex.: chatId do WhatsApp), gravado em Conversation.externalId. */
  conversationExternalId?: string | null;
  /** "fromMe" no WhatsApp => OUTBOUND (enviada pelo próprio número, fora do app). */
  direction: "INBOUND" | "OUTBOUND";
  /** Texto da mensagem ou legenda da mídia. Null quando não há texto. */
  text: string | null;
  hasMedia: boolean;
  /** Mídia/localização/contato anexado. */
  media?: NormalizedMedia | null;
  /** ID externo da mensagem citada (resposta). */
  replyToExternalId?: string | null;
  /** Texto da mensagem citada, como o provedor mandou. */
  quotedText?: string | null;
  /** Status de entrega (mensagens enviadas). */
  ack?: DeliveryAck | null;
  sentAt: Date;
  /** Payload cru do provedor, guardado para auditoria/reprocessamento. */
  raw: unknown;
}

export type ChannelEvent =
  | {
      kind: "message";
      /** Sessão/conta do provedor (ex.: nome da sessão WAHA). Vazio quando o provedor não informa. */
      sessionKey: string;
      /** Identificador do próprio canal (ex.: número do WhatsApp), usado para achar o Channel. */
      externalIdentifier?: string | null;
      message: NormalizedInboundMessage;
    }
  | { kind: "status"; sessionKey: string; status: ChannelStatus; externalIdentifier?: string | null }
  /** Atualização do status de entrega de uma mensagem enviada. */
  | {
      kind: "ack";
      sessionKey: string;
      externalIdentifier?: string | null;
      externalMessageId: string;
      ack: DeliveryAck;
    }
  /** `raw` = payload cru, quando o provedor quer auditá-lo mesmo ignorado. */
  | { kind: "ignored"; reason: string; raw?: unknown };

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
  /**
   * Baixa o arquivo de mídia indicado em `NormalizedMedia.sourceUrl`.
   * Devolve a Response (o núcleo lê o corpo em stream e aplica o limite de tamanho).
   */
  fetchMedia?(channel: Channel, sourceUrl: string): Promise<Response>;
  /** Extrai mídia/citação/ack de um payload cru já gravado (Message.payload). */
  describeStoredPayload?(payload: unknown): StoredPayloadDescription;
}
