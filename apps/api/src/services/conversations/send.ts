import { MessageDirection } from "@prisma/client";
import { getChannelAdapter } from "../../channels/registry";
import { enqueue, QUEUES } from "../../jobs/boss";
import { prisma } from "../../prisma";

/** Agenda o envio (durável, com retry) de uma mensagem OUTBOUND já gravada. */
export function enqueueSendMessage(messageId: string) {
  return enqueue(QUEUES.sendMessage, { messageId }, { singletonKey: messageId });
}

/**
 * Entrega a mensagem pelo adaptador do canal e grava o ID externo.
 * Idempotente: se já tem externalId, não reenvia. Erros sobem para o retry da fila.
 */
export async function deliverMessage(messageId: string): Promise<void> {
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    include: {
      conversation: {
        include: {
          channel: true,
          contact: { include: { identities: true } },
        },
      },
    },
  });

  if (!message || message.direction !== MessageDirection.OUTBOUND) return;
  if (message.externalId || !message.content) return;

  const { channel, contact } = message.conversation;
  const identity = contact.identities.find(
    (item) => String(item.type) === String(channel.type),
  );
  if (!identity) {
    throw new Error(
      `Contato ${contact.id} sem identidade para o canal ${channel.type}`,
    );
  }

  const { externalId } = await getChannelAdapter(channel.type).send(channel, {
    to: identity.value,
    text: message.content,
  });

  if (externalId) {
    await prisma.message.update({
      where: { id: message.id },
      data: { externalId },
    });
  }
}
