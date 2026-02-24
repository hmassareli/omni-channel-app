import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../prisma";
import { authMiddleware } from "../../middleware/auth";

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
  operationId: z.string().uuid("operationId deve ser um UUID válido"),
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
  operationId: z.string().uuid("operationId deve ser um UUID válido"),
  stageIds: z
    .array(z.uuid("stageId deve ser um UUID válido"))
    .min(1, "Pelo menos um stage é necessário"),
});

// ============================================================================
// Routes
// ============================================================================

export async function stagesRoutes(app: FastifyInstance) {
  /**
   * GET /stages
   * Lista todos os stages da operation do usuário
   */
  app.get("/", { preHandler: authMiddleware }, async (request, reply) => {
    const user = request.user!;
    const query = stageQuerySchema.parse(request.query);

    if (!user.operationId) {
      return reply.send({ stages: [] });
    }

    const stages = await prisma.stage.findMany({
      where: {
        operationId: user.operationId, // Sempre filtra pela operation do usuário
      },
      include: {
        operation: { select: { id: true, name: true } },
        _count: { select: { opportunities: true } },
      },
      orderBy: { order: "asc" },
    });

    return reply.send({ stages });
  });

  /**
   * GET /stages/:id
   * Busca um stage por ID
   */
  app.get("/:id", { preHandler: authMiddleware }, async (request, reply) => {
    const user = request.user!;
    const { id } = stageParamsSchema.parse(request.params);

    const stage = await prisma.stage.findFirst({
      where: { id, operationId: user.operationId },
      include: {
        operation: { select: { id: true, name: true } },
        _count: { select: { opportunities: true } },
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
  app.post("/", { preHandler: authMiddleware }, async (request, reply) => {
    const user = request.user!;
    const body = createStageSchema.parse(request.body);

    if (!user.operationId) {
      return reply.status(400).send({ error: "Usuário sem operação vinculada" });
    }

    // Usa a operation do usuário (ignora body.operationId)
    const operationId = user.operationId;

    // Se não forneceu order, coloca no final
    let order = body.order;
    if (order === undefined) {
      const lastStage = await prisma.stage.findFirst({
        where: { operationId },
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
        operationId,
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
  app.put("/:id", { preHandler: authMiddleware }, async (request, reply) => {
    const user = request.user!;
    const { id } = stageParamsSchema.parse(request.params);
    const body = updateStageSchema.parse(request.body);

    const existing = await prisma.stage.findFirst({ where: { id, operationId: user.operationId } });
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
  app.post("/reorder", { preHandler: authMiddleware }, async (request, reply) => {
    const user = request.user!;
    const body = reorderStagesSchema.parse(request.body);

    if (!user.operationId) {
      return reply.status(400).send({ error: "Usuário sem operação vinculada" });
    }

    // Usa a operation do usuário
    const operationId = user.operationId;

    // Atualiza a ordem de cada stage (apenas stages da operação)
    await prisma.$transaction(
      body.stageIds.map((stageId, index) =>
        prisma.stage.updateMany({
          where: { id: stageId, operationId },
          data: { order: index },
        })
      )
    );

    // Retorna os stages atualizados
    const stages = await prisma.stage.findMany({
      where: { operationId },
      orderBy: { order: "asc" },
    });

    return reply.send({ stages });
  });

  /**
   * DELETE /stages/:id
   * Remove um stage
   */
  app.delete("/:id", { preHandler: authMiddleware }, async (request, reply) => {
    const user = request.user!;
    const { id } = stageParamsSchema.parse(request.params);

    const existing = await prisma.stage.findFirst({ where: { id, operationId: user.operationId } });
    if (!existing) {
      return reply.status(404).send({ error: "Stage não encontrado" });
    }

    // Verifica se tem oportunidades neste stage
    const opportunitiesCount = await prisma.opportunity.count({
      where: { stageId: id },
    });
    if (opportunitiesCount > 0) {
      return reply.status(409).send({
        error: "Stage possui oportunidades vinculadas",
        opportunitiesCount,
      });
    }

    await prisma.stage.delete({ where: { id } });

    return reply.status(204).send();
  });
}
