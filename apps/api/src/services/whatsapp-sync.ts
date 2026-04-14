import { IdentityType, MessageDirection, Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../prisma";
import * as waha from "./waha";
import { backfillConversationTimelineEvents } from "./message-timeline";

const syncMessageSchema = z
  .object({
    id: z.string().optional(),
    timestamp: z.union([z.string(), z.number()]).optional(),
    fromMe: z.boolean().optional().default(false),
    body: z.string().optional().nullable(),
    hasMedia: z.union([z.boolean(), z.string()]).optional(),
  })
  .loose();

const syncMessagesLimit = Math.max(
  1,
  Number(process.env.WAHA_SYNC_MESSAGES_LIMIT ?? 50),
);

// ============================================================================
// WhatsApp Sync Service
// Sincroniza chats do WAHA para o banco de dados
// Executado quando uma sessão conecta (status WORKING)
// ============================================================================

export interface SyncResult {
  channelId: string;
  totalChats: number;
  newContacts: number;
  newConversations: number;
  errors: number;
}

/**
 * Sincroniza todos os chats de um canal WhatsApp para o banco
 * Cria Contact, Identity e Conversation para cada chat que ainda não existe
 */
export async function syncWhatsAppChats(
  channelId: string,
  sessionName: string,
): Promise<SyncResult> {
  console.log(
    `[Sync] Iniciando sync do canal ${channelId} (sessão: ${sessionName})`,
  );

  const result: SyncResult = {
    channelId,
    totalChats: 0,
    newContacts: 0,
    newConversations: 0,
    errors: 0,
  };

  try {
    // Busca o canal com a operation
    const channel = await prisma.channel.findUnique({
      where: { id: channelId },
      include: { operation: true },
    });

    if (!channel) {
      throw new Error(`Canal ${channelId} não encontrado`);
    }

    // Puxa todos os chats do WAHA (paginando se necessário)
    const allChats: waha.WAHAChatOverview[] = [];
    let offset = 0;
    const limit = 100;
    let hasMore = true;

    while (hasMore) {
      const chats = await waha.getChatsOverview({
        sessionName,
        limit,
        offset,
      });

      allChats.push(...chats);
      offset += chats.length;
      hasMore = chats.length >= limit;

      console.log(`[Sync] Carregados ${allChats.length} chats...`);
    }

    // Filtra apenas contatos diretos (não grupos)
    const directChats = allChats.filter((chat) => chat.id.endsWith("@c.us"));
    result.totalChats = directChats.length;

    console.log(
      `[Sync] ${directChats.length} contatos diretos para sincronizar`,
    );

    // Processa cada chat
    for (const chat of directChats) {
      try {
        await syncSingleChat(chat, channel.id, sessionName);

        // Verifica se criou novo
        const waId = chat.id.replace("@c.us", "");
        const identity = await prisma.identity.findFirst({
          where: { type: IdentityType.WHATSAPP, value: waId },
        });

        // Conta como novo se foi criado agora (verificar pela conversation)
        const conversation = await prisma.conversation.findFirst({
          where: { channelId: channel.id, externalId: chat.id },
        });

        if (
          conversation?.createdAt &&
          new Date().getTime() - conversation.createdAt.getTime() < 5000
        ) {
          result.newConversations++;
        }
      } catch (error) {
        console.error(`[Sync] Erro ao sincronizar chat ${chat.id}:`, error);
        result.errors++;
      }
    }

    console.log(
      `[Sync] Concluído: ${result.newConversations} novos, ${result.errors} erros`,
    );
    return result;
  } catch (error) {
    console.error(`[Sync] Erro fatal no sync:`, error);
    throw error;
  }
}

/**
 * Sincroniza um único chat - cria Contact/Identity/Conversation se não existir
 */
async function syncSingleChat(
  chat: waha.WAHAChatOverview,
  channelId: string,
  sessionName: string,
): Promise<void> {
  const waId = chat.id.replace("@c.us", "");
  const chatId = chat.id;

  // Verifica se já existe Identity com esse waId
  let identity = await prisma.identity.findFirst({
    where: {
      type: IdentityType.WHATSAPP,
      value: waId,
    },
    include: { contact: true },
  });

  let contact: { id: string };

  if (identity) {
    // Já existe - usa o contact existente
    contact = identity.contact;
  } else {
    contact = await prisma.contact.create({
      data: {
        name: chat.name || null,
      },
    });

    identity = await prisma.identity.create({
      data: {
        type: IdentityType.WHATSAPP,
        value: waId,
        contactId: contact.id,
      },
      include: { contact: true },
    });

    console.log(`[Sync] Novo contato criado: ${chat.name || waId}`);
  }

  // Verifica se já existe Conversation para este chat
  let conversation = await prisma.conversation.findFirst({
    where: {
      channelId,
      externalId: chatId,
    },
  });

  const historyMessages = await loadChatMessages(sessionName, chatId);
  const fallbackLastMessage = chat.lastMessage
    ? [
        {
          id: chat.lastMessage.id,
          timestamp: new Date(chat.lastMessage.timestamp * 1000),
          fromMe: chat.lastMessage.fromMe,
          body: chat.lastMessage.body || "",
          hasMedia: false,
          payload: chat.lastMessage as unknown as Prisma.JsonObject,
        },
      ]
    : [];

  const normalizedMessages =
    historyMessages.length > 0 ? historyMessages : fallbackLastMessage;

  const firstMessageAt = normalizedMessages[0]?.timestamp ?? new Date();
  const lastMessageAt =
    normalizedMessages[normalizedMessages.length - 1]?.timestamp ?? firstMessageAt;
  const firstInbound = normalizedMessages.find((message) => !message.fromMe);
  const firstOutbound = normalizedMessages.find((message) => message.fromMe);

  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: {
        channelId,
        contactId: contact.id,
        externalId: chatId,
        firstMessageAt,
        lastMessageAt,
        firstInboundMessageAt: firstInbound?.timestamp ?? null,
        firstOutboundMessageAt: firstOutbound?.timestamp ?? null,
        isStartedByContact: firstInbound
          ? firstInbound.timestamp.getTime() === firstMessageAt.getTime()
          : null,
        needsAnalysis: false,
      },
    });

    console.log(`[Sync] Nova conversa criada para: ${chat.name || waId}`);
  } else {
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        contactId: contact.id,
        firstMessageAt:
          conversation.firstMessageAt <= firstMessageAt
            ? conversation.firstMessageAt
            : firstMessageAt,
        lastMessageAt:
          conversation.lastMessageAt >= lastMessageAt
            ? conversation.lastMessageAt
            : lastMessageAt,
        firstInboundMessageAt: conversation.firstInboundMessageAt ?? firstInbound?.timestamp,
        firstOutboundMessageAt:
          conversation.firstOutboundMessageAt ?? firstOutbound?.timestamp,
      },
    });
  }

  const existingMessages = await prisma.message.findMany({
    where: { conversationId: conversation.id },
    select: {
      externalId: true,
      sentAt: true,
      content: true,
      direction: true,
      hasMedia: true,
    },
  });

  const existingExternalIds = new Set(
    existingMessages
      .map((message) => message.externalId)
      .filter((value): value is string => Boolean(value)),
  );
  const existingFallbackKeys = new Set(
    existingMessages.map((message) =>
      `${message.direction}|${message.sentAt.toISOString()}|${
        message.content ?? ""
      }|${message.hasMedia}`,
    ),
  );

  for (const [index, message] of normalizedMessages.entries()) {
    const externalId = message.id ?? null;
    const fallbackKey = `${
      message.fromMe ? MessageDirection.OUTBOUND : MessageDirection.INBOUND
    }|${message.timestamp.toISOString()}|${message.body}|${message.hasMedia}`;

    if (
      (externalId && existingExternalIds.has(externalId)) ||
      existingFallbackKeys.has(fallbackKey)
    ) {
      continue;
    }

    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        contactId: contact.id,
        identityId: message.fromMe ? undefined : identity?.id,
        externalId:
          externalId ??
          `sync-${chatId}-${message.timestamp.getTime()}-${index}`,
        direction: message.fromMe
          ? MessageDirection.OUTBOUND
          : MessageDirection.INBOUND,
        content: message.body,
        hasMedia: message.hasMedia,
        sentAt: message.timestamp,
        payload: message.payload,
        requiresProcessing: false,
      },
    });

    if (externalId) {
      existingExternalIds.add(externalId);
    }
    existingFallbackKeys.add(fallbackKey);
  }

  await backfillConversationTimelineEvents(conversation.id);
}

async function loadChatMessages(sessionName: string, chatId: string) {
  try {
    const rawMessages = await waha.getChatMessages(
      sessionName,
      chatId,
      syncMessagesLimit,
    );

    return rawMessages
      .map((message) => syncMessageSchema.safeParse(message))
      .filter((result) => result.success)
      .map((result) => {
        const parsed = result.data;
        return {
          id: parsed.id,
          timestamp: resolveMessageTimestamp(parsed.timestamp),
          fromMe: parsed.fromMe,
          body: (parsed.body ?? "").trim(),
          hasMedia: toBoolean(parsed.hasMedia),
          payload: parsed as unknown as Prisma.JsonObject,
        };
      })
      .sort((left, right) => left.timestamp.getTime() - right.timestamp.getTime());
  } catch (error) {
    console.error(`[Sync] Erro ao carregar mensagens de ${chatId}:`, error);
    return [];
  }
}

function resolveMessageTimestamp(value: number | string | undefined) {
  if (value === undefined) {
    return new Date();
  }

  const asNumber = typeof value === "string" ? Number(value) : value;

  if (!Number.isFinite(asNumber)) {
    return new Date();
  }

  if (asNumber > 1_000_000_000_000) {
    return new Date(asNumber);
  }

  return new Date(asNumber * 1000);
}

function toBoolean(value: unknown) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    return value.toLowerCase() === "true";
  }

  return false;
}
