import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../prisma";
import { authMiddleware } from "../../middleware/auth";

// ============================================================================
// Schemas
// ============================================================================

const createAgentSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  operationId: z.string().min(1, "operationId é obrigatório"),
  userId: z.uuid().optional(),
  avatarUrl: z.url().optional(),
});

const updateAgentSchema = z.object({
  name: z.string().min(1).optional(),
  userId: z.uuid().nullable().optional(),
  avatarUrl: z.url().nullable().optional(),
});

const agentParamsSchema = z.object({
  id: z.uuid("ID inválido"),
});

const agentQuerySchema = z.object({
  operationId: z.string().optional(),
});

// ============================================================================
// Routes
// ============================================================================

export async function agentsRoutes(app: FastifyInstance) {
  /**
   * GET /agents
   * Lista todos os agentes da operation do usuário
   */
  app.get("/", { preHandler: authMiddleware }, async (request, reply) => {
    const user = request.user!;
    const query = agentQuerySchema.parse(request.query);

    if (!user.operationId) {
      return reply.send({ agents: [] });
    }

    const agents = await prisma.agent.findMany({
      where: {
        operationId: user.operationId, // Sempre filtra pela operation do usuário
      },
      include: {
        operation: { select: { id: true, name: true } },
        user: { select: { id: true, name: true, email: true } },
        channels: {
          select: { id: true, name: true, type: true, status: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return reply.send({ agents });
  });

  /**
   * GET /agents/:id
   * Busca um agente por ID
   */
  app.get("/:id", { preHandler: authMiddleware }, async (request, reply) => {
    const user = request.user!;
    const { id } = agentParamsSchema.parse(request.params);

    const agent = await prisma.agent.findFirst({
      where: { id, operationId: user.operationId },
      include: {
        operation: { select: { id: true, name: true } },
        user: { select: { id: true, name: true, email: true, role: true } },
        channels: {
          include: {
            whatsappDetails: true,
            _count: { select: { conversations: true } },
          },
        },
      },
    });

    if (!agent) {
      return reply.status(404).send({ error: "Agente não encontrado" });
    }

    return reply.send({ agent });
  });

  /**
   * POST /agents
   * Cria um novo agente
   */
  app.post("/", { preHandler: authMiddleware }, async (request, reply) => {
    const user = request.user!;
    const body = createAgentSchema.parse(request.body);

    if (!user.operationId) {
      return reply.status(400).send({ error: "Usuário sem operação vinculada" });
    }

    const operationId = user.operationId;

    // Verifica se user existe e não está vinculado a outro agent (se fornecido)
    if (body.userId) {
      const targetUser = await prisma.user.findUnique({
        where: { id: body.userId },
        include: { agent: true },
      });
      if (!targetUser) {
        return reply.status(404).send({ error: "Usuário não encontrado" });
      }
      if (targetUser.operationId !== user.operationId) {
        return reply.status(403).send({ error: "Usuário não pertence à sua operação" });
      }
      if (targetUser.agent) {
        return reply
          .status(409)
          .send({ error: "Usuário já vinculado a outro agente" });
      }
    }

    const agent = await prisma.agent.create({
      data: {
        name: body.name,
        operationId,
        userId: body.userId,
        avatarUrl: body.avatarUrl,
      },
      include: {
        operation: { select: { id: true, name: true } },
        user: { select: { id: true, name: true, email: true } },
      },
    });

    return reply.status(201).send({ agent });
  });

  /**
   * PUT /agents/:id
   * Atualiza um agente
   */
  app.put("/:id", { preHandler: authMiddleware }, async (request, reply) => {
    const user = request.user!;
    const { id } = agentParamsSchema.parse(request.params);
    const body = updateAgentSchema.parse(request.body);

    const existing = await prisma.agent.findFirst({ where: { id, operationId: user.operationId } });
    if (!existing) {
      return reply.status(404).send({ error: "Agente não encontrado" });
    }

    // Verifica se user existe e não está vinculado a outro agent (se alterando)
    if (body.userId && body.userId !== existing.userId) {
      const user = await prisma.user.findUnique({
        where: { id: body.userId },
        include: { agent: true },
      });
      if (!user) {
        return reply.status(404).send({ error: "Usuário não encontrado" });
      }
      if (user.agent && user.agent.id !== id) {
        return reply
          .status(409)
          .send({ error: "Usuário já vinculado a outro agente" });
      }
    }

    const agent = await prisma.agent.update({
      where: { id },
      data: body,
      include: {
        operation: { select: { id: true, name: true } },
        user: { select: { id: true, name: true, email: true } },
      },
    });

    return reply.send({ agent });
  });

  /**
   * DELETE /agents/:id
   * Remove um agente
   */
  app.delete("/:id", { preHandler: authMiddleware }, async (request, reply) => {
    const user = request.user!;
    const { id } = agentParamsSchema.parse(request.params);

    const existing = await prisma.agent.findFirst({ where: { id, operationId: user.operationId } });
    if (!existing) {
      return reply.status(404).send({ error: "Agente não encontrado" });
    }

    await prisma.agent.delete({ where: { id } });

    return reply.status(204).send();
  });
}
