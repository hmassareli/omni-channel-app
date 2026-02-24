import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../prisma";
import { authMiddleware } from "../../middleware/auth";

// ============================================================================
// Schemas
// ============================================================================

const createOperationSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
});

const updateOperationSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório").optional(),
  onboardingCompleted: z.boolean().optional(),
});

const operationParamsSchema = z.object({
  id: z.string().min(1, "ID é obrigatório"),
});

// ============================================================================
// Routes
// ============================================================================

export async function operationsRoutes(app: FastifyInstance) {
  /**
   * GET /operations
   * Retorna a operation do usuário autenticado
   */
  app.get("/", { preHandler: authMiddleware }, async (request, reply) => {
    const user = request.user!;

    // Se usuário não tem operation, retorna vazio
    if (!user.operationId) {
      return reply.send({ operation: null });
    }

    const operation = await prisma.operation.findUnique({
      where: { id: user.operationId },
      include: {
        _count: {
          select: {
            channels: true,
            users: true,
            agents: true,
            tags: true,
            stages: true,
          },
        },
      },
    });

    return reply.send({ operation });
  });

  /**
   * GET /operations/:id
   * Busca uma operation por ID (apenas se pertence ao usuário)
   */
  app.get("/:id", { preHandler: authMiddleware }, async (request, reply) => {
    const user = request.user!;
    const { id } = operationParamsSchema.parse(request.params);

    // Verifica se o usuário tem permissão para acessar esta operation
    if (user.operationId !== id) {
      return reply.status(403).send({ error: "Acesso negado" });
    }

    const operation = await prisma.operation.findUnique({
      where: { id },
      include: {
        channels: {
          select: { id: true, name: true, type: true, status: true },
        },
        users: { select: { id: true, name: true, email: true, role: true } },
        agents: { select: { id: true, name: true } },
        tags: { select: { id: true, name: true, color: true } },
        stages: {
          select: { id: true, name: true, order: true },
          orderBy: { order: "asc" },
        },
      },
    });

    if (!operation) {
      return reply.status(404).send({ error: "Operation não encontrada" });
    }

    return reply.send({ operation });
  });

  /**
   * POST /operations
   * Cria uma nova operation e vincula ao usuário autenticado
   */
  app.post("/", { preHandler: authMiddleware }, async (request, reply) => {
    const user = request.user!;
    const body = createOperationSchema.parse(request.body);

    // Verifica se o usuário já tem uma operation
    if (user.operationId) {
      return reply.status(400).send({
        error: "Usuário já possui uma operation vinculada",
      });
    }

    // Cria a operation e vincula ao usuário em uma transaction
    const operation = await prisma.$transaction(async (tx) => {
      const newOperation = await tx.operation.create({
        data: { name: body.name },
      });

      // Vincula o usuário à operation
      await tx.user.update({
        where: { id: user.id },
        data: { operationId: newOperation.id },
      });

      return newOperation;
    });

    return reply.status(201).send({ operation });
  });

  /**
   * PUT /operations/:id
   * Atualiza uma operation (apenas se pertence ao usuário)
   */
  app.put("/:id", { preHandler: authMiddleware }, async (request, reply) => {
    const user = request.user!;
    const { id } = operationParamsSchema.parse(request.params);
    const body = updateOperationSchema.parse(request.body);

    // Verifica se o usuário tem permissão
    if (user.operationId !== id) {
      return reply.status(403).send({ error: "Acesso negado" });
    }

    const existing = await prisma.operation.findUnique({ where: { id } });
    if (!existing) {
      return reply.status(404).send({ error: "Operation não encontrada" });
    }

    // Se está marcando onboarding como completo, cria stages padrão (se não existirem)
    if (body.onboardingCompleted && !existing.onboardingCompleted) {
      const existingStages = await prisma.stage.count({ where: { operationId: id } });
      if (existingStages === 0) {
        const defaultStages = [
          { name: "Suspect", slug: "suspect", order: 0, color: "#94a3b8" },
          { name: "Prospect", slug: "prospect", order: 1, color: "#6366f1" },
          { name: "Mapeamento", slug: "mapeamento", order: 2, color: "#8b5cf6" },
          { name: "Demonstração", slug: "demonstracao", order: 3, color: "#a855f7" },
          { name: "Negociação", slug: "negociacao", order: 4, color: "#d946ef" },
          { name: "Fechamento", slug: "fechamento", order: 5, color: "#22c55e" },
        ];
        await prisma.stage.createMany({
          data: defaultStages.map((s) => ({ ...s, operationId: id })),
        });
        console.log(`[Operations] Criados ${defaultStages.length} stages padrão para operation ${id}`);
      }
    }

    const operation = await prisma.operation.update({
      where: { id },
      data: body,
    });

    return reply.send({ operation });
  });

  /**
   * DELETE /operations/:id
   * Remove uma operation (apenas se pertence ao usuário e role=ADMIN)
   */
  app.delete("/:id", { preHandler: authMiddleware }, async (request, reply) => {
    const user = request.user!;
    const { id } = operationParamsSchema.parse(request.params);

    // Verifica permissão
    if (user.operationId !== id) {
      return reply.status(403).send({ error: "Acesso negado" });
    }

    // Apenas ADMIN pode deletar operations
    if (user.role !== "ADMIN") {
      return reply.status(403).send({
        error: "Apenas administradores podem deletar operations",
      });
    }

    const existing = await prisma.operation.findUnique({ where: { id } });
    if (!existing) {
      return reply.status(404).send({ error: "Operation não encontrada" });
    }

    await prisma.operation.delete({ where: { id } });

    return reply.status(204).send();
  });
}
