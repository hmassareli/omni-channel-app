import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../../src/prisma";
import { autoAssign, onInboundMessage, parseCsatScore } from "../../src/services/desk";
import { createAuthedUser } from "../helpers/auth";
import { createDeskConversation, registerFakeAdapter } from "../helpers/desk";

async function addInbound(conversationId: string, contactId: string, content: string) {
  return prisma.message.create({
    data: {
      conversationId,
      contactId,
      direction: "INBOUND",
      content,
      sentAt: new Date(Date.now() + 1000),
      externalId: `in-${Math.random()}`,
    },
  });
}

async function reload(id: string) {
  return prisma.conversation.findUniqueOrThrow({ where: { id } });
}

describe("services/desk", () => {
  beforeEach(() => {
    registerFakeAdapter("WHATSAPP");
  });

  describe("parseCsatScore", () => {
    it("aceita apenas um dígito de 1 a 5", () => {
      expect(parseCsatScore("5")).toBe(5);
      expect(parseCsatScore(" 3. ")).toBe(3);
      expect(parseCsatScore("0")).toBeNull();
      expect(parseCsatScore("6")).toBeNull();
      expect(parseCsatScore("nota 5")).toBeNull();
      expect(parseCsatScore("55")).toBeNull();
      expect(parseCsatScore(null)).toBeNull();
    });
  });

  describe("autoAssign", () => {
    it("escolhe o membro com menos conversas abertas", async () => {
      const a = await createAuthedUser({ role: "AGENT" });
      const b = await createAuthedUser({ operationId: a.operationId });
      const queue = await prisma.queue.create({ data: { name: "Q", operationId: a.operationId } });
      await prisma.queueMember.createMany({
        data: [
          { queueId: queue.id, agentId: a.agent!.id },
          { queueId: queue.id, agentId: b.agent!.id },
        ],
      });
      await createDeskConversation(a.operationId, { assignedAgentId: a.agent!.id });
      await createDeskConversation(a.operationId, { assignedAgentId: a.agent!.id });
      await createDeskConversation(a.operationId, { assignedAgentId: b.agent!.id });
      const target = await createDeskConversation(a.operationId, { queueId: queue.id });

      expect(await autoAssign(target.conversation.id)).toBe(b.agent!.id);
      expect((await reload(target.conversation.id)).assignedAgentId).toBe(b.agent!.id);
    });

    it("alterna entre membros com cargas iguais", async () => {
      const a = await createAuthedUser({ role: "AGENT" });
      const b = await createAuthedUser({ operationId: a.operationId });
      const queue = await prisma.queue.create({ data: { name: "Q", operationId: a.operationId } });
      await prisma.queueMember.createMany({
        data: [
          { queueId: queue.id, agentId: a.agent!.id },
          { queueId: queue.id, agentId: b.agent!.id },
        ],
      });
      const c1 = await createDeskConversation(a.operationId, { queueId: queue.id });
      const c2 = await createDeskConversation(a.operationId, { queueId: queue.id });
      const first = await autoAssign(c1.conversation.id);
      const second = await autoAssign(c2.conversation.id);
      expect(first).not.toBeNull();
      expect(second).not.toBe(first);
    });

    it("não atribui sem fila, sem membros ou já atribuída", async () => {
      const a = await createAuthedUser({ role: "AGENT" });
      const noQueue = await createDeskConversation(a.operationId);
      expect(await autoAssign(noQueue.conversation.id)).toBeNull();

      const empty = await prisma.queue.create({
        data: { name: "Vazia", operationId: a.operationId },
      });
      const c = await createDeskConversation(a.operationId, { queueId: empty.id });
      expect(await autoAssign(c.conversation.id)).toBeNull();

      await prisma.queueMember.create({ data: { queueId: empty.id, agentId: a.agent!.id } });
      const assigned = await createDeskConversation(a.operationId, {
        queueId: empty.id,
        assignedAgentId: a.agent!.id,
      });
      expect(await autoAssign(assigned.conversation.id)).toBeNull();
    });
  });

  describe("onInboundMessage", () => {
    it("incrementa unreadCount e distribui pela fila", async () => {
      const a = await createAuthedUser({ role: "AGENT" });
      const queue = await prisma.queue.create({ data: { name: "Q", operationId: a.operationId } });
      await prisma.queueMember.create({ data: { queueId: queue.id, agentId: a.agent!.id } });
      const c = await createDeskConversation(a.operationId, { queueId: queue.id });

      await onInboundMessage(c.conversation.id);
      await onInboundMessage(c.conversation.id);
      const conv = await reload(c.conversation.id);
      expect(conv.unreadCount).toBe(2);
      expect(conv.assignedAgentId).toBe(a.agent!.id);
    });

    it("reabre conversa RESOLVED com mensagem comum", async () => {
      const a = await createAuthedUser({ role: "AGENT" });
      const c = await createDeskConversation(a.operationId, { status: "RESOLVED" });
      await addInbound(c.conversation.id, c.contact.id, "ainda preciso de ajuda");
      await onInboundMessage(c.conversation.id);
      expect(await reload(c.conversation.id)).toMatchObject({
        status: "OPEN",
        resolvedAt: null,
        unreadCount: 1,
      });
    });

    it("grava CSAT quando aguardando e a resposta é 1-5, sem reabrir", async () => {
      const a = await createAuthedUser({ role: "AGENT" });
      const c = await createDeskConversation(a.operationId, { status: "RESOLVED" });
      await prisma.conversation.update({
        where: { id: c.conversation.id },
        data: { csatRequestedAt: new Date() },
      });
      await addInbound(c.conversation.id, c.contact.id, "5");
      await onInboundMessage(c.conversation.id);

      const csat = await prisma.csatResponse.findUnique({
        where: { conversationId: c.conversation.id },
      });
      expect(csat?.score).toBe(5);
      expect(await reload(c.conversation.id)).toMatchObject({
        status: "RESOLVED",
        unreadCount: 0,
        csatRequestedAt: null,
      });
    });

    it("dígito sem CSAT pendente reabre; texto durante CSAT reabre", async () => {
      const a = await createAuthedUser({ role: "AGENT" });
      const noPending = await createDeskConversation(a.operationId, { status: "RESOLVED" });
      await addInbound(noPending.conversation.id, noPending.contact.id, "4");
      await onInboundMessage(noPending.conversation.id);
      expect(await prisma.csatResponse.count()).toBe(0);
      expect((await reload(noPending.conversation.id)).status).toBe("OPEN");

      const pending = await createDeskConversation(a.operationId, { status: "RESOLVED" });
      await prisma.conversation.update({
        where: { id: pending.conversation.id },
        data: { csatRequestedAt: new Date() },
      });
      await addInbound(pending.conversation.id, pending.contact.id, "tenho outra dúvida");
      await onInboundMessage(pending.conversation.id);
      expect(await prisma.csatResponse.count()).toBe(0);
      expect((await reload(pending.conversation.id)).status).toBe("OPEN");
    });
  });
});
