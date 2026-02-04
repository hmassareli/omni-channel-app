import {
  ChannelType,
  EventType,
  IdentityType,
  MessageDirection,
  Prisma,
} from "@prisma/client";
import { z } from "zod";
import { prisma } from "../prisma";
import { scheduleConversationAnalysis } from "./conversation-analysis";

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

export async function ingestWhatsappMessage(
  payload: WhatsappWebhookPayload
): Promise<IngestResult> {
  const parsed = whatsappWebhookSchema.parse(payload);
  const envelope = webhookBodySchema.parse(
    "body" in parsed ? parsed.body : parsed
  );
  const { me, payload: messagePayload, session: sessionName } = envelope;

  const channelIdentifier = sanitizeWaId(me?.id);
  if (!channelIdentifier) {
    return { skipped: true, reason: "missing-channel-identifier" };
  }

  const skipResult = shouldSkipMessage(messagePayload);
  if (skipResult) {
    await prisma.rawWhatsappMessage.create({
      data: {
        wahaId: messagePayload.id ?? null,
        payload: payload as Prisma.JsonObject,
        processed: true,
      },
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

  const direction = messagePayload.fromMe
    ? MessageDirection.OUTBOUND
    : MessageDirection.INBOUND;

  const contactWaId = sanitizeWaId(
    messagePayload.fromMe
      ? messagePayload.to ?? messagePayload.chatId
      : messagePayload.from
  );

  if (!contactWaId) {
    await prisma.rawWhatsappMessage.update({
      where: { id: rawRecord.id },
      data: { processed: true },
    });

    return { skipped: true, reason: "missing-contact-identifier" };
  }

  const sentAt = resolveTimestamp(messagePayload);
  const messageContent = resolveContent(messagePayload);

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
      
      console.log(`[Ingest] Channel ${channel.name} atualizado com externalIdentifier: ${channelIdentifier}`);
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
  }

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
  }

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

    const conversationUpdate = await updateConversationTimestamps(
      conversation,
      direction,
      sentAt
    );

    await prisma.timelineEvent.create({
      data: {
        contactId: contact.id,
        conversationId: conversation.id,
        type:
          direction === MessageDirection.INBOUND
            ? EventType.MESSAGE_RECEIVED
            : EventType.MESSAGE_SENT,
        content: messageContent,
        metadata: {
          channel: channel.type,
          whatsapp: {
            rawRecordId: rawRecord.id,
            externalMessageId: messagePayload.id,
          },
        },
        occurredAt: sentAt,
      },
    });

    await prisma.rawWhatsappMessage.update({
      where: { id: rawRecord.id },
      data: { processed: true },
    });

    if (process.env.GROQ_API_KEY) {
      scheduleConversationAnalysis(conversationUpdate.id);
    }

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
      return { skipped: true, reason: "duplicate-message" };
    }

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

function shouldSkipMessage(
  payload: z.infer<typeof payloadSchema>
): string | null {
  const hasContent = Boolean(
    (payload.body && payload.body.trim().length > 0) ||
      toBoolean(payload.hasMedia)
  );

  if (!hasContent) {
    return "empty-message";
  }

  const isGroupChat = Boolean(
    payload.participant ||
      payload.isDefaultSubgroup !== undefined ||
      (payload.id &&
        (payload.id.includes("@newsletter") ||
          payload.id.includes("broadcast")))
  );

  if (isGroupChat) {
    return "group-message";
  }

  return null;
}

async function updateConversationTimestamps(
  conversation: Awaited<ReturnType<typeof prisma.conversation.findFirst>>,
  direction: MessageDirection,
  sentAt: Date
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
      Math.round((sentAt.getTime() - firstInbound.getTime()) / 1000)
    );
  }

  return prisma.conversation.update({
    where: { id: conversation.id },
    data,
    select: {
      id: true,
    },
  });
}
