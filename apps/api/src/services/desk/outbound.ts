import { EventType, MessageDirection, Prisma } from "@prisma/client";
import type { Channel, Contact, Identity, IdentityType } from "@prisma/client";
import { getChannelAdapter } from "../../channels/registry";
import { emitDeskEvent } from "../../events/bus";
import { prisma } from "../../prisma";
import { DeskError } from "./access";

type ConversationForSend = {
  id: string;
  contactId: string;
  channel: Channel;
  contact: Contact & { identities: Identity[] };
};

const CHANNEL_IDENTITY: Partial<Record<string, IdentityType>> = {
  WHATSAPP: "WHATSAPP",
  EMAIL: "EMAIL",
  INSTAGRAM: "INSTAGRAM",
};

/** Identidade do contato a usar como destinatário neste canal. */
export function recipientFor(conversation: ConversationForSend): string {
  const wanted = CHANNEL_IDENTITY[conversation.channel.type];
  const identity =
    conversation.contact.identities.find((i) => i.type === wanted) ??
    (wanted ? undefined : conversation.contact.identities[0]);
  if (!identity) {
    throw new DeskError(422, "Contato sem identidade para este canal");
  }
  return identity.value;
}

/**
 * Envia texto pelo adaptador do canal e registra a Message OUTBOUND.
 * Não mexe em métricas de primeira resposta (quem chama decide).
 */
export async function sendAndStoreMessage(params: {
  conversation: ConversationForSend;
  text: string;
  sentByAgentId: string | null;
  metadata?: Prisma.InputJsonValue;
  timeline?: boolean;
}) {
  const { conversation, text } = params;
  const to = recipientFor(conversation);
  const adapter = getChannelAdapter(conversation.channel.type);

  let externalId: string | null;
  try {
    ({ externalId } = await adapter.send(conversation.channel, { to, text }));
  } catch (error) {
    console.error("[Desk] falha ao enviar mensagem:", error);
    throw new DeskError(502, "Falha ao enviar mensagem pelo canal");
  }

  const sentAt = new Date();
  const data = {
    conversationId: conversation.id,
    contactId: conversation.contactId,
    direction: MessageDirection.OUTBOUND,
    content: text,
    externalId,
    sentAt,
    requiresProcessing: false,
    sentByAgentId: params.sentByAgentId,
    metadata: params.metadata,
  } satisfies Prisma.MessageUncheckedCreateInput;

  let message;
  try {
    message = await prisma.message.create({ data });
  } catch (error) {
    // O eco do provedor (fromMe) pode ter chegado antes: reaproveita a mensagem.
    if (
      externalId &&
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      message = await prisma.message.update({
        where: {
          conversationId_externalId: {
            conversationId: conversation.id,
            externalId,
          },
        },
        data: { sentByAgentId: params.sentByAgentId, metadata: params.metadata },
      });
    } else {
      throw error;
    }
  }

  if (params.timeline !== false) {
    await prisma.timelineEvent.create({
      data: {
        contactId: conversation.contactId,
        conversationId: conversation.id,
        type: EventType.MESSAGE_SENT,
        content: text,
        metadata: {
          channel: conversation.channel.type,
          messageId: message.id,
          sentByAgentId: params.sentByAgentId,
        },
        occurredAt: message.sentAt,
      },
    });
  }

  return message;
}

export function emitMessageCreated(
  operationId: string,
  conversationId: string,
  messageId: string,
) {
  emitDeskEvent({ type: "message.created", operationId, conversationId, messageId });
  emitDeskEvent({ type: "conversation.updated", operationId, conversationId });
}
