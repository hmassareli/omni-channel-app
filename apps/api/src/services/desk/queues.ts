import { Prisma } from "@prisma/client";
import { prisma } from "../../prisma";
import { DeskError } from "./access";

const queueSelect = {
  id: true,
  name: true,
  members: {
    select: { agent: { select: { id: true, name: true, avatarUrl: true } } },
  },
} satisfies Prisma.QueueSelect;

type QueueRow = Prisma.QueueGetPayload<{ select: typeof queueSelect }>;

function toQueue(q: QueueRow) {
  return {
    id: q.id,
    name: q.name,
    members: q.members.map((m) => m.agent),
  };
}

async function loadQueue(operationId: string, id: string) {
  const queue = await prisma.queue.findFirst({
    where: { id, operationId },
    select: queueSelect,
  });
  if (!queue) throw new DeskError(404, "Fila não encontrada");
  return toQueue(queue);
}

export async function listQueues(operationId: string) {
  const queues = await prisma.queue.findMany({
    where: { operationId },
    select: queueSelect,
    orderBy: { name: "asc" },
  });
  return queues.map(toQueue);
}

function isUniqueViolation(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
  );
}

export async function createQueue(operationId: string, name: string) {
  try {
    const queue = await prisma.queue.create({
      data: { operationId, name },
      select: queueSelect,
    });
    return toQueue(queue);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new DeskError(409, "Já existe uma fila com esse nome");
    }
    throw error;
  }
}

export async function updateQueue(operationId: string, id: string, name: string) {
  await loadQueue(operationId, id);
  try {
    const queue = await prisma.queue.update({
      where: { id },
      data: { name },
      select: queueSelect,
    });
    return toQueue(queue);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new DeskError(409, "Já existe uma fila com esse nome");
    }
    throw error;
  }
}

/** Remove a fila; conversas dela ficam sem fila (FK SET NULL). */
export async function deleteQueue(operationId: string, id: string) {
  await loadQueue(operationId, id);
  await prisma.queue.delete({ where: { id } });
}

/** Substitui a lista de membros; agentes devem ser da mesma operação. */
export async function setQueueMembers(
  operationId: string,
  id: string,
  agentIds: string[],
) {
  await loadQueue(operationId, id);
  const unique = [...new Set(agentIds)];
  const valid = await prisma.agent.count({
    where: { id: { in: unique }, operationId },
  });
  if (valid !== unique.length) {
    throw new DeskError(400, "Agente inválido para esta operação");
  }
  await prisma.$transaction([
    prisma.queueMember.deleteMany({ where: { queueId: id } }),
    prisma.queueMember.createMany({
      data: unique.map((agentId) => ({ queueId: id, agentId })),
    }),
  ]);
  return loadQueue(operationId, id);
}
