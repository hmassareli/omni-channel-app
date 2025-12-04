import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../prisma";

// ============================================================================
// Schemas
// ============================================================================

const createOperationSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
});

const updateOperationSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório").optional(),
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
   * Lista todas as operations
   */
  app.get("/", async (_request, reply) => {
    const operations = await prisma.operation.findMany({
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
      orderBy: { createdAt: "desc" },
    });

    return reply.send({ operations });
  });

  /**
   * GET /operations/:id
   * Busca uma operation por ID
   */
  app.get("/:id", async (request, reply) => {
    const { id } = operationParamsSchema.parse(request.params);

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
   * Cria uma nova operation
   */
  app.post("/", async (request, reply) => {
    const body = createOperationSchema.parse(request.body);

    const operation = await prisma.operation.create({
      data: { name: body.name },
    });

    return reply.status(201).send({ operation });
  });

  /**
   * PUT /operations/:id
   * Atualiza uma operation
   */
  app.put("/:id", async (request, reply) => {
    const { id } = operationParamsSchema.parse(request.params);
    const body = updateOperationSchema.parse(request.body);

    const existing = await prisma.operation.findUnique({ where: { id } });
    if (!existing) {
      return reply.status(404).send({ error: "Operation não encontrada" });
    }

    const operation = await prisma.operation.update({
      where: { id },
      data: body,
    });

    return reply.send({ operation });
  });

  /**
   * DELETE /operations/:id
   * Remove uma operation
   */
  app.delete("/:id", async (request, reply) => {
    const { id } = operationParamsSchema.parse(request.params);

    const existing = await prisma.operation.findUnique({ where: { id } });
    if (!existing) {
      return reply.status(404).send({ error: "Operation não encontrada" });
    }

    await prisma.operation.delete({ where: { id } });

    return reply.status(204).send();
  });
}
