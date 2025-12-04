import { Prisma, TagSource } from "@prisma/client";
import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../prisma";

// ============================================================================
// Schemas
// ============================================================================

const contactParamsSchema = z.object({
  id: z.uuid("ID inválido"),
});

const contactQuerySchema = z.object({
  operationId: z.string().optional(),
  stageId: z.uuid().optional(),
  search: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const updateContactSchema = z.object({
  name: z.string().min(1).optional(),
  stageId: z.uuid().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const addTagSchema = z.object({
  tagId: z.uuid("tagId inválido"),
  source: z.enum(TagSource).default(TagSource.USER),
  note: z.string().optional(),
});

const removeTagSchema = z.object({
  tagId: z.string().uuid("tagId inválido"),
});

// ============================================================================
// Routes
// ============================================================================

export async function contactsRoutes(app: FastifyInstance) {
  /**
   * GET /contacts
   * Lista contatos com paginação e filtros
   */
  app.get("/", async (request, reply) => {
    const query = contactQuerySchema.parse(request.query);

    const where: Prisma.ContactWhereInput = {};

    // Filtro por operation (através das conversations -> channel -> operation)
    if (query.operationId) {
      where.conversations = {
        some: {
          channel: {
            operationId: query.operationId,
          },
        },
      };
    }

    if (query.stageId) {
      where.stageId = query.stageId;
    }

    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: "insensitive" } },
        { identities: { some: { value: { contains: query.search } } } },
      ];
    }

    const [contacts, total] = await Promise.all([
      prisma.contact.findMany({
        where,
        include: {
          identities: { select: { id: true, type: true, value: true } },
          stage: { select: { id: true, name: true, color: true } },
          tags: {
            include: { tag: { select: { id: true, name: true, color: true } } },
          },
          _count: { select: { conversations: true, messages: true } },
        },
        orderBy: { updatedAt: "desc" },
        take: query.limit,
        skip: query.offset,
      }),
      prisma.contact.count({ where }),
    ]);

    return reply.send({
      contacts,
      pagination: {
        total,
        limit: query.limit,
        offset: query.offset,
        hasMore: query.offset + contacts.length < total,
      },
    });
  });

  /**
   * GET /contacts/:id
   * Busca um contato por ID com detalhes completos
   */
  app.get("/:id", async (request, reply) => {
    const { id } = contactParamsSchema.parse(request.params);

    const contact = await prisma.contact.findUnique({
      where: { id },
      include: {
        identities: true,
        stage: true,
        tags: {
          include: { tag: true },
        },
        insights: {
          include: { definition: true },
          orderBy: { generatedAt: "desc" },
        },
        conversations: {
          include: {
            channel: { select: { id: true, name: true, type: true } },
            _count: { select: { messages: true } },
          },
          orderBy: { lastMessageAt: "desc" },
        },
      },
    });

    if (!contact) {
      return reply.status(404).send({ error: "Contato não encontrado" });
    }

    return reply.send({ contact });
  });

  /**
   * PUT /contacts/:id
   * Atualiza um contato
   */
  app.put("/:id", async (request, reply) => {
    const { id } = contactParamsSchema.parse(request.params);
    const body = updateContactSchema.parse(request.body);

    const existing = await prisma.contact.findUnique({ where: { id } });
    if (!existing) {
      return reply.status(404).send({ error: "Contato não encontrado" });
    }

    // Verifica se stage existe (se fornecido)
    if (body.stageId) {
      const stage = await prisma.stage.findUnique({
        where: { id: body.stageId },
      });
      if (!stage) {
        return reply.status(404).send({ error: "Stage não encontrado" });
      }
    }

    const contact = await prisma.contact.update({
      where: { id },
      data: body,
      include: {
        stage: { select: { id: true, name: true, color: true } },
      },
    });

    return reply.send({ contact });
  });

  /**
   * POST /contacts/:id/tags
   * Adiciona uma tag ao contato
   */
  app.post("/:id/tags", async (request, reply) => {
    const { id } = contactParamsSchema.parse(request.params);
    const body = addTagSchema.parse(request.body);

    const contact = await prisma.contact.findUnique({ where: { id } });
    if (!contact) {
      return reply.status(404).send({ error: "Contato não encontrado" });
    }

    const tag = await prisma.tag.findUnique({ where: { id: body.tagId } });
    if (!tag) {
      return reply.status(404).send({ error: "Tag não encontrada" });
    }

    // Verifica se já tem a tag
    const existing = await prisma.contactTag.findUnique({
      where: { contactId_tagId: { contactId: id, tagId: body.tagId } },
    });
    if (existing) {
      return reply.status(409).send({ error: "Contato já possui esta tag" });
    }

    await prisma.contactTag.create({
      data: {
        contactId: id,
        tagId: body.tagId,
        source: body.source,
        note: body.note,
      },
    });

    return reply.status(201).send({ success: true });
  });

  /**
   * DELETE /contacts/:id/tags
   * Remove uma tag do contato
   */
  app.delete("/:id/tags", async (request, reply) => {
    const { id } = contactParamsSchema.parse(request.params);
    const body = removeTagSchema.parse(request.body);

    const existing = await prisma.contactTag.findUnique({
      where: { contactId_tagId: { contactId: id, tagId: body.tagId } },
    });
    if (!existing) {
      return reply.status(404).send({ error: "Contato não possui esta tag" });
    }

    await prisma.contactTag.delete({
      where: { contactId_tagId: { contactId: id, tagId: body.tagId } },
    });

    return reply.status(204).send();
  });

  /**
   * GET /contacts/:id/timeline
   * Retorna a timeline de eventos do contato
   */
  app.get("/:id/timeline", async (request, reply) => {
    const { id } = contactParamsSchema.parse(request.params);

    const timelineQuery = z.object({
      limit: z.coerce.number().int().min(1).max(100).default(50),
      offset: z.coerce.number().int().min(0).default(0),
    });
    const query = timelineQuery.parse(request.query);

    const contact = await prisma.contact.findUnique({ where: { id } });
    if (!contact) {
      return reply.status(404).send({ error: "Contato não encontrado" });
    }

    const [events, total] = await Promise.all([
      prisma.timelineEvent.findMany({
        where: { contactId: id },
        include: {
          conversation: {
            select: {
              id: true,
              channel: { select: { id: true, name: true, type: true } },
            },
          },
        },
        orderBy: { occurredAt: "desc" },
        take: query.limit,
        skip: query.offset,
      }),
      prisma.timelineEvent.count({ where: { contactId: id } }),
    ]);

    return reply.send({
      events,
      pagination: {
        total,
        limit: query.limit,
        offset: query.offset,
        hasMore: query.offset + events.length < total,
      },
    });
  });
}
