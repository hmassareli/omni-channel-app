import { Prisma } from "@prisma/client";
import { FastifyInstance } from "fastify";
import { z } from "zod";
import { authMiddleware } from "../../middleware/auth";
import { prisma } from "../../prisma";

// ============================================================================
// Schemas
// ============================================================================

const conversationParamsSchema = z.object({
  id: z.uuid("ID inválido"),
});

const conversationQuerySchema = z.object({
  channelId: z.uuid().optional(),
  contactId: z.uuid().optional(),
  operationId: z.string().optional(),
  needsAnalysis: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const messagesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  before: z.date().optional(),
  after: z.date().optional(),
});

// ============================================================================
// Routes
// ============================================================================

export async function conversationsRoutes(app: FastifyInstance) {
  /**
   * GET /conversations
   * Lista conversas com filtros e paginação
   */
  app.get("/", { preHandler: authMiddleware }, async (request, reply) => {
    const user = request.user!;
    const query = conversationQuerySchema.parse(request.query);

    if (!user.operationId) {
      return reply.send({ conversations: [], total: 0 });
    }

    const where: Prisma.ConversationWhereInput = {
      // Filtra por operation via channel
      channel: { operationId: user.operationId },
    };

    if (query.channelId) {
      where.channelId = query.channelId;
    }

    if (query.contactId) {
      where.contactId = query.contactId;
    }

    if (query.needsAnalysis !== undefined) {
      where.needsAnalysis = query.needsAnalysis;
    }

    const [conversations, total] = await Promise.all([
      prisma.conversation.findMany({
        where,
        include: {
          contact: {
            select: {
              id: true,
              name: true,
              identities: { select: { type: true, value: true }, take: 1 },
            },
          },
          channel: { select: { id: true, name: true, type: true } },
          _count: { select: { messages: true } },
        },
        orderBy: { lastMessageAt: "desc" },
        take: query.limit,
        skip: query.offset,
      }),
      prisma.conversation.count({ where }),
    ]);

    return reply.send({
      conversations,
      pagination: {
        total,
        limit: query.limit,
        offset: query.offset,
        hasMore: query.offset + conversations.length < total,
      },
    });
  });

  /**
   * GET /conversations/:id
   * Busca uma conversa por ID com detalhes
   */
  app.get("/:id", { preHandler: authMiddleware }, async (request, reply) => {
    const user = request.user!;
    const { id } = conversationParamsSchema.parse(request.params);

    const conversation = await prisma.conversation.findFirst({
      where: { id, channel: { operationId: user.operationId } },
      include: {
        contact: {
          include: {
            identities: true,
            company: { select: { id: true, name: true, alias: true } },
            tags: {
              include: {
                tag: { select: { id: true, name: true, color: true } },
              },
            },
          },
        },
        channel: {
          select: { id: true, name: true, type: true, status: true },
        },
      },
    });

    if (!conversation) {
      return reply.status(404).send({ error: "Conversa não encontrada" });
    }

    return reply.send({ conversation });
  });

  /**
   * GET /conversations/:id/messages
   * Retorna as mensagens de uma conversa
   */
  app.get(
    "/:id/messages",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const user = request.user!;
      const { id } = conversationParamsSchema.parse(request.params);
      const query = messagesQuerySchema.parse(request.query);

      const conversation = await prisma.conversation.findFirst({
        where: { id, channel: { operationId: user.operationId } },
      });
      if (!conversation) {
        return reply.status(404).send({ error: "Conversa não encontrada" });
      }

      const where: Prisma.MessageWhereInput = {
        conversationId: id,
      };

      if (query.before) {
        where.sentAt = {
          ...(where.sentAt as object),
          lt: new Date(query.before),
        };
      }

      if (query.after) {
        where.sentAt = {
          ...(where.sentAt as object),
          gt: new Date(query.after),
        };
      }

      const messages = await prisma.message.findMany({
        where,
        orderBy: { sentAt: "desc" },
        take: query.limit,
      });

      // Retorna em ordem cronológica
      return reply.send({
        messages: messages.reverse(),
        hasMore: messages.length === query.limit,
      });
    },
  );

  /**
   * POST /conversations/:id/analyze
   * Força a análise de uma conversa
   */
  app.post(
    "/:id/analyze",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const user = request.user!;
      const { id } = conversationParamsSchema.parse(request.params);

      const conversation = await prisma.conversation.findFirst({
        where: { id, channel: { operationId: user.operationId } },
      });
      if (!conversation) {
        return reply.status(404).send({ error: "Conversa não encontrada" });
      }

      // Importa dinamicamente para evitar dependência circular
      const { scheduleConversationAnalysis } =
        await import("../../services/conversation-analysis");

      scheduleConversationAnalysis(id);

      return reply.send({ success: true, message: "Análise agendada" });
    },
  );
}
