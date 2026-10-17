import { MessageDirection } from "@prisma/client";
import type { DeliveryAck } from "../../channels/types";
import { emitDeskEvent } from "../../events/bus";
import { prisma } from "../../prisma";
import { mergeMessageMetadata, readMetadata } from "./media";

const ACK_RANK: Record<DeliveryAck, number> = { pending: 0, sent: 1, delivered: 2, read: 3 };

/**
 * IDs externos equivalentes. Alguns provedores (WhatsApp) mandam o ID ora
 * completo ("true_5511...@c.us_3EB0..."), ora só o final ("3EB0...").
 */
export function externalIdCandidates(externalId: string) {
  const tail = externalId.includes("_") ? externalId.slice(externalId.lastIndexOf("_") + 1) : externalId;
  return { exact: [...new Set([externalId, tail])], suffix: `_${tail}` };
}

/**
 * Atualiza Message.metadata.ack das mensagens enviadas no canal com esse ID externo.
 * Nunca regride (ex.: "delivered" atrasado não sobrescreve "read").
 * Devolve quantas mensagens mudaram.
 */
export async function applyDeliveryAck(
  channelId: string,
  externalMessageId: string,
  ack: DeliveryAck,
): Promise<number> {
  const { exact, suffix } = externalIdCandidates(externalMessageId);
  const messages = await prisma.message.findMany({
    where: {
      direction: MessageDirection.OUTBOUND,
      conversation: { channelId },
      OR: [{ externalId: { in: exact } }, { externalId: { endsWith: suffix } }],
    },
    select: {
      id: true,
      conversationId: true,
      metadata: true,
      conversation: { select: { channel: { select: { operationId: true } } } },
    },
    take: 5,
  });

  let changed = 0;
  const conversations = new Map<string, string | null>();
  for (const message of messages) {
    const current = readMetadata(message.metadata).ack;
    if (current && ACK_RANK[current] >= ACK_RANK[ack]) continue;
    await mergeMessageMetadata(message.id, { ack });
    changed += 1;
    conversations.set(message.conversationId, message.conversation.channel.operationId);
  }

  for (const [conversationId, operationId] of conversations) {
    if (operationId) emitDeskEvent({ type: "conversation.updated", operationId, conversationId });
  }
  return changed;
}
