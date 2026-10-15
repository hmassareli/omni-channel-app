import type { Channel, ChannelType } from "@prisma/client";
import { registerChannelAdapter } from "../../src/channels/registry";
import type { ChannelAdapter, OutboundMessage } from "../../src/channels/types";
import { prisma } from "../../src/prisma";

export interface FakeAdapter {
  sent: Array<{ channel: Channel; message: OutboundMessage }>;
  failNext: boolean;
}

/** Registra um adaptador fake para o tipo e devolve o espião de envios. */
export function registerFakeAdapter(type: ChannelType = "WHATSAPP"): FakeAdapter {
  const spy: FakeAdapter = { sent: [], failNext: false };
  const adapter: ChannelAdapter = {
    type,
    parseWebhook: () => [],
    async send(channel, message) {
      if (spy.failNext) {
        spy.failNext = false;
        throw new Error("falha simulada");
      }
      spy.sent.push({ channel, message });
      return { externalId: `fake-${spy.sent.length}-${Date.now()}` };
    },
  };
  registerChannelAdapter(adapter);
  return spy;
}

let seq = 0;

/** Canal + contato (com identidade WhatsApp) + conversa. */
export async function createDeskConversation(
  operationId: string,
  overrides: {
    channelId?: string;
    status?: "OPEN" | "PENDING" | "RESOLVED";
    assignedAgentId?: string | null;
    queueId?: string | null;
    contactName?: string;
    lastMessageAt?: Date;
    inbound?: string | null;
    unreadCount?: number;
  } = {},
) {
  const n = ++seq;
  const channel = overrides.channelId
    ? await prisma.channel.findUniqueOrThrow({ where: { id: overrides.channelId } })
    : await prisma.channel.create({
        data: { name: `Canal ${n}`, type: "WHATSAPP", operationId },
      });
  const contact = await prisma.contact.create({
    data: {
      name: overrides.contactName ?? `Cliente ${n}`,
      identities: { create: { type: "WHATSAPP", value: `5511${String(90000000 + n)}${Date.now() % 1000}` } },
    },
  });
  const at = overrides.lastMessageAt ?? new Date();
  const hasInbound = overrides.inbound !== null;
  const conversation = await prisma.conversation.create({
    data: {
      contactId: contact.id,
      channelId: channel.id,
      firstMessageAt: at,
      lastMessageAt: at,
      firstInboundMessageAt: hasInbound ? at : null,
      isStartedByContact: hasInbound ? true : null,
      status: overrides.status ?? "OPEN",
      assignedAgentId: overrides.assignedAgentId ?? null,
      queueId: overrides.queueId ?? null,
      unreadCount: overrides.unreadCount ?? 0,
      ...(overrides.status === "RESOLVED" ? { resolvedAt: new Date() } : {}),
    },
  });
  if (hasInbound) {
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        contactId: contact.id,
        direction: "INBOUND",
        content: overrides.inbound ?? "Olá",
        sentAt: at,
        externalId: `in-${n}-${Date.now()}`,
      },
    });
  }
  return { channel, contact, conversation };
}
