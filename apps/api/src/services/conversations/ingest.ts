import { MessageDirection, Prisma, type Channel } from "@prisma/client";
import type { NormalizedInboundMessage } from "../../channels/types";
import { emitDeskEvent } from "../../events/bus";
import { prisma } from "../../prisma";
import { scheduleConversationAnalysis } from "../conversation-analysis";
import { onInboundMessage } from "../desk/hooks";
import { createTimelineEventFromMessage } from "./timeline";

// ============================================================================
// Núcleo de conversas — agnóstico de canal.
// Recebe uma mensagem já normalizada pelo adaptador e persiste tudo:
// Contact/Identity/Conversation, Message, TimelineEvent e métricas.
// ============================================================================

export type IngestResult =
  | { skipped: true; reason: string }
  | { skipped: false; conversationId: string; messageId: string };

export interface IngestOptions {
  /** ID do registro cru guardado pelo adaptador (auditoria na timeline). */
  rawRecordId?: string;
}

/**
 * Grava uma mensagem recebida (ou enviada fora do app) em um canal.
 * Idempotente por [conversationId, externalId]: duplicada => `skipped`.
 */
export async function ingestChannelMessage(
  channel: Channel,
  message: NormalizedInboundMessage,
  options: IngestOptions = {},
): Promise<IngestResult> {
  const direction =
    message.direction === "INBOUND"
      ? MessageDirection.INBOUND
      : MessageDirection.OUTBOUND;
  const { sentAt } = message;

  // Contact + Identity: reaproveita a identidade, senão cria o contato.
  let identity = await prisma.identity.findUnique({
    where: {
      type_value: { type: message.identity.type, value: message.identity.value },
    },
    include: { contact: true },
  });

  if (!identity) {
    const created = await prisma.contact.create({
      data: {
        name: message.identity.displayName ?? undefined,
        avatarUrl: message.identity.avatarUrl ?? undefined,
      },
    });

    identity = await prisma.identity.create({
      data: {
        type: message.identity.type,
        value: message.identity.value,
        contactId: created.id,
      },
      include: { contact: true },
    });
  }

  const contact = identity.contact;

  let conversation = await prisma.conversation.findFirst({
    where: { contactId: contact.id, channelId: channel.id },
  });

  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: {
        contactId: contact.id,
        channelId: channel.id,
        externalId: message.conversationExternalId ?? null,
        firstMessageAt: sentAt,
        lastMessageAt: sentAt,
        firstInboundMessageAt:
          direction === MessageDirection.INBOUND ? sentAt : null,
        firstOutboundMessageAt:
          direction === MessageDirection.OUTBOUND ? sentAt : null,
        isStartedByContact: direction === MessageDirection.INBOUND,
        needsAnalysis: true,
      },
    });
  }

  try {
    const created = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        contactId: contact.id,
        identityId:
          direction === MessageDirection.INBOUND ? identity.id : undefined,
        direction,
        content: message.text,
        hasMedia: message.hasMedia,
        payload: message.raw as Prisma.JsonObject,
        externalId: message.externalMessageId,
        sentAt,
        requiresProcessing: true,
      },
    });

    const updated = await updateConversationMetrics(
      conversation,
      direction,
      sentAt,
    );

    await createTimelineEventFromMessage(prisma, {
      message: {
        id: created.id,
        conversationId: conversation.id,
        contactId: contact.id,
        direction,
        content: message.text,
        sentAt,
        externalId: message.externalMessageId,
        hasMedia: message.hasMedia,
      },
      channelType: channel.type,
      rawRecordId: options.rawRecordId,
    });

    if (process.env.GROQ_API_KEY) {
      scheduleConversationAnalysis(updated.id);
    }

    // Canais órfãos (sem operação) ainda não pertencem a nenhuma mesa.
    if (channel.operationId) {
      if (direction === MessageDirection.INBOUND) {
        await onInboundMessage(conversation.id, created.id);
      }
      emitDeskEvent({
        type: "message.created",
        operationId: channel.operationId,
        conversationId: conversation.id,
        messageId: created.id,
      });
    }

    return { skipped: false, conversationId: conversation.id, messageId: created.id };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return { skipped: true, reason: "duplicate-message" };
    }

    throw error;
  }
}

/** Atualiza timestamps, primeira resposta e contador de não lidas. */
async function updateConversationMetrics(
  conversation: NonNullable<
    Awaited<ReturnType<typeof prisma.conversation.findFirst>>
  >,
  direction: MessageDirection,
  sentAt: Date,
) {
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
    direction === MessageDirection.INBOUND;

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
    select: { id: true },
  });
}
