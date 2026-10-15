import { ConversationStatus, EventType, Prisma } from "@prisma/client";
import { emitDeskEvent } from "../../events/bus";
import { prisma } from "../../prisma";
import {
  DeskActor,
  DeskError,
  getVisibleConversation,
  isPrivileged,
} from "./access";
import { emitMessageCreated, sendAndStoreMessage } from "./outbound";
import { loadConversationDetail } from "./queries";

export const CSAT_QUESTION = "De 1 a 5, como avalia o atendimento?";

function emitUpdated(actor: { operationId: string }, conversationId: string) {
  emitDeskEvent({
    type: "conversation.updated",
    operationId: actor.operationId,
    conversationId,
  });
}

// ----------------------------------------------------------------------------
// Atribuição
// ----------------------------------------------------------------------------

export async function assignConversation(
  actor: DeskActor,
  conversationId: string,
  input: { agentId?: string | null; queueId?: string | null },
) {
  const conversation = await getVisibleConversation(actor, conversationId);
  const data: Prisma.ConversationUncheckedUpdateInput = {};
  const privileged = isPrivileged(actor);

  if (input.agentId !== undefined) {
    if (input.agentId !== null) {
      const agent = await prisma.agent.findFirst({
        where: { id: input.agentId, operationId: actor.operationId },
        select: { id: true },
      });
      if (!agent) throw new DeskError(404, "Agente não encontrado");
    }
    if (!privileged) {
      // AGENT só pode assumir para si (se livre) ou devolver a própria conversa.
      const takesForSelf =
        input.agentId === actor.agentId && !conversation.assignedAgentId;
      const releasesOwn =
        input.agentId === null && conversation.assignedAgentId === actor.agentId;
      const keeps = input.agentId === conversation.assignedAgentId;
      if (!takesForSelf && !releasesOwn && !keeps) {
        throw new DeskError(403, "Permissão insuficiente para atribuir");
      }
    }
    data.assignedAgentId = input.agentId;
  }

  if (input.queueId !== undefined) {
    if (!privileged) {
      throw new DeskError(403, "Permissão insuficiente para alterar a fila");
    }
    if (input.queueId !== null) {
      const queue = await prisma.queue.findFirst({
        where: { id: input.queueId, operationId: actor.operationId },
        select: { id: true },
      });
      if (!queue) throw new DeskError(404, "Fila não encontrada");
    }
    data.queueId = input.queueId;
  }

  if (Object.keys(data).length > 0) {
    await prisma.conversation.update({ where: { id: conversationId }, data });
    if (
      data.assignedAgentId !== undefined &&
      data.assignedAgentId !== conversation.assignedAgentId
    ) {
      await prisma.timelineEvent.create({
        data: {
          contactId: conversation.contactId,
          conversationId,
          type: EventType.SYSTEM_LOG,
          content: data.assignedAgentId
            ? "Conversa atribuída"
            : "Conversa devolvida para a fila",
          metadata: {
            kind: "ASSIGNED",
            agentId: (data.assignedAgentId as string | null) ?? null,
            previousAgentId: conversation.assignedAgentId,
            byUserId: actor.userId,
          },
        },
      });
    }
    emitUpdated(actor, conversationId);
  }

  return loadConversationDetail(conversationId);
}

// ----------------------------------------------------------------------------
// Status / CSAT
// ----------------------------------------------------------------------------

export async function changeStatus(
  actor: DeskActor,
  conversationId: string,
  status: ConversationStatus,
) {
  const conversation = await getVisibleConversation(actor, conversationId);
  if (conversation.status === status) {
    return loadConversationDetail(conversationId);
  }

  const resolving = status === ConversationStatus.RESOLVED;
  await prisma.conversation.update({
    where: { id: conversationId },
    data: {
      status,
      resolvedAt: resolving ? new Date() : null,
      // Reabrir cancela a espera por nota de CSAT.
      ...(resolving ? {} : { csatRequestedAt: null }),
    },
  });

  await prisma.timelineEvent.create({
    data: {
      contactId: conversation.contactId,
      conversationId,
      type: EventType.SYSTEM_LOG,
      content: resolving
        ? "Conversa resolvida"
        : conversation.status === ConversationStatus.RESOLVED
          ? "Conversa reaberta"
          : `Status alterado para ${status}`,
      metadata: {
        kind: "STATUS_CHANGE",
        from: conversation.status,
        to: status,
        byUserId: actor.userId,
      },
    },
  });

  if (resolving) {
    await requestCsat(actor, conversation);
  }

  emitUpdated(actor, conversationId);
  return loadConversationDetail(conversationId);
}

/** Envia a pergunta de CSAT; falha de envio não impede a resolução. */
async function requestCsat(
  actor: DeskActor,
  conversation: Awaited<ReturnType<typeof getVisibleConversation>>,
) {
  try {
    const message = await sendAndStoreMessage({
      conversation,
      text: CSAT_QUESTION,
      sentByAgentId: null,
      metadata: { csatRequest: true },
    });
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { csatRequestedAt: new Date(), lastMessageAt: message.sentAt },
    });
    emitMessageCreated(actor.operationId, conversation.id, message.id);
  } catch (error) {
    console.error("[Desk] não foi possível enviar a pergunta de CSAT:", error);
  }
}

// ----------------------------------------------------------------------------
// Notas, leitura, mensagens
// ----------------------------------------------------------------------------

export async function addNote(
  actor: DeskActor,
  conversationId: string,
  text: string,
) {
  const conversation = await getVisibleConversation(actor, conversationId);
  const event = await prisma.timelineEvent.create({
    data: {
      contactId: conversation.contactId,
      conversationId,
      type: EventType.NOTE,
      content: text,
      metadata: { byUserId: actor.userId, byAgentId: actor.agentId },
    },
  });
  emitUpdated(actor, conversationId);
  return event;
}

export async function listNotes(actor: DeskActor, conversationId: string) {
  await getVisibleConversation(actor, conversationId);
  return prisma.timelineEvent.findMany({
    where: { conversationId, type: EventType.NOTE },
    orderBy: { occurredAt: "asc" },
  });
}

export async function markRead(actor: DeskActor, conversationId: string) {
  await getVisibleConversation(actor, conversationId);
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { unreadCount: 0 },
  });
  emitUpdated(actor, conversationId);
}

export async function sendAgentMessage(
  actor: DeskActor,
  conversationId: string,
  text: string,
) {
  const conversation = await getVisibleConversation(actor, conversationId);

  const message = await sendAndStoreMessage({
    conversation,
    text,
    sentByAgentId: actor.agentId,
  });

  const data: Prisma.ConversationUncheckedUpdateInput = {
    lastMessageAt: message.sentAt,
    needsAnalysis: true,
    unreadCount: 0,
  };
  if (!conversation.firstOutboundMessageAt) {
    data.firstOutboundMessageAt = message.sentAt;
  }
  const firstInbound = conversation.firstInboundMessageAt;
  if (
    !conversation.firstResponseAt &&
    firstInbound &&
    conversation.isStartedByContact !== false
  ) {
    data.firstResponseAt = message.sentAt;
    data.timeToFirstInteraction = Math.max(
      0,
      Math.round((message.sentAt.getTime() - firstInbound.getTime()) / 1000),
    );
  }
  // Quem responde assume uma conversa sem responsável; responder reabre.
  if (!conversation.assignedAgentId && actor.agentId) {
    data.assignedAgentId = actor.agentId;
  }
  if (conversation.status === ConversationStatus.RESOLVED) {
    data.status = ConversationStatus.OPEN;
    data.resolvedAt = null;
    data.csatRequestedAt = null;
  }

  await prisma.conversation.update({ where: { id: conversationId }, data });
  emitMessageCreated(actor.operationId, conversationId, message.id);
  return message;
}
