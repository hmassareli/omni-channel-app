import { Prisma } from "@prisma/client";
import type { AuthenticatedUser } from "../../middleware/auth";
import { prisma } from "../../prisma";

/** Erro de regra de negócio da mesa; as rotas convertem em resposta HTTP. */
export class DeskError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "DeskError";
  }
}

/** Quem está agindo: usuário autenticado + agente vinculado (se houver). */
export interface DeskActor {
  userId: string;
  role: AuthenticatedUser["role"];
  operationId: string;
  agentId: string | null;
}

export async function resolveActor(user: AuthenticatedUser): Promise<DeskActor> {
  if (!user.operationId) {
    throw new DeskError(403, "Usuário sem operação vinculada");
  }
  const agent = await prisma.agent.findUnique({
    where: { userId: user.id },
    select: { id: true, operationId: true },
  });
  return {
    userId: user.id,
    role: user.role,
    operationId: user.operationId,
    agentId: agent && agent.operationId === user.operationId ? agent.id : null,
  };
}

export function isPrivileged(actor: DeskActor) {
  return actor.role === "ADMIN" || actor.role === "MANAGER";
}

/**
 * Filtro de visibilidade das conversas.
 * ADMIN/MANAGER: toda a operação. AGENT: as suas + não atribuídas
 * (sem fila, ou de filas das quais é membro).
 */
export async function conversationScope(
  actor: DeskActor,
): Promise<Prisma.ConversationWhereInput> {
  const base: Prisma.ConversationWhereInput = {
    channel: { operationId: actor.operationId },
  };
  if (isPrivileged(actor)) return base;

  const visibility: Prisma.ConversationWhereInput[] = [];
  if (actor.agentId) visibility.push({ assignedAgentId: actor.agentId });
  visibility.push({
    assignedAgentId: null,
    OR: [
      { queueId: null },
      ...(actor.agentId
        ? [{ queue: { members: { some: { agentId: actor.agentId } } } }]
        : []),
    ],
  });
  return { ...base, OR: visibility };
}

/** Carrega a conversa se o ator puder vê-la; senão 404. */
export async function getVisibleConversation(actor: DeskActor, id: string) {
  const scope = await conversationScope(actor);
  const conversation = await prisma.conversation.findFirst({
    where: { AND: [{ id }, scope] },
    include: {
      channel: true,
      contact: { include: { identities: true } },
    },
  });
  if (!conversation) throw new DeskError(404, "Conversa não encontrada");
  return conversation;
}
