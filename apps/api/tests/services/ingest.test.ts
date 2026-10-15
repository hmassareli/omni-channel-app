import { beforeEach, describe, expect, it } from "vitest";
import type { NormalizedInboundMessage } from "../../src/channels/types";
import { onDeskEvent, DeskEvent } from "../../src/events/bus";
import { prisma } from "../../src/prisma";
import { ingestChannelMessage } from "../../src/services/conversations/ingest";

let seq = 0;

function msg(overrides: Partial<NormalizedInboundMessage> = {}): NormalizedInboundMessage {
  return {
    identity: { type: "WHATSAPP", value: "5511999990000", displayName: "Cliente Teste" },
    externalMessageId: `ext-${++seq}`,
    conversationExternalId: "5511999990000@c.us",
    direction: "INBOUND",
    text: "Olá",
    hasMedia: false,
    sentAt: new Date("2026-01-01T10:00:00Z"),
    raw: { any: "thing" },
    ...overrides,
  };
}

async function setup(withOperation = true) {
  const operation = withOperation ? await prisma.operation.create({ data: { name: "Op" } }) : null;
  const channel = await prisma.channel.create({
    data: { name: "WA", type: "WHATSAPP", operationId: operation?.id },
  });
  return { operation, channel };
}

async function ingestOk(channel: Awaited<ReturnType<typeof setup>>["channel"], m: NormalizedInboundMessage) {
  const result = await ingestChannelMessage(channel, m);
  if (result.skipped) throw new Error(`ingest ignorou: ${result.reason}`);
  return result;
}

describe("ingestChannelMessage", () => {
  beforeEach(() => {
    delete process.env.GROQ_API_KEY;
  });

  it("cria contato, identidade, conversa, mensagem e evento de timeline", async () => {
    const { channel } = await setup();
    const result = await ingestOk(channel, msg({ text: "Primeira" }));

    const conversation = await prisma.conversation.findUniqueOrThrow({
      where: { id: result.conversationId },
      include: { contact: { include: { identities: true } }, messages: true, events: true },
    });
    expect(conversation.contact.name).toBe("Cliente Teste");
    expect(conversation.contact.identities).toHaveLength(1);
    expect(conversation.channelId).toBe(channel.id);
    expect(conversation.externalId).toBe("5511999990000@c.us");
    expect(conversation.isStartedByContact).toBe(true);
    expect(conversation.firstInboundMessageAt?.toISOString()).toBe("2026-01-01T10:00:00.000Z");
    expect(conversation.messages).toHaveLength(1);
    expect(conversation.messages[0]).toMatchObject({ direction: "INBOUND", content: "Primeira" });
    expect(conversation.events).toHaveLength(1);
    expect(conversation.events[0].type).toBe("MESSAGE_RECEIVED");
  });

  it("INBOUND incrementa unreadCount exatamente uma vez por mensagem", async () => {
    const { channel } = await setup();
    const first = await ingestOk(channel, msg());
    expect((await prisma.conversation.findUniqueOrThrow({ where: { id: first.conversationId } })).unreadCount).toBe(1);

    await ingestOk(channel, msg({ sentAt: new Date("2026-01-01T10:01:00Z") }));
    expect((await prisma.conversation.findUniqueOrThrow({ where: { id: first.conversationId } })).unreadCount).toBe(2);
  });

  it("reaproveita contato e conversa para a mesma identidade/canal", async () => {
    const { channel } = await setup();
    const a = await ingestOk(channel, msg());
    const b = await ingestOk(channel, msg());
    expect(b.conversationId).toBe(a.conversationId);
    expect(await prisma.contact.count()).toBe(1);
    expect(await prisma.conversation.count()).toBe(1);
  });

  it("é idempotente por externalId: duplicada vira skipped e não incrementa unreadCount", async () => {
    const { channel } = await setup();
    const m = msg({ externalMessageId: "dup-1" });
    const first = await ingestOk(channel, m);
    const second = await ingestChannelMessage(channel, m);

    expect(second).toEqual({ skipped: true, reason: "duplicate-message" });
    expect(await prisma.message.count()).toBe(1);
    const conversation = await prisma.conversation.findUniqueOrThrow({ where: { id: first.conversationId } });
    expect(conversation.unreadCount).toBe(1);
  });

  it("mensagem INBOUND reabre conversa RESOLVED", async () => {
    const { channel } = await setup();
    const first = await ingestOk(channel, msg());
    await prisma.conversation.update({
      where: { id: first.conversationId },
      data: { status: "RESOLVED", resolvedAt: new Date(), unreadCount: 0 },
    });

    await ingestOk(channel, msg({ text: "Ainda preciso de ajuda", sentAt: new Date("2026-01-02T10:00:00Z") }));

    const conversation = await prisma.conversation.findUniqueOrThrow({ where: { id: first.conversationId } });
    expect(conversation.status).toBe("OPEN");
    expect(conversation.resolvedAt).toBeNull();
    expect(conversation.unreadCount).toBe(1);
  });

  it("nota CSAT (dígito 1-5) com espera pendente grava a nota e NÃO reabre", async () => {
    const { channel } = await setup();
    const first = await ingestOk(channel, msg());
    await prisma.conversation.update({
      where: { id: first.conversationId },
      data: { status: "RESOLVED", resolvedAt: new Date(), csatRequestedAt: new Date(), unreadCount: 0 },
    });

    await ingestOk(channel, msg({ text: "5", sentAt: new Date("2026-01-02T10:00:00Z") }));

    const conversation = await prisma.conversation.findUniqueOrThrow({
      where: { id: first.conversationId },
      include: { csat: true },
    });
    expect(conversation.status).toBe("RESOLVED");
    expect(conversation.csat?.score).toBe(5);
    expect(conversation.csatRequestedAt).toBeNull();
  });

  it("OUTBOUND (fromMe) não incrementa unreadCount nem reabre; registra primeira resposta", async () => {
    const { channel } = await setup();
    const first = await ingestOk(channel, msg());
    const out = await ingestOk(
      channel,
      msg({ direction: "OUTBOUND", text: "Resposta", sentAt: new Date("2026-01-01T10:05:00Z") }),
    );
    expect(out.conversationId).toBe(first.conversationId);

    const conversation = await prisma.conversation.findUniqueOrThrow({ where: { id: first.conversationId } });
    expect(conversation.unreadCount).toBe(1);
    expect(conversation.firstResponseAt?.toISOString()).toBe("2026-01-01T10:05:00.000Z");
    expect(conversation.timeToFirstInteraction).toBe(300);
    expect(conversation.lastMessageAt.toISOString()).toBe("2026-01-01T10:05:00.000Z");
  });

  it("emite message.created para canal com operação", async () => {
    const { channel, operation } = await setup();
    const events: DeskEvent[] = [];
    const off = onDeskEvent((e) => events.push(e));
    try {
      const result = await ingestOk(channel, msg());
      expect(events).toContainEqual({
        type: "message.created",
        operationId: operation!.id,
        conversationId: result.conversationId,
        messageId: result.messageId,
      });
      expect(events.some((e) => e.type === "conversation.updated")).toBe(true);
    } finally {
      off?.();
    }
  });

  it("canal órfão (sem operação): grava, mas não aciona a mesa (sem unreadCount nem eventos)", async () => {
    const { channel } = await setup(false);
    const events: DeskEvent[] = [];
    const off = onDeskEvent((e) => events.push(e));
    try {
      const result = await ingestOk(channel, msg());
      expect(events).toHaveLength(0);
      const conversation = await prisma.conversation.findUniqueOrThrow({ where: { id: result.conversationId } });
      expect(conversation.unreadCount).toBe(0);
      expect(await prisma.message.count()).toBe(1);
    } finally {
      off?.();
    }
  });

  it("distribui automaticamente quando a conversa tem fila com membros", async () => {
    const { channel, operation } = await setup();
    const agent = await prisma.agent.create({ data: { name: "A1", operationId: operation!.id } });
    const queue = await prisma.queue.create({
      data: { name: "Suporte", operationId: operation!.id, members: { create: { agentId: agent.id } } },
    });
    const first = await ingestOk(channel, msg());
    await prisma.conversation.update({ where: { id: first.conversationId }, data: { queueId: queue.id } });

    await ingestOk(channel, msg({ sentAt: new Date("2026-01-01T10:02:00Z") }));

    const conversation = await prisma.conversation.findUniqueOrThrow({ where: { id: first.conversationId } });
    expect(conversation.assignedAgentId).toBe(agent.id);
  });
});
