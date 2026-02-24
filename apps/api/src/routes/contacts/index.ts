import { Prisma, TagSource } from "@prisma/client";
import { FastifyInstance } from "fastify";
import { z } from "zod";
import { authMiddleware } from "../../middleware/auth";
import { prisma } from "../../prisma";

// ============================================================================
// Schemas
// ============================================================================

const contactParamsSchema = z.object({
  id: z.uuid("ID inválido"),
});

const contactQuerySchema = z.object({
  operationId: z.string().optional(),
  search: z.string().optional(),
  unlinked: z.coerce.boolean().optional(), // Contatos sem empresa vinculada
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const updateContactSchema = z.object({
  name: z.string().min(1).optional(),
  role: z.string().optional(),
  relevance: z.enum(["HIGH", "MEDIUM", "LOW"]).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const createContactSchema = z
  .object({
    name: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().email().optional(),
    companyId: z.uuid("companyId inválido").optional(),
    role: z.string().optional(),
  })
  .refine((data) => data.phone || data.email, {
    message: "É necessário informar pelo menos um telefone ou email",
  });

const addTagSchema = z.object({
  tagId: z.uuid("tagId inválido"),
  source: z.enum(TagSource).default(TagSource.USER),
  note: z.string().optional(),
});

const removeTagSchema = z.object({
  tagId: z.string().uuid("tagId inválido"),
});

const linkWhatsAppChatSchema = z.object({
  waId: z.string().min(10, "Número inválido"), // Ex: "5511999999999"
  companyId: z.uuid("companyId inválido"),
  name: z.string().optional(),
  role: z.string().optional(),
  channelId: z.uuid("channelId inválido"), // Para criar a conversation
});

// ============================================================================
// Routes
// ============================================================================

export async function contactsRoutes(app: FastifyInstance) {
  app.get("/", { preHandler: authMiddleware }, async (request, reply) => {
    const user = request.user!;
    const query = contactQuerySchema.parse(request.query);

    if (!user.operationId) {
      return reply.send({ contacts: [], total: 0 });
    }

    const where: Prisma.ContactWhereInput = {};

    // Filtrar por operação do usuário (contatos com conversas nessa operation)
    where.conversations = {
      some: {
        channel: {
          operationId: user.operationId,
        },
      },
    };

    // Filtrar contatos sem empresa vinculada
    if (query.unlinked) {
      where.companyId = null;
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
          tags: {
            include: { tag: { select: { id: true, name: true, color: true } } },
          },
          company: {
            select: { id: true, name: true, alias: true, taxId: true },
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

  app.post("/", { preHandler: authMiddleware }, async (request, reply) => {
    const body = createContactSchema.parse(request.body);

    // Verificar se já existe contato com mesmo telefone/email
    const identityConditions = [];
    if (body.phone) {
      identityConditions.push({ type: "WHATSAPP", value: body.phone });
    }
    if (body.email) {
      identityConditions.push({ type: "EMAIL", value: body.email });
    }

    const existingContact = await prisma.contact.findFirst({
      where: {
        identities: {
          some: {
            OR: identityConditions.map((c) => ({
              type: c.type as "WHATSAPP" | "EMAIL",
              value: c.value,
            })),
          },
        },
      },
    });

    if (existingContact) {
      return reply.status(409).send({
        error: "Já existe um contato com este telefone ou email",
        contact: existingContact,
      });
    }

    // Criar contato com identidades
    const contact = await prisma.contact.create({
      data: {
        name: body.name,
        role: body.role,
        companyId: body.companyId,
        identities: {
          create: [
            ...(body.phone
              ? [{ type: "WHATSAPP" as const, value: body.phone }]
              : []),
            ...(body.email
              ? [{ type: "EMAIL" as const, value: body.email }]
              : []),
          ],
        },
      },
      include: {
        identities: true,
        company: true,
      },
    });

    return reply.status(201).send({ contact });
  });

  // Vincular contato a uma empresa
  app.patch(
    "/:id/link-company",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id } = contactParamsSchema.parse(request.params);
      const { companyId } = z
        .object({ companyId: z.uuid() })
        .parse(request.body);

      const contact = await prisma.contact.findUnique({ where: { id } });
      if (!contact) {
        return reply.status(404).send({ error: "Contato não encontrado" });
      }

      const company = await prisma.company.findUnique({
        where: { id: companyId },
      });
      if (!company) {
        return reply.status(404).send({ error: "Empresa não encontrada" });
      }

      const updatedContact = await prisma.contact.update({
        where: { id },
        data: { companyId },
        include: {
          identities: true,
          company: true,
        },
      });

      return reply.send({ contact: updatedContact });
    },
  );

  /**
   * POST /contacts/link-whatsapp
   * Vincula um chat do WhatsApp a uma empresa, criando:
   * - Contact (ou usa existente se já houver)
   * - Identity (WHATSAPP)
   * - Conversation (vinculando ao Channel)
   * - Vinculo com Company
   */
  app.post(
    "/link-whatsapp",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const user = request.user!;
      const body = linkWhatsAppChatSchema.parse(request.body);

      // Verifica se a empresa existe
      const company = await prisma.company.findUnique({
        where: { id: body.companyId },
      });
      if (!company) {
        return reply.status(404).send({ error: "Empresa não encontrada" });
      }

      // Verifica se o channel pertence à operação do usuário
      const channel = await prisma.channel.findFirst({
        where: { id: body.channelId, operationId: user.operationId },
        include: { whatsappDetails: true },
      });
      if (!channel) {
        return reply.status(404).send({ error: "Canal não encontrado" });
      }

      // Verifica se já existe uma Identity com esse número
      let identity = await prisma.identity.findUnique({
        where: {
          type_value: {
            type: "WHATSAPP",
            value: body.waId,
          },
        },
        include: {
          contact: {
            include: { company: true },
          },
        },
      });

      if (identity) {
        // Contato já existe - apenas atualiza a empresa se não tiver
        if (
          identity.contact.companyId &&
          identity.contact.companyId !== body.companyId
        ) {
          return reply.status(409).send({
            error: "Este contato já está vinculado a outra empresa",
            contact: identity.contact,
          });
        }

        // Atualiza o contato com a empresa e nome se fornecido
        const updatedContact = await prisma.contact.update({
          where: { id: identity.contactId },
          data: {
            companyId: body.companyId,
            name: body.name || identity.contact.name,
            role: body.role || identity.contact.role,
          },
          include: {
            identities: true,
            company: true,
            conversations: true,
          },
        });

        // Verifica se já existe conversation com esse channel
        let conversation = await prisma.conversation.findFirst({
          where: {
            contactId: updatedContact.id,
            channelId: body.channelId,
          },
        });

        if (!conversation) {
          // Cria a conversation
          conversation = await prisma.conversation.create({
            data: {
              contactId: updatedContact.id,
              channelId: body.channelId,
              externalId: `${body.waId}@c.us`,
              firstMessageAt: new Date(),
              lastMessageAt: new Date(),
              needsAnalysis: false,
            },
          });
        }

        return reply.send({
          contact: updatedContact,
          conversation,
          created: false,
        });
      }

      // Cria novo Contact + Identity + Conversation
      const contact = await prisma.contact.create({
        data: {
          name: body.name,
          role: body.role,
          companyId: body.companyId,
          identities: {
            create: {
              type: "WHATSAPP",
              value: body.waId,
            },
          },
          conversations: {
            create: {
              channelId: body.channelId,
              externalId: `${body.waId}@c.us`,
              firstMessageAt: new Date(),
              lastMessageAt: new Date(),
              needsAnalysis: false,
            },
          },
        },
        include: {
          identities: true,
          company: true,
          conversations: true,
        },
      });

      return reply.status(201).send({
        contact,
        conversation: contact.conversations[0],
        created: true,
      });
    },
  );

  app.get("/:id", { preHandler: authMiddleware }, async (request, reply) => {
    const user = request.user!;
    const { id } = contactParamsSchema.parse(request.params);

    const contact = await prisma.contact.findFirst({
      where: {
        id,
        conversations: { some: { channel: { operationId: user.operationId } } },
      },
      include: {
        identities: true,
        tags: {
          include: { tag: true },
        },
        company: true,
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

  app.put("/:id", { preHandler: authMiddleware }, async (request, reply) => {
    const user = request.user!;
    const { id } = contactParamsSchema.parse(request.params);
    const body = updateContactSchema.parse(request.body);

    const existing = await prisma.contact.findFirst({
      where: {
        id,
        conversations: { some: { channel: { operationId: user.operationId } } },
      },
    });
    if (!existing) {
      return reply.status(404).send({ error: "Contato não encontrado" });
    }

    const contact = await prisma.contact.update({
      where: { id },
      data: body,
    });

    return reply.send({ contact });
  });

  app.post(
    "/:id/tags",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const user = request.user!;
      const { id } = contactParamsSchema.parse(request.params);
      const body = addTagSchema.parse(request.body);

      const contact = await prisma.contact.findFirst({
        where: {
          id,
          conversations: {
            some: { channel: { operationId: user.operationId } },
          },
        },
      });
      if (!contact) {
        return reply.status(404).send({ error: "Contato não encontrado" });
      }

      // Verifica se a tag pertence à operação do usuário
      const tag = await prisma.tag.findFirst({
        where: { id: body.tagId, operationId: user.operationId },
      });
      if (!tag) {
        return reply.status(404).send({ error: "Tag não encontrada" });
      }

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
    },
  );

  app.delete(
    "/:id/tags",
    { preHandler: authMiddleware },
    async (request, reply) => {
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
    },
  );

  app.get(
    "/:id/timeline",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const user = request.user!;
      const { id } = contactParamsSchema.parse(request.params);

      const timelineQuery = z.object({
        limit: z.coerce.number().int().min(1).max(100).default(50),
        offset: z.coerce.number().int().min(0).default(0),
      });
      const query = timelineQuery.parse(request.query);

      const contact = await prisma.contact.findFirst({
        where: {
          id,
          conversations: {
            some: { channel: { operationId: user.operationId } },
          },
        },
      });
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
    },
  );
}
