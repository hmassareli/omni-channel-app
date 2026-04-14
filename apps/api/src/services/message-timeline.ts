import {
  ChannelType,
  EventType,
  MessageDirection,
  Prisma,
} from "@prisma/client";
import { prisma } from "../prisma";

type DbClient = Prisma.TransactionClient | typeof prisma;

type TimelineMessagePayload = {
  id: string;
  conversationId: string;
  contactId: string | null;
  direction: MessageDirection;
  content: string | null;
  sentAt: Date;
  externalId: string | null;
  hasMedia?: boolean;
};

function resolveTimelineContent(message: TimelineMessagePayload) {
  if (message.content && message.content.trim()) {
    return message.content;
  }

  if (message.hasMedia) {
    return "<media>";
  }

  return "<mensagem sem texto>";
}

function buildEventKey(params: {
  type: EventType;
  occurredAt: Date;
  content: string;
}) {
  return `${params.type}|${params.occurredAt.toISOString()}|${params.content}`;
}

export async function createTimelineEventFromMessage(
  client: DbClient,
  params: {
    message: TimelineMessagePayload;
    channelType?: ChannelType;
    rawRecordId?: string;
  },
) {
  if (!params.message.contactId) {
    return null;
  }

  const content = resolveTimelineContent(params.message);

  return client.timelineEvent.create({
    data: {
      contactId: params.message.contactId,
      conversationId: params.message.conversationId,
      type:
        params.message.direction === MessageDirection.INBOUND
          ? EventType.MESSAGE_RECEIVED
          : EventType.MESSAGE_SENT,
      content,
      metadata: {
        channel: params.channelType,
        whatsapp:
          params.channelType === ChannelType.WHATSAPP
            ? {
                messageId: params.message.id,
                externalMessageId: params.message.externalId,
                rawRecordId: params.rawRecordId,
              }
            : undefined,
      },
      occurredAt: params.message.sentAt,
    },
  });
}

export async function backfillConversationTimelineEvents(
  conversationId: string,
  client: DbClient = prisma,
) {
  const conversation = await client.conversation.findUnique({
    where: { id: conversationId },
    include: {
      channel: { select: { type: true } },
      messages: {
        select: {
          id: true,
          conversationId: true,
          contactId: true,
          direction: true,
          content: true,
          sentAt: true,
          externalId: true,
          hasMedia: true,
        },
        orderBy: { sentAt: "asc" },
      },
      events: {
        where: {
          type: { in: [EventType.MESSAGE_RECEIVED, EventType.MESSAGE_SENT] },
        },
        select: {
          type: true,
          content: true,
          occurredAt: true,
        },
      },
    },
  });

  if (!conversation) {
    return 0;
  }

  const existingKeys = new Set(
    conversation.events.map((event) =>
      buildEventKey({
        type: event.type,
        occurredAt: event.occurredAt,
        content: event.content,
      }),
    ),
  );

  let createdCount = 0;

  for (const message of conversation.messages) {
    if (!message.contactId) {
      continue;
    }

    const content = resolveTimelineContent(message);
    const type =
      message.direction === MessageDirection.INBOUND
        ? EventType.MESSAGE_RECEIVED
        : EventType.MESSAGE_SENT;

    const eventKey = buildEventKey({
      type,
      occurredAt: message.sentAt,
      content,
    });

    if (existingKeys.has(eventKey)) {
      continue;
    }

    await createTimelineEventFromMessage(client, {
      message,
      channelType: conversation.channel.type,
    });

    existingKeys.add(eventKey);
    createdCount += 1;
  }

  return createdCount;
}

export async function backfillContactTimelineEvents(
  contactId: string,
  client: DbClient = prisma,
) {
  const conversations = await client.conversation.findMany({
    where: { contactId },
    select: { id: true },
  });

  let createdCount = 0;

  for (const conversation of conversations) {
    createdCount += await backfillConversationTimelineEvents(
      conversation.id,
      client,
    );
  }

  return createdCount;
}