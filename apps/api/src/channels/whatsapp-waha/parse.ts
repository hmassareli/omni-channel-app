import { ChannelStatus } from "@prisma/client";
import { z } from "zod";
import type { ChannelEvent } from "../types";
import { extractWahaMedia, extractWahaReply, mapWahaAck } from "./extract";

// ============================================================================
// Parsing do webhook do WAHA -> ChannelEvent normalizado
// Função pura: não toca em banco nem em rede.
// ============================================================================

const payloadSchema = z
  .object({
    id: z.string().optional(),
    chatId: z.string().optional().nullable(),
    from: z.string().optional().nullable(),
    to: z.string().optional().nullable(),
    timestamp: z.union([z.string(), z.number()]).optional(),
    messageTimestamp: z.number().optional(),
    fromMe: z.boolean(),
    hasMedia: z.union([z.boolean(), z.string()]).optional(),
    body: z.string().optional().nullable(),
    participant: z.string().optional().nullable(),
    isDefaultSubgroup: z.boolean().optional(),
    type: z.string().optional().nullable(),
    apiKey: z.string().optional(),
    _data: z
      .object({
        messageTimestamp: z.number().optional(),
        remoteJidAlt: z.string().optional(),
        Info: z
          .object({
            Chat: z.string().optional().nullable(),
            Sender: z.string().optional().nullable(),
            SenderAlt: z.string().optional().nullable(),
            RecipientAlt: z.string().optional().nullable(),
            IsGroup: z.boolean().optional(),
            DeviceSentMeta: z
              .object({
                DestinationJID: z.string().optional().nullable(),
              })
              .partial()
              .optional()
              .nullable(),
          })
          .partial()
          .optional(),
      })
      .partial()
      .optional(),
  })
  .loose();

const webhookBodySchema = z
  .object({
    session: z.string().optional(), // Nome da sessão WAHA
    me: z
      .object({
        id: z.string(),
      })
      .loose()
      .nullish(), // WAHA manda null enquanto a sessão não autenticou
    payload: payloadSchema,
  })
  .loose();

const whatsappWebhookSchema = z.union([
  z.object({ body: webhookBodySchema }).loose(),
  webhookBodySchema,
]);

// Schema para webhook de session.status do WAHA
const sessionStatusWebhookSchema = z.object({
  event: z.literal("session.status"),
  session: z.string(),
  me: z
    .object({
      id: z.string().optional(),
      pushName: z.string().optional(),
    })
    .nullish(), // null em STARTING/SCAN_QR_CODE
  payload: z.object({
    status: z.enum([
      "STOPPED",
      "STARTING",
      "SCAN_QR_CODE",
      "WORKING",
      "FAILED",
    ]),
  }),
});

type MessagePayload = z.infer<typeof payloadSchema>;
type WebhookEnvelope = z.infer<typeof webhookBodySchema>;

/** Payload que não obedece ao formato do WAHA (a rota responde 400). */
export class InvalidWebhookPayloadError extends Error {
  constructor(
    message: string,
    readonly details: unknown,
  ) {
    super(message);
    this.name = "InvalidWebhookPayloadError";
  }
}

/** Motivo de "ignored" em que nem o payload cru deve ser guardado. */
export const MISSING_CHANNEL_REASON = "missing-channel-identifier";

const webhookDebugEnabled =
  process.env.WHATSAPP_WEBHOOK_DEBUG?.toLowerCase() === "true";

export function logWebhookDebug(stage: string, details: Record<string, unknown>) {
  if (!webhookDebugEnabled) {
    return;
  }

  console.log(`[WebhookDebug] ${stage} ${JSON.stringify(details, null, 2)}`);
}

function previewText(value?: string | null, limit = 160) {
  if (!value) {
    return "";
  }

  return value.length <= limit ? value : `${value.slice(0, limit)}...`;
}

function endsWithJid(value: string | null | undefined, suffix: string) {
  return Boolean(value?.toLowerCase().endsWith(suffix));
}

function buildSkipDiagnostics(payload: MessagePayload) {
  const hasTextBody = Boolean(payload.body && payload.body.trim().length > 0);
  const hasMedia = toBoolean(payload.hasMedia);
  // Localização e contato chegam sem body e com hasMedia=false.
  const hasAttachment = extractWahaMedia(payload) !== null;
  const hasContent = hasTextBody || hasMedia || hasAttachment;
  const hasParticipant = Boolean(payload.participant);
  const hasDefaultSubgroupFlag = payload.isDefaultSubgroup !== undefined;
  const idHasNewsletter = Boolean(payload.id?.includes("@newsletter"));
  const idHasBroadcast = Boolean(payload.id?.includes("broadcast"));
  const chatIdIsGroup = endsWithJid(payload.chatId, "@g.us");
  const fromIsGroup = endsWithJid(payload.from, "@g.us");
  const toIsGroup = endsWithJid(payload.to, "@g.us");
  const chatIdIsDirect = endsWithJid(payload.chatId, "@c.us");
  const fromIsDirect = endsWithJid(payload.from, "@c.us");
  const toIsDirect = endsWithJid(payload.to, "@c.us");
  const isStatusBroadcast = endsWithJid(payload.chatId, "status@broadcast");

  const isGroupChat = Boolean(
    hasParticipant ||
    hasDefaultSubgroupFlag ||
    (payload.id && (idHasNewsletter || idHasBroadcast)),
  );

  const reason = !hasContent
    ? "empty-message"
    : isGroupChat
      ? "group-message"
      : null;

  return {
    reason,
    fields: {
      id: payload.id ?? null,
      chatId: payload.chatId ?? null,
      from: payload.from ?? null,
      to: payload.to ?? null,
      participant: payload.participant ?? null,
      isDefaultSubgroup: payload.isDefaultSubgroup ?? null,
      type: payload.type ?? null,
      fromMe: payload.fromMe,
      bodyPreview: previewText(payload.body),
      hasMediaRaw: payload.hasMedia ?? null,
    },
    booleans: {
      hasTextBody,
      hasMedia,
      hasContent,
      hasParticipant,
      hasDefaultSubgroupFlag,
      idHasNewsletter,
      idHasBroadcast,
      chatIdIsGroup,
      fromIsGroup,
      toIsGroup,
      chatIdIsDirect,
      fromIsDirect,
      toIsDirect,
      isStatusBroadcast,
      wouldBeGroupByJid: chatIdIsGroup || fromIsGroup || toIsGroup,
    },
  };
}

function uniqueNonEmptyValues(values: Array<string | null | undefined>) {
  return [
    ...new Set(
      values.filter((value): value is string => Boolean(value?.trim())),
    ),
  ];
}

function buildSelfIdentifiers(
  me: WebhookEnvelope["me"],
  channelIdentifier: string,
) {
  const looseMe = (me ?? {}) as Record<string, unknown>;

  return new Set(
    uniqueNonEmptyValues([
      channelIdentifier,
      sanitizeWaId(me?.id),
      sanitizeWaId(typeof looseMe.lid === "string" ? looseMe.lid : null),
      sanitizeWaId(typeof looseMe.jid === "string" ? looseMe.jid : null),
    ]),
  );
}

function resolveContactIdentifier(
  payload: MessagePayload,
  direction: "INBOUND" | "OUTBOUND",
  selfIdentifiers: Set<string>,
) {
  const info = payload._data?.Info;

  const candidates =
    direction === "OUTBOUND"
      ? [
          { source: "payload.to", value: payload.to },
          { source: "payload.chatId", value: payload.chatId },
          { source: "_data.Info.RecipientAlt", value: info?.RecipientAlt },
          { source: "_data.Info.Chat", value: info?.Chat },
          { source: "payload.from", value: payload.from },
        ]
      : [
          { source: "_data.Info.SenderAlt", value: info?.SenderAlt },
          { source: "_data.remoteJidAlt", value: payload._data?.remoteJidAlt },
          { source: "payload.from", value: payload.from },
          { source: "payload.chatId", value: payload.chatId },
          { source: "_data.Info.Chat", value: info?.Chat },
        ];

  const evaluatedCandidates = candidates.map((candidate) => {
    const sanitized = sanitizeWaId(candidate.value);
    return {
      source: candidate.source,
      raw: candidate.value ?? null,
      sanitized,
      isSelf: sanitized ? selfIdentifiers.has(sanitized) : false,
    };
  });

  const selected = evaluatedCandidates.find(
    (candidate) => candidate.sanitized && !candidate.isSelf,
  );

  return {
    rawContactId: selected?.raw ?? null,
    contactWaId: selected?.sanitized ?? null,
    selectedSource: selected?.source ?? null,
    candidates: evaluatedCandidates,
  };
}

/** "5511999999999@c.us" / "5511...:12@s.whatsapp.net" -> "5511999999999". */
export function sanitizeWaId(value?: string | null): string | null {
  if (!value) {
    return null;
  }

  const [identifier] = value.split("@");
  const normalized = identifier?.split(":")[0]?.trim();
  return normalized || null;
}

export function toBoolean(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    return value.toLowerCase() === "true";
  }

  return false;
}

/** Converte timestamp do WAHA (segundos ou milissegundos) em Date. */
export function resolveTimestamp(payload: MessagePayload): Date {
  const candidates: Array<number | string | undefined> = [
    payload.timestamp,
    payload.messageTimestamp,
    payload._data?.messageTimestamp,
  ];

  for (const candidate of candidates) {
    if (candidate === undefined) {
      continue;
    }

    const asNumber =
      typeof candidate === "string" ? Number(candidate) : candidate;

    if (Number.isFinite(asNumber)) {
      if (asNumber > 1_000_000_000_000) {
        return new Date(asNumber);
      }

      return new Date(asNumber * 1000);
    }
  }

  return new Date();
}

/** Texto da mensagem; em mídia é a legenda. Null quando vazio (nunca "<media>"). */
function resolveContent(payload: MessagePayload): string | null {
  const text = (payload.body ?? "").trim();
  return text || null;
}

function mapWahaStatusToChannelStatus(
  wahaStatus: z.infer<typeof sessionStatusWebhookSchema>["payload"]["status"],
): ChannelStatus {
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

function parseSessionStatus(body: Record<string, unknown>): ChannelEvent[] {
  const result = sessionStatusWebhookSchema.safeParse(body);

  logWebhookDebug("parse:session-status", {
    success: result.success,
    session: typeof body.session === "string" ? body.session : null,
  });

  if (!result.success) {
    throw new InvalidWebhookPayloadError(
      "Invalid session.status payload",
      result.error,
    );
  }

  const { session, payload, me } = result.data;
  return [
    {
      kind: "status",
      sessionKey: session,
      status: mapWahaStatusToChannelStatus(payload.status),
      externalIdentifier: me?.id?.split("@")[0] || null,
    },
  ];
}

function parseMessage(body: unknown): ChannelEvent[] {
  const parsedBody = whatsappWebhookSchema.safeParse(body);

  if (!parsedBody.success) {
    throw new InvalidWebhookPayloadError("Invalid payload", parsedBody.error);
  }

  const parsed = parsedBody.data;
  const envelope = webhookBodySchema.parse(
    "body" in parsed ? parsed.body : parsed,
  );
  const { me, payload: messagePayload, session: sessionName } = envelope;

  logWebhookDebug("parse:start", {
    sessionName: sessionName ?? null,
    me: me ?? null,
    envelope,
  });

  const channelIdentifier = sanitizeWaId(me?.id);
  if (!channelIdentifier) {
    logWebhookDebug("parse:skip-missing-channel", {
      sessionName: sessionName ?? null,
      me: me ?? null,
      messagePayload,
    });
    return [{ kind: "ignored", reason: MISSING_CHANNEL_REASON }];
  }

  const skipDiagnostics = buildSkipDiagnostics(messagePayload);
  logWebhookDebug("parse:filter-evaluation", {
    sessionName: sessionName ?? null,
    channelIdentifier,
    ...skipDiagnostics,
  });

  if (skipDiagnostics.reason) {
    return [
      { kind: "ignored", reason: skipDiagnostics.reason, raw: messagePayload },
    ];
  }

  const direction = messagePayload.fromMe ? "OUTBOUND" : "INBOUND";
  const selfIdentifiers = buildSelfIdentifiers(me, channelIdentifier);
  const resolvedContact = resolveContactIdentifier(
    messagePayload,
    direction,
    selfIdentifiers,
  );

  const rawContactId = resolvedContact.rawContactId;
  let contactWaId = resolvedContact.contactWaId;

  logWebhookDebug("parse:contact-resolution", {
    sessionName: sessionName ?? null,
    channelIdentifier,
    direction,
    rawContactId,
    sanitizedContactWaId: contactWaId,
    selectedSource: resolvedContact.selectedSource,
    selfIdentifiers: [...selfIdentifiers],
    candidates: resolvedContact.candidates,
  });

  if (!contactWaId) {
    return [
      {
        kind: "ignored",
        reason: "missing-contact-identifier",
        raw: messagePayload,
      },
    ];
  }

  // Resolve LID -> telefone real via _data.remoteJidAlt
  // WhatsApp migrou contatos para @lid — o ID não é o telefone.
  if (rawContactId?.includes("@lid")) {
    const originalLid = contactWaId;
    const altPhone = sanitizeWaId(messagePayload._data?.remoteJidAlt);
    if (altPhone) contactWaId = altPhone;

    if (contactWaId !== originalLid) {
      console.log(`[Ingest] LID ${originalLid} → ${contactWaId}`);
    } else {
      console.warn(
        `[Ingest] LID ${originalLid} não resolvido — armazenado como LID`,
      );
    }
  }

  const sentAt = resolveTimestamp(messagePayload);
  // Extrai do payload original: o schema descarta campos desconhecidos de `_data`
  // (ex.: _data.Message.stickerMessage), úteis para classificar a mídia.
  const originalPayload = originalMessagePayload(body) ?? messagePayload;
  const media = extractWahaMedia(originalPayload);
  const reply = extractWahaReply(originalPayload);
  const hasMedia = toBoolean(messagePayload.hasMedia) || media !== null;
  const loose = messagePayload as Record<string, unknown>;
  const text = media?.kind === "sticker" ? null : resolveContent(messagePayload);

  return [
    {
      kind: "message",
      sessionKey: sessionName ?? "",
      externalIdentifier: channelIdentifier,
      message: {
        identity: { type: "WHATSAPP", value: contactWaId },
        externalMessageId: messagePayload.id ?? null,
        conversationExternalId: messagePayload.chatId ?? null,
        direction,
        text,
        hasMedia,
        media,
        replyToExternalId: reply.replyToExternalId,
        quotedText: reply.quotedText,
        ack:
          direction === "OUTBOUND" ? mapWahaAck(loose.ack, loose.ackName) : null,
        sentAt,
        raw: messagePayload,
      },
    },
  ];
}

function originalMessagePayload(body: unknown): Record<string, unknown> | null {
  const record = (body ?? {}) as Record<string, unknown>;
  const envelope =
    record.body && typeof record.body === "object"
      ? (record.body as Record<string, unknown>)
      : record;
  const payload = envelope.payload;
  return payload && typeof payload === "object"
    ? (payload as Record<string, unknown>)
    : null;
}

const ackWebhookSchema = z
  .object({
    event: z.literal("message.ack"),
    session: z.string().optional(),
    me: z.object({ id: z.string().optional() }).loose().optional().nullable(),
    payload: z
      .object({
        id: z.string(),
        ack: z.union([z.number(), z.string()]).optional().nullable(),
        ackName: z.string().optional().nullable(),
      })
      .loose(),
  })
  .loose();

/** message.ack: status de entrega de uma mensagem. */
function parseAck(body: Record<string, unknown>): ChannelEvent[] {
  const result = ackWebhookSchema.safeParse(body);
  if (!result.success) {
    throw new InvalidWebhookPayloadError("Invalid message.ack payload", result.error);
  }
  const { session, me, payload } = result.data;
  const ack = mapWahaAck(payload.ack, payload.ackName);
  if (!ack) {
    return [{ kind: "ignored", reason: "unknown-ack" }];
  }
  return [
    {
      kind: "ack",
      sessionKey: session ?? "",
      externalIdentifier: sanitizeWaId(me?.id),
      externalMessageId: payload.id,
      ack,
    },
  ];
}

/** Converte o corpo bruto de um webhook do WAHA em eventos normalizados. */
export function parseWahaWebhook(body: unknown): ChannelEvent[] {
  const record = (body ?? {}) as Record<string, unknown>;

  if (record.event === "session.status") {
    return parseSessionStatus(record);
  }

  if (record.event === "message.ack") {
    return parseAck(record);
  }

  return parseMessage(body);
}
