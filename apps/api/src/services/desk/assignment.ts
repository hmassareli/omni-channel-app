import { ConversationStatus, EventType } from "@prisma/client";
import { emitDeskEvent } from "../../events/bus";
import { prisma } from "../../prisma";

/**
 * Distribuição automática: escolhe, entre os membros da fila da conversa,
 * o agente com menos conversas abertas (OPEN/PENDING); desempate por quem
 * recebeu atribuição há mais tempo (round-robin aproximado).
 * Sem fila ou sem membros: não atribui. Devolve o agentId escolhido ou null.
 * Nunca sobrescreve um responsável já definido.
 */
export async function autoAssign(conversationId: string): Promise<string | null> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: {
      id: true,
      contactId: true,
      assignedAgentId: true,
      queueId: true,
      channel: { select: { operationId: true } },
    },
  });
  const operationId = conversation?.channel.operationId;
  if (!conversation || !operationId) return null;
  if (conversation.assignedAgentId || !conversation.queueId) return null;

  const members = await prisma.queueMember.findMany({
    where: { queueId: conversation.queueId, agent: { operationId } },
    select: { agentId: true },
  });
  if (members.length === 0) return null;
  const agentIds = members.map((m) => m.agentId);

  const [loads, lastAssigned] = await Promise.all([
    prisma.conversation.groupBy({
      by: ["assignedAgentId"],
      where: {
        assignedAgentId: { in: agentIds },
        status: { in: [ConversationStatus.OPEN, ConversationStatus.PENDING] },
      },
      _count: { _all: true },
    }),
    prisma.conversation.groupBy({
      by: ["assignedAgentId"],
      where: { assignedAgentId: { in: agentIds } },
      _max: { updatedAt: true },
    }),
  ]);

  const load = new Map(loads.map((l) => [l.assignedAgentId!, l._count._all]));
  const last = new Map(
    lastAssigned.map((l) => [l.assignedAgentId!, l._max.updatedAt?.getTime() ?? 0]),
  );

  const chosen = [...agentIds].sort(
    (a, b) =>
      (load.get(a) ?? 0) - (load.get(b) ?? 0) ||
      (last.get(a) ?? 0) - (last.get(b) ?? 0),
  )[0];

  // Condição no where evita corrida com atribuição manual simultânea.
  const updated = await prisma.conversation.updateMany({
    where: { id: conversationId, assignedAgentId: null },
    data: { assignedAgentId: chosen },
  });
  if (updated.count === 0) return null;

  await prisma.timelineEvent.create({
    data: {
      contactId: conversation.contactId,
      conversationId,
      type: EventType.SYSTEM_LOG,
      content: "Conversa atribuída automaticamente",
      metadata: { kind: "ASSIGNED", agentId: chosen, auto: true },
    },
  });
  emitDeskEvent({ type: "conversation.updated", operationId, conversationId });
  return chosen;
}
