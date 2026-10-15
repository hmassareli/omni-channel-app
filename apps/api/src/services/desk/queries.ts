import { ConversationStatus, Prisma } from "@prisma/client";
import { prisma } from "../../prisma";
import { conversationScope, DeskActor, getVisibleConversation } from "./access";

const listInclude = {
  contact: {
    select: {
      id: true,
      name: true,
      avatarUrl: true,
      company: { select: { id: true, name: true } },
    },
  },
  channel: { select: { id: true, name: true, type: true } },
  assignedAgent: { select: { id: true, name: true, avatarUrl: true } },
  queue: { select: { id: true, name: true } },
  messages: {
    select: { content: true, direction: true, sentAt: true },
    orderBy: { sentAt: "desc" },
    take: 1,
  },
} satisfies Prisma.ConversationInclude;

type ConversationRow = Prisma.ConversationGetPayload<{ include: typeof listInclude }>;

export function toListItem(c: ConversationRow) {
  const last = c.messages[0];
  return {
    id: c.id,
    status: c.status,
    lastMessageAt: c.lastMessageAt,
    contact: c.contact,
    channel: c.channel,
    assignedAgent: c.assignedAgent,
    queue: c.queue,
    lastMessage: last
      ? { content: last.content, direction: last.direction, sentAt: last.sentAt }
      : null,
    unreadCount: c.unreadCount,
  };
}

export interface ListFilters {
  status?: ConversationStatus;
  contactId?: string;
  channelId?: string;
  queueId?: string;
  /** "me" | "unassigned" | id do agente */
  assignee?: string;
  search?: string;
  cursor?: string;
  limit: number;
}

function encodeCursor(c: { lastMessageAt: Date; id: string }) {
  return Buffer.from(`${c.lastMessageAt.toISOString()}|${c.id}`).toString("base64url");
}

function decodeCursor(cursor: string): { at: Date; id: string } | null {
  try {
    const [iso, id] = Buffer.from(cursor, "base64url").toString().split("|");
    const at = new Date(iso);
    return id && !Number.isNaN(at.getTime()) ? { at, id } : null;
  } catch {
    return null;
  }
}

/** Lista conversas (mais recentes primeiro) com paginação por cursor. */
export async function listConversations(actor: DeskActor, filters: ListFilters) {
  const and: Prisma.ConversationWhereInput[] = [await conversationScope(actor)];

  if (filters.status) and.push({ status: filters.status });
  if (filters.queueId) and.push({ queueId: filters.queueId });
  if (filters.contactId) and.push({ contactId: filters.contactId });
  if (filters.channelId) and.push({ channelId: filters.channelId });

  if (filters.assignee === "unassigned") {
    and.push({ assignedAgentId: null });
  } else if (filters.assignee === "me") {
    // Sem agente vinculado, "minhas" é vazio.
    and.push({ assignedAgentId: actor.agentId ?? "00000000-0000-0000-0000-000000000000" });
  } else if (filters.assignee) {
    and.push({ assignedAgentId: filters.assignee });
  }

  const search = filters.search?.trim();
  if (search) {
    and.push({
      OR: [
        { contact: { name: { contains: search, mode: "insensitive" } } },
        { contact: { identities: { some: { value: { contains: search } } } } },
        { contact: { company: { name: { contains: search, mode: "insensitive" } } } },
      ],
    });
  }

  const cursor = filters.cursor ? decodeCursor(filters.cursor) : null;
  if (cursor) {
    and.push({
      OR: [
        { lastMessageAt: { lt: cursor.at } },
        { lastMessageAt: cursor.at, id: { lt: cursor.id } },
      ],
    });
  }

  const rows = await prisma.conversation.findMany({
    where: { AND: and },
    include: listInclude,
    orderBy: [{ lastMessageAt: "desc" }, { id: "desc" }],
    take: filters.limit + 1,
  });

  const page = rows.slice(0, filters.limit);
  return {
    conversations: page.map(toListItem),
    nextCursor:
      rows.length > filters.limit ? encodeCursor(page[page.length - 1]) : null,
  };
}

/** Conversa no formato de detalhe (item de lista + campos extras). */
export async function loadConversationDetail(conversationId: string) {
  const c = await prisma.conversation.findUniqueOrThrow({
    where: { id: conversationId },
    include: { ...listInclude, csat: { select: { score: true, comment: true } } },
  });
  return {
    ...toListItem(c),
    summary: c.summary,
    firstResponseAt: c.firstResponseAt,
    resolvedAt: c.resolvedAt,
    csat: c.csat ? { score: c.csat.score, comment: c.csat.comment } : null,
  };
}

export async function getConversationDetail(actor: DeskActor, id: string) {
  await getVisibleConversation(actor, id);
  return loadConversationDetail(id);
}
