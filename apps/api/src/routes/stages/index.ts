import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../prisma";

// ============================================================================
// Schemas
// ============================================================================

const createStageSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  slug: z
    .string()
    .min(1, "Slug é obrigatório")
    .regex(
      /^[a-z0-9-]+$/,
      "Slug deve conter apenas letras minúsculas, números e hífens"
    )
    .optional(),
  operationId: z.string().min(1, "operationId é obrigatório"),
  order: z.number().int().min(0).optional(),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, "Cor deve ser hex (#RRGGBB)")
    .optional(),
  promptCondition: z.string().optional(),
  autoTransition: z.boolean().default(false),
});

const updateStageSchema = z.object({
  name: z.string().min(1).optional(),
  order: z.number().int().min(0).optional(),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .nullable()
    .optional(),
  promptCondition: z.string().nullable().optional(),
  autoTransition: z.boolean().optional(),
});

const stageParamsSchema = z.object({
  id: z.uuid("ID inválido"),
});

const stageQuerySchema = z.object({
  operationId: z.string().optional(),
});

const reorderStagesSchema = z.object({
  operationId: z.string().min(1, "operationId é obrigatório"),
  stageIds: z.array(z.uuid()).min(1, "Pelo menos um stage é necessário"),
});

// ============================================================================
// Routes
// ============================================================================

export async function stagesRoutes(app: FastifyInstance) {
  /**
   * GET /stages
   * Lista todos os stages
   */
  app.get("/", async (request, reply) => {
    const query = stageQuerySchema.parse(request.query);

    const stages = await prisma.stage.findMany({
      where: {
        operationId: query.operationId,
      },
      include: {
        operation: { select: { id: true, name: true } },
        _count: { select: { contacts: true } },
      },
      orderBy: { order: "asc" },
    });

    return reply.send({ stages });
  });

  /**
   * GET /stages/:id
   * Busca um stage por ID
   */
  app.get("/:id", async (request, reply) => {
    const { id } = stageParamsSchema.parse(request.params);

    const stage = await prisma.stage.findUnique({
      where: { id },
      include: {
        operation: { select: { id: true, name: true } },
        _count: { select: { contacts: true } },
      },
    });

    if (!stage) {
      return reply.status(404).send({ error: "Stage não encontrado" });
    }

    return reply.send({ stage });
  });

  /**
   * POST /stages
   * Cria um novo stage
   */
  app.post("/", async (request, reply) => {
    const body = createStageSchema.parse(request.body);

    // Verifica se operation existe
    const operation = await prisma.operation.findUnique({
      where: { id: body.operationId },
    });
    if (!operation) {
      return reply.status(404).send({ error: "Operation não encontrada" });
    }

    // Se não forneceu order, coloca no final
    let order = body.order;
    if (order === undefined) {
      const lastStage = await prisma.stage.findFirst({
        where: { operationId: body.operationId },
        orderBy: { order: "desc" },
      });
      order = (lastStage?.order ?? -1) + 1;
    }

    // Gera slug a partir do nome se não fornecido
    const slug =
      body.slug ||
      body.name
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-]/g, "");

    const stage = await prisma.stage.create({
      data: {
        name: body.name,
        slug,
        operationId: body.operationId,
        order,
        color: body.color,
        promptCondition: body.promptCondition,
        autoTransition: body.autoTransition,
      },
      include: {
        operation: { select: { id: true, name: true } },
      },
    });

    return reply.status(201).send({ stage });
  });

  /**
   * PUT /stages/:id
   * Atualiza um stage
   */
  app.put("/:id", async (request, reply) => {
    const { id } = stageParamsSchema.parse(request.params);
    const body = updateStageSchema.parse(request.body);

    const existing = await prisma.stage.findUnique({ where: { id } });
    if (!existing) {
      return reply.status(404).send({ error: "Stage não encontrado" });
    }

    const stage = await prisma.stage.update({
      where: { id },
      data: body,
      include: {
        operation: { select: { id: true, name: true } },
      },
    });

    return reply.send({ stage });
  });

  /**
   * POST /stages/reorder
   * Reordena os stages de uma operation
   */
  app.post("/reorder", async (request, reply) => {
    const body = reorderStagesSchema.parse(request.body);

    // Verifica se operation existe
    const operation = await prisma.operation.findUnique({
      where: { id: body.operationId },
    });
    if (!operation) {
      return reply.status(404).send({ error: "Operation não encontrada" });
    }

    // Atualiza a ordem de cada stage
    await prisma.$transaction(
      body.stageIds.map((stageId, index) =>
        prisma.stage.update({
          where: { id: stageId },
          data: { order: index },
        })
      )
    );

    // Retorna os stages atualizados
    const stages = await prisma.stage.findMany({
      where: { operationId: body.operationId },
      orderBy: { order: "asc" },
    });

    return reply.send({ stages });
  });

  /**
   * DELETE /stages/:id
   * Remove um stage
   */
  app.delete("/:id", async (request, reply) => {
    const { id } = stageParamsSchema.parse(request.params);

    const existing = await prisma.stage.findUnique({ where: { id } });
    if (!existing) {
      return reply.status(404).send({ error: "Stage não encontrado" });
    }

    // Verifica se tem contatos neste stage
    const contactsCount = await prisma.contact.count({
      where: { stageId: id },
    });
    if (contactsCount > 0) {
      return reply.status(409).send({
        error: "Stage possui contatos vinculados",
        contactsCount,
      });
    }

    await prisma.stage.delete({ where: { id } });

    return reply.status(204).send();
  });
}
