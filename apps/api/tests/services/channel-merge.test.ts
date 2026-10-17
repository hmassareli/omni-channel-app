import { describe, expect, it } from "vitest";
import { prisma } from "../../src/prisma";
import { mergeChannelInto } from "../../src/services/channels/merge";

let seq = 0;

async function channel(operationId: string | null, extra: { number?: string; session?: boolean } = {}) {
  const n = ++seq;
  return prisma.channel.create({
    data: {
      name: `Canal ${n}`,
      type: "WHATSAPP",
      operationId,
      externalIdentifier: extra.number,
      ...(extra.session ? { whatsappDetails: { create: { sessionName: `merge-${n}-${Date.now()}` } } } : {}),
    },
  });
}

async function contact(name: string) {
  return prisma.contact.create({ data: { name } });
}

async function conversation(
  channelId: string,
  contactId: string,
  at: string,
  messages: Array<{ externalId: string; direction?: "INBOUND" | "OUTBOUND" }>,
  extra: { status?: "OPEN" | "RESOLVED"; unread?: number; queueId?: string } = {},
) {
  const sentAt = new Date(at);
  const conv = await prisma.conversation.create({
    data: {
      channelId,
      contactId,
      firstMessageAt: sentAt,
      lastMessageAt: sentAt,
      status: extra.status ?? "OPEN",
      unreadCount: extra.unread ?? 0,
      queueId: extra.queueId,
    },
  });
  for (const [i, m] of messages.entries()) {
    const message = await prisma.message.create({
      data: {
        conversationId: conv.id,
        contactId,
        direction: m.direction ?? "INBOUND",
        content: m.externalId,
        externalId: m.externalId,
        sentAt: new Date(sentAt.getTime() + i * 1000),
      },
    });
    await prisma.timelineEvent.create({
      data: {
        contactId,
        conversationId: conv.id,
        type: m.direction === "OUTBOUND" ? "MESSAGE_SENT" : "MESSAGE_RECEIVED",
        content: m.externalId,
        metadata: { whatsapp: { messageId: message.id } },
      },
    });
  }
  return conv;
}

describe("mergeChannelInto", () => {
  it("move conversas, une as do mesmo contato sem duplicar e arquiva o antigo como registro", async () => {
    const op = await prisma.operation.create({ data: { name: "Op merge" } });
    const old = await channel(null, { number: "5511911112222", session: true });
    const current = await channel(op.id, { session: true });
    const ana = await contact("Ana");
    const bia = await contact("Bia");

    // Ana: histórico só no antigo. Bia: nos dois, com uma mensagem repetida (eco).
    await conversation(old.id, ana.id, "2026-04-01T10:00:00Z", [{ externalId: "a1" }, { externalId: "a2" }]);
    const biaOld = await conversation(
      old.id,
      bia.id,
      "2026-10-17T16:40:20Z",
      [{ externalId: "dup", direction: "OUTBOUND" }, { externalId: "reply" }],
      { unread: 1 },
    );
    const biaNew = await conversation(current.id, bia.id, "2026-05-01T09:00:00Z", [
      { externalId: "b0" },
      { externalId: "dup", direction: "OUTBOUND" },
    ]);

    const stats = await mergeChannelInto(old.id, current.id);
    expect(stats).toEqual({ moved: 1, merged: 1, duplicates: 1 });

    const convs = await prisma.conversation.findMany({ where: { channelId: current.id } });
    expect(convs).toHaveLength(2);
    expect(await prisma.conversation.count({ where: { channelId: old.id } })).toBe(0);
    expect(await prisma.conversation.findUnique({ where: { id: biaOld.id } })).toBeNull();

    const biaMessages = await prisma.message.findMany({
      where: { conversationId: biaNew.id },
      orderBy: { sentAt: "asc" },
    });
    expect(biaMessages.map((m) => m.externalId)).toEqual(["b0", "dup", "reply"]);
    expect(await prisma.timelineEvent.count({ where: { conversationId: biaNew.id } })).toBe(3);

    const merged = await prisma.conversation.findUniqueOrThrow({ where: { id: biaNew.id } });
    expect(merged.firstMessageAt.toISOString()).toBe("2026-05-01T09:00:00.000Z");
    expect(merged.lastMessageAt.toISOString()).toBe("2026-10-17T16:40:20.000Z");
    expect(merged.unreadCount).toBe(1);

    const archived = await prisma.channel.findUniqueOrThrow({
      where: { id: old.id },
      include: { whatsappDetails: true },
    });
    expect(archived.replacedById).toBe(current.id);
    expect(archived.archivedAt).not.toBeNull();
    expect(archived.externalIdentifier).toBeNull();
    expect(archived.whatsappDetails).toBeNull();
  });

  it("canal de outra operação: fila e atendente da conversa não vêm junto", async () => {
    const opA = await prisma.operation.create({ data: { name: "Op A" } });
    const opB = await prisma.operation.create({ data: { name: "Op B" } });
    const queue = await prisma.queue.create({ data: { operationId: opA.id, name: "Suporte" } });
    const old = await channel(opA.id);
    const current = await channel(opB.id);
    const ana = await contact("Ana");
    const conv = await conversation(old.id, ana.id, "2026-04-01T10:00:00Z", [{ externalId: "x" }], {
      queueId: queue.id,
    });

    await mergeChannelInto(old.id, current.id);
    const moved = await prisma.conversation.findUniqueOrThrow({ where: { id: conv.id } });
    expect(moved.channelId).toBe(current.id);
    expect(moved.queueId).toBeNull();
  });
});
