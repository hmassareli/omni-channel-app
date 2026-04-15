import {
  ChannelType,
  IdentityType,
  MessageDirection,
  Prisma,
} from "@prisma/client";
import { z } from "zod";
import { prisma } from "../prisma";
import { scheduleConversationAnalysis } from "./conversation-analysis";
import { createTimelineEventFromMessage } from "./message-timeline";

const payloadSchema = z
  .object({
    id: z.string().optional(),
    chatId: z.string().optional(),
    from: z.string().optional(),
    to: z.string().optional(),
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
      .optional(),
    payload: payloadSchema,
  })
  .loose();

export const whatsappWebhookSchema = z.union([
  z.object({ body: webhookBodySchema }).loose(),
  webhookBodySchema,
]);

export type WhatsappWebhookPayload = z.infer<typeof whatsappWebhookSchema>;

export type IngestResult =
  | { skipped: true; reason: string }
  | { skipped?: false; conversationId: string; messageId: string };

const webhookDebugEnabled =
  process.env.WHATSAPP_WEBHOOK_DEBUG?.toLowerCase() === "true";

function logWebhookDebug(stage: string, details: Record<string, unknown>) {
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

function endsWithJid(value: string | undefined, suffix: string) {
  return Boolean(value?.toLowerCase().endsWith(suffix));
}

function buildSkipDiagnostics(payload: z.infer<typeof payloadSchema>) {
  const hasTextBody = Boolean(payload.body && payload.body.trim().length > 0);
  const hasMedia = toBoolean(payload.hasMedia);
  const hasContent = hasTextBody || hasMedia;
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

export async function ingestWhatsappMessage(
  payload: WhatsappWebhookPayload,
): Promise<IngestResult> {
  const parsed = whatsappWebhookSchema.parse(payload);
  const envelope = webhookBodySchema.parse(
    "body" in parsed ? parsed.body : parsed,
  );
  const { me, payload: messagePayload, session: sessionName } = envelope;

  logWebhookDebug("ingest:start", {
    sessionName: sessionName ?? null,
    me: me ?? null,
    envelope,
  });

  const channelIdentifier = sanitizeWaId(me?.id);
  if (!channelIdentifier) {
    logWebhookDebug("ingest:skip-missing-channel", {
      sessionName: sessionName ?? null,
      me: me ?? null,
      messagePayload,
    });
    return { skipped: true, reason: "missing-channel-identifier" };
  }

  const skipDiagnostics = buildSkipDiagnostics(messagePayload);
  logWebhookDebug("ingest:filter-evaluation", {
    sessionName: sessionName ?? null,
    channelIdentifier,
    ...skipDiagnostics,
  });

  const skipResult = skipDiagnostics.reason;
  if (skipResult) {
    await prisma.rawWhatsappMessage.create({
      data: {
        wahaId: messagePayload.id ?? null,
        payload: payload as Prisma.JsonObject,
        processed: true,
      },
    });

    logWebhookDebug("ingest:skipped", {
      sessionName: sessionName ?? null,
      channelIdentifier,
      reason: skipResult,
      ...skipDiagnostics,
    });

    return { skipped: true, reason: skipResult };
  }

  const rawRecord = await prisma.rawWhatsappMessage.create({
    data: {
      wahaId: messagePayload.id ?? null,
      payload: payload as Prisma.JsonObject,
      processed: false,
    },
  });

  logWebhookDebug("ingest:raw-saved", {
    rawRecordId: rawRecord.id,
    wahaId: rawRecord.wahaId,
    sessionName: sessionName ?? null,
    channelIdentifier,
  });

  const direction = messagePayload.fromMe
    ? MessageDirection.OUTBOUND
    : MessageDirection.INBOUND;

  const rawContactId = messagePayload.fromMe
    ? (messagePayload.to ?? messagePayload.chatId)
    : messagePayload.from;

  let contactWaId = sanitizeWaId(rawContactId);

  logWebhookDebug("ingest:contact-resolution", {
    sessionName: sessionName ?? null,
    channelIdentifier,
    direction,
    rawContactId: rawContactId ?? null,
    sanitizedContactWaId: contactWaId,
    fromMe: messagePayload.fromMe,
    from: messagePayload.from ?? null,
    to: messagePayload.to ?? null,
    chatId: messagePayload.chatId ?? null,
  });

  if (!contactWaId) {
    await prisma.rawWhatsappMessage.update({
      where: { id: rawRecord.id },
      data: { processed: true },
    });

    logWebhookDebug("ingest:skip-missing-contact", {
      rawRecordId: rawRecord.id,
      sessionName: sessionName ?? null,
      channelIdentifier,
      rawContactId: rawContactId ?? null,
      fromMe: messagePayload.fromMe,
      from: messagePayload.from ?? null,
      to: messagePayload.to ?? null,
      chatId: messagePayload.chatId ?? null,
    });

    return { skipped: true, reason: "missing-contact-identifier" };
  }

  // Resolve LID → telefone real via _data.remoteJidAlt
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

    logWebhookDebug("ingest:lid-resolution", {
      rawRecordId: rawRecord.id,
      sessionName: sessionName ?? null,
      originalLid,
      remoteJidAlt: messagePayload._data?.remoteJidAlt ?? null,
      resolvedContactWaId: contactWaId,
    });
  }

  const sentAt = resolveTimestamp(messagePayload);
  const messageContent = resolveContent(messagePayload);

  logWebhookDebug("ingest:message-normalized", {
    rawRecordId: rawRecord.id,
    sessionName: sessionName ?? null,
    channelIdentifier,
    contactWaId,
    direction,
    sentAt: sentAt.toISOString(),
    contentPreview: previewText(messageContent),
    hasMedia: toBoolean(messagePayload.hasMedia),
    externalId: messagePayload.id ?? null,
  });

  // Tenta encontrar o channel pelo externalIdentifier (número do WhatsApp)
  let channel = await prisma.channel.findFirst({
    where: {
      type: ChannelType.WHATSAPP,
      externalIdentifier: channelIdentifier,
    },
  });

  // Se não encontrou, tenta pelo sessionName (nome da sessão WAHA)
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

      logWebhookDebug("ingest:channel-found-by-session", {
        rawRecordId: rawRecord.id,
        sessionName,
        channelId: channel.id,
        channelName: channel.name,
        channelIdentifier,
      });
    }
  }

  // Se ainda não encontrou, cria um novo channel (sem operationId - órfão)
  if (!channel) {
    console.log(`[Ingest] Criando channel órfão para ${channelIdentifier}`);
    channel = await prisma.channel.create({
      data: {
        name: `WhatsApp ${channelIdentifier}`,
        type: ChannelType.WHATSAPP,
        externalIdentifier: channelIdentifier,
        metadata: messagePayload.apiKey
          ? ({ apiKey: messagePayload.apiKey } satisfies Prisma.JsonObject)
          : undefined,
      },
    });

    logWebhookDebug("ingest:channel-created-orphan", {
      rawRecordId: rawRecord.id,
      sessionName: sessionName ?? null,
      channelId: channel.id,
      channelName: channel.name,
      channelIdentifier,
    });
  }

  if (channel) {
    logWebhookDebug("ingest:channel-selected", {
      rawRecordId: rawRecord.id,
      sessionName: sessionName ?? null,
      channelId: channel.id,
      channelName: channel.name,
      channelIdentifier,
      operationId: channel.operationId ?? null,
    });
  }

  let identity = await prisma.identity.findUnique({
    where: {
      type_value: {
        type: IdentityType.WHATSAPP,
        value: contactWaId,
      },
    },
    include: { contact: true },
  });

  if (!identity) {
    const contact = await prisma.contact.create({
      data: {},
    });

    identity = await prisma.identity.create({
      data: {
        type: IdentityType.WHATSAPP,
        value: contactWaId,
        contactId: contact.id,
      },
      include: { contact: true },
    });

    logWebhookDebug("ingest:identity-created", {
      rawRecordId: rawRecord.id,
      contactId: contact.id,
      identityId: identity.id,
      contactWaId,
    });
  }

  logWebhookDebug("ingest:identity-selected", {
    rawRecordId: rawRecord.id,
    contactId: identity.contact.id,
    identityId: identity.id,
    contactWaId,
    companyId: identity.contact.companyId ?? null,
  });

  const contact = identity.contact;

  let conversation = await prisma.conversation.findFirst({
    where: {
      contactId: contact.id,
      channelId: channel.id,
    },
  });

  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: {
        contactId: contact.id,
        channelId: channel.id,
        externalId: messagePayload.chatId ?? null,
        firstMessageAt: sentAt,
        lastMessageAt: sentAt,
        firstInboundMessageAt:
          direction === MessageDirection.INBOUND ? sentAt : null,
        firstOutboundMessageAt:
          direction === MessageDirection.OUTBOUND ? sentAt : null,
        isStartedByContact:
          direction === MessageDirection.INBOUND ? true : false,
        needsAnalysis: true,
      },
    });

    logWebhookDebug("ingest:conversation-created", {
      rawRecordId: rawRecord.id,
      conversationId: conversation.id,
      contactId: contact.id,
      channelId: channel.id,
      externalId: messagePayload.chatId ?? null,
    });
  }

  logWebhookDebug("ingest:conversation-selected", {
    rawRecordId: rawRecord.id,
    conversationId: conversation.id,
    contactId: contact.id,
    channelId: channel.id,
    externalId: conversation.externalId ?? null,
  });

  try {
    const message = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        contactId: contact.id,
        identityId:
          direction === MessageDirection.INBOUND ? identity.id : undefined,
        direction,
        content: messageContent,
        hasMedia: toBoolean(messagePayload.hasMedia),
        payload: messagePayload as Prisma.JsonObject,
        externalId: messagePayload.id ?? null,
        sentAt,
        requiresProcessing: true,
      },
    });

    logWebhookDebug("ingest:message-created", {
      rawRecordId: rawRecord.id,
      messageId: message.id,
      conversationId: conversation.id,
      contactId: contact.id,
      direction,
      externalId: message.externalId ?? null,
      sentAt: message.sentAt.toISOString(),
    });

    const conversationUpdate = await updateConversationTimestamps(
      conversation,
      direction,
      sentAt,
    );

    logWebhookDebug("ingest:conversation-updated", {
      rawRecordId: rawRecord.id,
      conversationId: conversationUpdate.id,
      firstMessageAt: conversationUpdate.firstMessageAt.toISOString(),
      lastMessageAt: conversationUpdate.lastMessageAt.toISOString(),
      firstInboundMessageAt:
        conversationUpdate.firstInboundMessageAt?.toISOString() ?? null,
      firstOutboundMessageAt:
        conversationUpdate.firstOutboundMessageAt?.toISOString() ?? null,
      needsAnalysis: conversationUpdate.needsAnalysis,
    });

    await createTimelineEventFromMessage(prisma, {
      message: {
        id: message.id,
        conversationId: conversation.id,
        contactId: contact.id,
        direction,
        content: messageContent,
        sentAt,
        externalId: messagePayload.id ?? null,
        hasMedia: toBoolean(messagePayload.hasMedia),
      },
      channelType: channel.type,
      rawRecordId: rawRecord.id,
    });

    logWebhookDebug("ingest:timeline-created", {
      rawRecordId: rawRecord.id,
      conversationId: conversation.id,
      contactId: contact.id,
      direction,
      channelType: channel.type,
    });

    await prisma.rawWhatsappMessage.update({
      where: { id: rawRecord.id },
      data: { processed: true },
    });

    logWebhookDebug("ingest:raw-processed", {
      rawRecordId: rawRecord.id,
      processed: true,
    });

    if (process.env.GROQ_API_KEY) {
      scheduleConversationAnalysis(conversationUpdate.id);

      logWebhookDebug("ingest:analysis-scheduled", {
        rawRecordId: rawRecord.id,
        conversationId: conversationUpdate.id,
      });
    }

    logWebhookDebug("ingest:completed", {
      rawRecordId: rawRecord.id,
      conversationId: conversationUpdate.id,
      messageId: message.id,
    });

    return { conversationId: conversationUpdate.id, messageId: message.id };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      await prisma.rawWhatsappMessage.update({
        where: { id: rawRecord.id },
        data: { processed: true },
      });

      logWebhookDebug("ingest:duplicate-message", {
        rawRecordId: rawRecord.id,
        reason: "duplicate-message",
        prismaCode: error.code,
        target: error.meta?.target ?? null,
      });

      return { skipped: true, reason: "duplicate-message" };
    }

    logWebhookDebug("ingest:error", {
      rawRecordId: rawRecord.id,
      error:
        error instanceof Error
          ? {
              name: error.name,
              message: error.message,
              stack: error.stack,
            }
          : { value: String(error) },
    });

    throw error;
  }
}

function sanitizeWaId(value?: string | null): string | null {
  if (!value) {
    return null;
  }

  const [identifier] = value.split("@");
  return identifier?.trim() || null;
}

function toBoolean(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    return value.toLowerCase() === "true";
  }

  return false;
}

function resolveTimestamp(payload: z.infer<typeof payloadSchema>): Date {
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

function resolveContent(payload: z.infer<typeof payloadSchema>): string {
  if (toBoolean(payload.hasMedia)) {
    return "<media>";
  }

  const text = payload.body ?? "";
  return text.trim();
}

async function updateConversationTimestamps(
  conversation: Awaited<ReturnType<typeof prisma.conversation.findFirst>>,
  direction: MessageDirection,
  sentAt: Date,
) {
  if (!conversation) {
    throw new Error("Conversation not found while updating timestamps");
  }

  const data: Prisma.ConversationUpdateInput = {
    lastMessageAt: sentAt,
    needsAnalysis: true,
  };

  if (sentAt < conversation.firstMessageAt) {
    data.firstMessageAt = sentAt;
  }

  if (
    !conversation.firstInboundMessageAt &&
    direction === MessageDirection.INBOUND
  ) {
    data.firstInboundMessageAt = sentAt;
  }

  if (
    !conversation.firstOutboundMessageAt &&
    direction === MessageDirection.OUTBOUND
  ) {
    data.firstOutboundMessageAt = sentAt;
  }

  const effectiveIsStarted =
    conversation.isStartedByContact ??
    (direction === MessageDirection.INBOUND ? true : false);

  if (
    conversation.isStartedByContact === null ||
    conversation.isStartedByContact === undefined
  ) {
    data.isStartedByContact = effectiveIsStarted;
  }

  const firstInbound =
    conversation.firstInboundMessageAt ??
    (data.firstInboundMessageAt as Date | undefined);

  if (
    direction === MessageDirection.OUTBOUND &&
    effectiveIsStarted &&
    firstInbound &&
    !conversation.firstResponseAt
  ) {
    data.firstResponseAt = sentAt;
    data.timeToFirstInteraction = Math.max(
      0,
      Math.round((sentAt.getTime() - firstInbound.getTime()) / 1000),
    );
  }

  return prisma.conversation.update({
    where: { id: conversation.id },
    data,
    select: {
      id: true,
      firstMessageAt: true,
      lastMessageAt: true,
      firstInboundMessageAt: true,
      firstOutboundMessageAt: true,
      needsAnalysis: true,
    },
  });
}
