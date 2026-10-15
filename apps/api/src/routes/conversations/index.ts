import { ConversationStatus, Prisma } from "@prisma/client";
import { FastifyInstance } from "fastify";
import { z } from "zod";
import { authMiddleware } from "../../middleware/auth";
import { prisma } from "../../prisma";
import {
  addNote,
  assignConversation,
  changeStatus,
  getConversationDetail,
  getVisibleConversation,
  listConversations,
  listNotes,
  markRead,
  sendAgentMessage,
} from "../../services/desk";
import { deskHandler } from "../desk-handler";

// ============================================================================
// Schemas
// ============================================================================

const conversationParamsSchema = z.object({
  id: z.uuid("ID inválido"),
});

const conversationQuerySchema = z.object({
  status: z.enum(ConversationStatus).optional(),
  queueId: z.uuid().optional(),
  /** "me" | "unassigned" | id do agente */
  assignee: z.union([z.enum(["me", "unassigned"]), z.uuid()]).optional(),
  search: z.string().optional(),
  cursor: z.string().optional(),
  channelId: z.uuid().optional(),
  contactId: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

const sendMessageSchema = z.object({ text: z.string().trim().min(1, "Texto é obrigatório").max(4096) });
const noteSchema = z.object({ text: z.string().trim().min(1, "Texto é obrigatório").max(10000) });
const assignSchema = z
  .object({
    agentId: z.uuid().nullable().optional(),
    queueId: z.uuid().nullable().optional(),
  })
  .refine((v) => v.agentId !== undefined || v.queueId !== undefined, {
    message: "Informe agentId e/ou queueId",
  });
const statusSchema = z.object({ status: z.enum(ConversationStatus) });

const messagesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  before: z.coerce.date().optional(),
  after: z.coerce.date().optional(),
});

// ============================================================================
// Routes
// ============================================================================

export async function conversationsRoutes(app: FastifyInstance) {
  /**
   * GET /conversations
   * Lista a mesa (cursor + filtros). AGENT vê só as suas e as não atribuídas.
   */
  app.get(
    "/",
    { preHandler: authMiddleware },
    deskHandler(async (actor, request) => {
      const query = conversationQuerySchema.parse(request.query);
      return listConversations(actor, query);
    }),
  );

  /**
   * GET /conversations/:id
   */
  app.get(
    "/:id",
    { preHandler: authMiddleware },
    deskHandler(async (actor, request) => {
      const { id } = conversationParamsSchema.parse(request.params);
      return { conversation: await getConversationDetail(actor, id) };
    }),
  );

  /**
   * GET /conversations/:id/messages
   * Retorna as mensagens de uma conversa
   */
  app.get(
    "/:id/messages",
    { preHandler: authMiddleware },
    deskHandler(async (actor, request, reply) => {
      const { id } = conversationParamsSchema.parse(request.params);
      const query = messagesQuerySchema.parse(request.query);
      await getVisibleConversation(actor, id);

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
    }),
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

  /** POST /conversations/:id/messages - envia pelo canal */
  app.post(
    "/:id/messages",
    { preHandler: authMiddleware },
    deskHandler(async (actor, request, reply) => {
      const { id } = conversationParamsSchema.parse(request.params);
      const { text } = sendMessageSchema.parse(request.body);
      const message = await sendAgentMessage(actor, id, text);
      return reply.status(201).send({ message });
    }),
  );

  /** POST /conversations/:id/assign */
  app.post(
    "/:id/assign",
    { preHandler: authMiddleware },
    deskHandler(async (actor, request) => {
      const { id } = conversationParamsSchema.parse(request.params);
      const body = assignSchema.parse(request.body);
      return { conversation: await assignConversation(actor, id, body) };
    }),
  );

  /** POST /conversations/:id/status */
  app.post(
    "/:id/status",
    { preHandler: authMiddleware },
    deskHandler(async (actor, request) => {
      const { id } = conversationParamsSchema.parse(request.params);
      const { status } = statusSchema.parse(request.body);
      return { conversation: await changeStatus(actor, id, status) };
    }),
  );

  /** GET /conversations/:id/notes - notas internas da conversa */
  app.get(
    "/:id/notes",
    { preHandler: authMiddleware },
    deskHandler(async (actor, request, reply) => {
      const { id } = conversationParamsSchema.parse(request.params);
      const events = await listNotes(actor, id);
      return reply.send({ events });
    }),
  );

  /** POST /conversations/:id/notes - nota interna */
  app.post(
    "/:id/notes",
    { preHandler: authMiddleware },
    deskHandler(async (actor, request, reply) => {
      const { id } = conversationParamsSchema.parse(request.params);
      const { text } = noteSchema.parse(request.body);
      const event = await addNote(actor, id, text);
      return reply.status(201).send({ event });
    }),
  );

  /** POST /conversations/:id/read - zera unreadCount */
  app.post(
    "/:id/read",
    { preHandler: authMiddleware },
    deskHandler(async (actor, request, reply) => {
      const { id } = conversationParamsSchema.parse(request.params);
      await markRead(actor, id);
      return reply.status(204).send();
    }),
  );
}
