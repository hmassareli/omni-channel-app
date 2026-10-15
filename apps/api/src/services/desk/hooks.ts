import { ConversationStatus, MessageDirection } from "@prisma/client";
import { emitDeskEvent } from "../../events/bus";
import { prisma } from "../../prisma";
import { autoAssign } from "./assignment";

/**
 * Chamado pelo núcleo de ingestão após gravar uma mensagem INBOUND.
 * - incrementa unreadCount
 * - conversa RESOLVED: se aguardava CSAT e a mensagem é um dígito 1-5, grava a
 *   nota (e não reabre); caso contrário reabre (OPEN, resolvedAt=null)
 * - sem responsável: tenta distribuição automática pela fila
 * - emite conversation.updated
 *
 * @param conversationId conversa que recebeu a mensagem
 * @param messageId (opcional) mensagem recebida; se ausente usa a última INBOUND
 */
export async function onInboundMessage(
  conversationId: string,
  messageId?: string,
): Promise<void> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: {
      id: true,
      status: true,
      assignedAgentId: true,
      csatRequestedAt: true,
      channel: { select: { operationId: true } },
    },
  });
  if (!conversation) return;
  const operationId = conversation.channel.operationId;
  const emit = () => {
    if (operationId) {
      emitDeskEvent({ type: "conversation.updated", operationId, conversationId });
    }
  };

  if (conversation.status === ConversationStatus.RESOLVED) {
    const message = await prisma.message.findFirst({
      where: {
        conversationId,
        direction: MessageDirection.INBOUND,
        ...(messageId ? { id: messageId } : {}),
      },
      orderBy: { sentAt: "desc" },
      select: { content: true },
    });
    const score = parseCsatScore(message?.content);

    if (conversation.csatRequestedAt && score !== null) {
      await prisma.$transaction([
        prisma.csatResponse.upsert({
          where: { conversationId },
          create: { conversationId, score },
          update: { score },
        }),
        prisma.conversation.update({
          where: { id: conversationId },
          data: { csatRequestedAt: null },
        }),
      ]);
      emit();
      return;
    }

    await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        status: ConversationStatus.OPEN,
        resolvedAt: null,
        csatRequestedAt: null,
        unreadCount: { increment: 1 },
      },
    });
  } else {
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { unreadCount: { increment: 1 } },
    });
  }

  if (!conversation.assignedAgentId) {
    await autoAssign(conversationId);
  }
  emit();
}

/** Aceita somente um dígito de 1 a 5 (espaços/pontuação final tolerados). */
export function parseCsatScore(text: string | null | undefined): number | null {
  const match = text?.trim().match(/^([1-5])[.!\s]*$/);
  return match ? Number(match[1]) : null;
}
