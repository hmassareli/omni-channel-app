import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../prisma";

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
   * Lista todos os agentes
   */
  app.get("/", async (request, reply) => {
    const query = agentQuerySchema.parse(request.query);

    const agents = await prisma.agent.findMany({
      where: {
        operationId: query.operationId,
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
  app.get("/:id", async (request, reply) => {
    const { id } = agentParamsSchema.parse(request.params);

    const agent = await prisma.agent.findUnique({
      where: { id },
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
  app.post("/", async (request, reply) => {
    const body = createAgentSchema.parse(request.body);

    // Verifica se operation existe
    const operation = await prisma.operation.findUnique({
      where: { id: body.operationId },
    });
    if (!operation) {
      return reply.status(404).send({ error: "Operation não encontrada" });
    }

    // Verifica se user existe e não está vinculado a outro agent (se fornecido)
    if (body.userId) {
      const user = await prisma.user.findUnique({
        where: { id: body.userId },
        include: { agent: true },
      });
      if (!user) {
        return reply.status(404).send({ error: "Usuário não encontrado" });
      }
      if (user.agent) {
        return reply
          .status(409)
          .send({ error: "Usuário já vinculado a outro agente" });
      }
    }

    const agent = await prisma.agent.create({
      data: {
        name: body.name,
        operationId: body.operationId,
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
  app.put("/:id", async (request, reply) => {
    const { id } = agentParamsSchema.parse(request.params);
    const body = updateAgentSchema.parse(request.body);

    const existing = await prisma.agent.findUnique({ where: { id } });
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
  app.delete("/:id", async (request, reply) => {
    const { id } = agentParamsSchema.parse(request.params);

    const existing = await prisma.agent.findUnique({ where: { id } });
    if (!existing) {
      return reply.status(404).send({ error: "Agente não encontrado" });
    }

    await prisma.agent.delete({ where: { id } });

    return reply.status(204).send();
  });
}
