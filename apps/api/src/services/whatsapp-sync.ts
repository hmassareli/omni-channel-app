import { IdentityType, MessageDirection, Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import * as waha from "./waha";

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
  sessionName: string
): Promise<SyncResult> {
  console.log(`[Sync] Iniciando sync do canal ${channelId} (sessão: ${sessionName})`);

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

    console.log(`[Sync] ${directChats.length} contatos diretos para sincronizar`);

    // Processa cada chat
    for (const chat of directChats) {
      try {
        await syncSingleChat(chat, channel.id, channel.operationId);
        
        // Verifica se criou novo
        const waId = chat.id.replace("@c.us", "");
        const identity = await prisma.identity.findFirst({
          where: { type: IdentityType.WHATSAPP, value: waId },
        });
        
        // Conta como novo se foi criado agora (verificar pela conversation)
        const conversation = await prisma.conversation.findFirst({
          where: { channelId: channel.id, externalId: chat.id },
        });
        
        if (conversation?.createdAt && 
            new Date().getTime() - conversation.createdAt.getTime() < 5000) {
          result.newConversations++;
        }
      } catch (error) {
        console.error(`[Sync] Erro ao sincronizar chat ${chat.id}:`, error);
        result.errors++;
      }
    }

    console.log(`[Sync] Concluído: ${result.newConversations} novos, ${result.errors} erros`);
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
  operationId: string
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
    // Cria novo Contact + Identity
    contact = await prisma.contact.create({
      data: {
        name: chat.name || null,
        operationId,
        identities: {
          create: {
            type: IdentityType.WHATSAPP,
            value: waId,
          },
        },
      },
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

  if (!conversation) {
    // Determina timestamps da última mensagem
    const lastMessageAt = chat.lastMessage?.timestamp
      ? new Date(chat.lastMessage.timestamp * 1000)
      : new Date();

    // Cria a Conversation
    conversation = await prisma.conversation.create({
      data: {
        channelId,
        contactId: contact.id,
        externalId: chatId,
        lastMessageAt,
        firstMessageAt: lastMessageAt,
        // Se temos a última mensagem, registramos alguns dados
        ...(chat.lastMessage && {
          firstInboundMessageAt: !chat.lastMessage.fromMe ? lastMessageAt : null,
          firstOutboundMessageAt: chat.lastMessage.fromMe ? lastMessageAt : null,
          isStartedByContact: !chat.lastMessage.fromMe,
        }),
      },
    });

    console.log(`[Sync] Nova conversa criada para: ${chat.name || waId}`);

    // Cria a última mensagem se existir
    if (chat.lastMessage) {
      await prisma.message.create({
        data: {
          conversationId: conversation.id,
          externalId: chat.lastMessage.id || `sync-${Date.now()}`,
          direction: chat.lastMessage.fromMe
            ? MessageDirection.OUTBOUND
            : MessageDirection.INBOUND,
          content: chat.lastMessage.body || "",
          sentAt: lastMessageAt,
          payload: chat.lastMessage as unknown as Prisma.JsonObject,
          requiresProcessing: false, // Já processado no sync
        },
      });
    }
  }
}
