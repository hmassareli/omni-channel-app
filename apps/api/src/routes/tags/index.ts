import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../prisma";

// ============================================================================
// Schemas
// ============================================================================

const createTagSchema = z.object({
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
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, "Cor deve ser hex (#RRGGBB)")
    .optional(),
  promptCondition: z.string().optional(),
});

const updateTagSchema = z.object({
  name: z.string().min(1).optional(),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .nullable()
    .optional(),
  promptCondition: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});

const tagParamsSchema = z.object({
  id: z.uuid("ID inválido"),
});

const tagQuerySchema = z.object({
  operationId: z.string().optional(),
  isActive: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
});

// ============================================================================
// Routes
// ============================================================================

export async function tagsRoutes(app: FastifyInstance) {
  /**
   * GET /tags
   * Lista todas as tags
   */
  app.get("/", async (request, reply) => {
    const query = tagQuerySchema.parse(request.query);

    const tags = await prisma.tag.findMany({
      where: {
        operationId: query.operationId,
        isActive: query.isActive,
      },
      include: {
        operation: { select: { id: true, name: true } },
        _count: { select: { contacts: true } },
      },
      orderBy: { name: "asc" },
    });

    return reply.send({ tags });
  });

  /**
   * GET /tags/:id
   * Busca uma tag por ID
   */
  app.get("/:id", async (request, reply) => {
    const { id } = tagParamsSchema.parse(request.params);

    const tag = await prisma.tag.findUnique({
      where: { id },
      include: {
        operation: { select: { id: true, name: true } },
        _count: { select: { contacts: true } },
      },
    });

    if (!tag) {
      return reply.status(404).send({ error: "Tag não encontrada" });
    }

    return reply.send({ tag });
  });

  /**
   * POST /tags
   * Cria uma nova tag
   */
  app.post("/", async (request, reply) => {
    const body = createTagSchema.parse(request.body);

    // Verifica se operation existe
    const operation = await prisma.operation.findUnique({
      where: { id: body.operationId },
    });
    if (!operation) {
      return reply.status(404).send({ error: "Operation não encontrada" });
    }

    // Verifica se já existe tag com mesmo nome na operation
    const existingTag = await prisma.tag.findFirst({
      where: {
        operationId: body.operationId,
        name: body.name,
      },
    });
    if (existingTag) {
      return reply
        .status(409)
        .send({ error: "Já existe uma tag com este nome nesta operation" });
    }

    // Gera slug a partir do nome se não fornecido
    const slug =
      body.slug ||
      body.name
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-]/g, "");

    const tag = await prisma.tag.create({
      data: {
        name: body.name,
        slug,
        operationId: body.operationId,
        color: body.color,
        promptCondition: body.promptCondition,
      },
      include: {
        operation: { select: { id: true, name: true } },
      },
    });

    return reply.status(201).send({ tag });
  });

  /**
   * PUT /tags/:id
   * Atualiza uma tag
   */
  app.put("/:id", async (request, reply) => {
    const { id } = tagParamsSchema.parse(request.params);
    const body = updateTagSchema.parse(request.body);

    const existing = await prisma.tag.findUnique({ where: { id } });
    if (!existing) {
      return reply.status(404).send({ error: "Tag não encontrada" });
    }

    // Verifica se já existe outra tag com mesmo nome na operation (se alterando nome)
    if (body.name && body.name !== existing.name) {
      const existingTag = await prisma.tag.findFirst({
        where: {
          operationId: existing.operationId!,
          name: body.name,
          NOT: { id },
        },
      });
      if (existingTag) {
        return reply
          .status(409)
          .send({ error: "Já existe uma tag com este nome nesta operation" });
      }
    }

    const tag = await prisma.tag.update({
      where: { id },
      data: body,
      include: {
        operation: { select: { id: true, name: true } },
      },
    });

    return reply.send({ tag });
  });

  /**
   * DELETE /tags/:id
   * Remove uma tag
   */
  app.delete("/:id", async (request, reply) => {
    const { id } = tagParamsSchema.parse(request.params);

    const existing = await prisma.tag.findUnique({ where: { id } });
    if (!existing) {
      return reply.status(404).send({ error: "Tag não encontrada" });
    }

    await prisma.tag.delete({ where: { id } });

    return reply.status(204).send();
  });
}
