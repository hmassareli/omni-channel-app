import { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { DeskEvent, emitDeskEvent, onDeskEvent } from "../../src/events/bus";
import { buildApp } from "../../src/index";
import { prisma } from "../../src/prisma";
import { CSAT_QUESTION } from "../../src/services/desk";
import { createAuthedUser, testTokenVerifier } from "../helpers/auth";
import {
  createDeskConversation,
  FakeAdapter,
  registerFakeAdapter,
} from "../helpers/desk";

describe("Mesa de atendimento (rotas)", () => {
  let app: FastifyInstance;
  let adapter: FakeAdapter;

  beforeAll(async () => {
    app = await buildApp({ tokenVerifier: testTokenVerifier });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    adapter = registerFakeAdapter("WHATSAPP");
  });

  const get = (url: string, headers: Record<string, string>) =>
    app.inject({ method: "GET", url, headers });
  const post = (url: string, headers: Record<string, string>, payload?: unknown) =>
    app.inject({ method: "POST", url, headers, payload: payload as object });
  const put = (url: string, headers: Record<string, string>, payload?: unknown) =>
    app.inject({ method: "PUT", url, headers, payload: payload as object });
  const del = (url: string, headers: Record<string, string>) =>
    app.inject({ method: "DELETE", url, headers });

  describe("autenticação", () => {
    it("exige token", async () => {
      for (const url of ["/conversations", "/queues", "/metrics/desk", "/events"]) {
        expect((await app.inject({ method: "GET", url })).statusCode).toBe(401);
      }
    });
  });

  describe("GET /conversations", () => {
    it("lista no formato do contrato, filtra por operação e pagina por cursor", async () => {
      const a = await createAuthedUser({ role: "ADMIN" });
      const other = await createAuthedUser({ role: "ADMIN" });
      const base = Date.now();
      for (let i = 0; i < 3; i++) {
        await createDeskConversation(a.operationId, {
          lastMessageAt: new Date(base - i * 60_000),
          contactName: `Cliente ${i}`,
        });
      }
      await createDeskConversation(other.operationId);

      const first = (await get("/conversations?limit=2", a.headers)).json();
      expect(first.conversations).toHaveLength(2);
      expect(first.nextCursor).toBeTruthy();
      expect(first.conversations[0]).toMatchObject({
        status: "OPEN",
        unreadCount: 0,
        assignedAgent: null,
        queue: null,
        contact: { name: "Cliente 0", company: null },
        channel: { type: "WHATSAPP" },
        lastMessage: { content: "Olá", direction: "INBOUND" },
      });

      const second = (
        await get(`/conversations?limit=2&cursor=${first.nextCursor}`, a.headers)
      ).json();
      expect(second.conversations).toHaveLength(1);
      expect(second.nextCursor).toBeNull();
      expect(second.conversations[0].contact.name).toBe("Cliente 2");
    });

    it("filtra por status, assignee e search", async () => {
      const admin = await createAuthedUser({ role: "ADMIN" });
      const agentU = await createAuthedUser({ role: "AGENT", operationId: admin.operationId });
      await createDeskConversation(admin.operationId, {
        status: "RESOLVED",
        contactName: "Maria Silva",
      });
      await createDeskConversation(admin.operationId, {
        assignedAgentId: agentU.agent!.id,
        contactName: "João",
      });

      const resolved = (await get("/conversations?status=RESOLVED", admin.headers)).json();
      expect(resolved.conversations.map((c: any) => c.contact.name)).toEqual(["Maria Silva"]);

      const unassigned = (await get("/conversations?assignee=unassigned", admin.headers)).json();
      expect(unassigned.conversations).toHaveLength(1);

      const byAgent = (
        await get(`/conversations?assignee=${agentU.agent!.id}`, admin.headers)
      ).json();
      expect(byAgent.conversations[0].assignedAgent.id).toBe(agentU.agent!.id);

      const mine = (await get("/conversations?assignee=me", agentU.headers)).json();
      expect(mine.conversations).toHaveLength(1);

      const search = (await get("/conversations?search=maria", admin.headers)).json();
      expect(search.conversations).toHaveLength(1);
    });

    it("AGENT vê só as suas e as não atribuídas", async () => {
      const admin = await createAuthedUser({ role: "ADMIN" });
      const me = await createAuthedUser({ role: "AGENT", operationId: admin.operationId });
      const colleague = await createAuthedUser({ role: "AGENT", operationId: admin.operationId });
      const mine = await createDeskConversation(admin.operationId, {
        assignedAgentId: me.agent!.id,
      });
      const free = await createDeskConversation(admin.operationId);
      const theirs = await createDeskConversation(admin.operationId, {
        assignedAgentId: colleague.agent!.id,
      });

      const list = (await get("/conversations", me.headers)).json();
      const ids = list.conversations.map((c: any) => c.id).sort();
      expect(ids).toEqual([mine.conversation.id, free.conversation.id].sort());

      expect((await get(`/conversations/${theirs.conversation.id}`, me.headers)).statusCode).toBe(404);
      expect(
        (await post(`/conversations/${theirs.conversation.id}/messages`, me.headers, { text: "oi" }))
          .statusCode,
      ).toBe(404);
      expect((await get(`/conversations/${theirs.conversation.id}`, admin.headers)).statusCode).toBe(200);
    });

    it("AGENT não vê conversas de fila da qual não é membro", async () => {
      const admin = await createAuthedUser({ role: "ADMIN" });
      const me = await createAuthedUser({ role: "AGENT", operationId: admin.operationId });
      const queue = await prisma.queue.create({
        data: { name: "Financeiro", operationId: admin.operationId },
      });
      const c = await createDeskConversation(admin.operationId, { queueId: queue.id });
      expect((await get(`/conversations/${c.conversation.id}`, me.headers)).statusCode).toBe(404);
      await prisma.queueMember.create({ data: { queueId: queue.id, agentId: me.agent!.id } });
      expect((await get(`/conversations/${c.conversation.id}`, me.headers)).statusCode).toBe(200);
    });

    it("não vaza conversa de outra operação", async () => {
      const a = await createAuthedUser({ role: "ADMIN" });
      const b = await createAuthedUser({ role: "ADMIN" });
      const c = await createDeskConversation(b.operationId);
      expect((await get(`/conversations/${c.conversation.id}`, a.headers)).statusCode).toBe(404);
      expect((await get(`/conversations/${c.conversation.id}/messages`, a.headers)).statusCode).toBe(404);
    });
  });

  describe("GET /conversations/:id", () => {
    it("retorna detalhe com summary, firstResponseAt, resolvedAt e csat", async () => {
      const u = await createAuthedUser({ role: "ADMIN" });
      const c = await createDeskConversation(u.operationId);
      await prisma.csatResponse.create({
        data: { conversationId: c.conversation.id, score: 5, comment: "top" },
      });
      const res = await get(`/conversations/${c.conversation.id}`, u.headers);
      expect(res.statusCode).toBe(200);
      expect(res.json().conversation).toMatchObject({
        id: c.conversation.id,
        summary: null,
        firstResponseAt: null,
        resolvedAt: null,
        csat: { score: 5, comment: "top" },
      });
    });

    it("GET messages devolve mensagens e hasMore", async () => {
      const u = await createAuthedUser({ role: "ADMIN" });
      const c = await createDeskConversation(u.operationId);
      const res = await get(`/conversations/${c.conversation.id}/messages`, u.headers);
      expect(res.statusCode).toBe(200);
      expect(res.json().messages).toHaveLength(1);
      expect(res.json().hasMore).toBe(false);
    });
  });

  describe("POST /conversations/:id/messages", () => {
    it("envia pelo adaptador, registra métricas, assume e emite eventos", async () => {
      const u = await createAuthedUser({ role: "AGENT" });
      const c = await createDeskConversation(u.operationId, { unreadCount: 3 });
      const events: DeskEvent[] = [];
      const off = onDeskEvent((e) => events.push(e));

      const res = await post(`/conversations/${c.conversation.id}/messages`, u.headers, {
        text: "Olá, como posso ajudar?",
      });
      off();

      expect(res.statusCode).toBe(201);
      expect(res.json().message).toMatchObject({
        direction: "OUTBOUND",
        content: "Olá, como posso ajudar?",
        sentByAgentId: u.agent!.id,
      });
      expect(adapter.sent).toHaveLength(1);
      expect(adapter.sent[0].message.text).toBe("Olá, como posso ajudar?");

      const conv = await prisma.conversation.findUniqueOrThrow({
        where: { id: c.conversation.id },
      });
      expect(conv.firstResponseAt).not.toBeNull();
      expect(conv.firstOutboundMessageAt).not.toBeNull();
      expect(conv.timeToFirstInteraction).toBeGreaterThanOrEqual(0);
      expect(conv.assignedAgentId).toBe(u.agent!.id);
      expect(conv.unreadCount).toBe(0);

      const timeline = await prisma.timelineEvent.findMany({
        where: { conversationId: c.conversation.id, type: "MESSAGE_SENT" },
      });
      expect(timeline).toHaveLength(1);
      expect(events.map((e) => e.type)).toContain("message.created");
      expect(events.map((e) => e.type)).toContain("conversation.updated");
    });

    it("não sobrescreve firstResponseAt na segunda resposta", async () => {
      const u = await createAuthedUser({ role: "ADMIN" });
      const c = await createDeskConversation(u.operationId);
      const url = `/conversations/${c.conversation.id}/messages`;
      await post(url, u.headers, { text: "1" });
      const first = await prisma.conversation.findUniqueOrThrow({ where: { id: c.conversation.id } });
      await post(url, u.headers, { text: "2" });
      const second = await prisma.conversation.findUniqueOrThrow({ where: { id: c.conversation.id } });
      expect(second.firstResponseAt).toEqual(first.firstResponseAt);
    });

    it("valida texto e devolve 502 se o canal falhar (sem gravar)", async () => {
      const u = await createAuthedUser({ role: "ADMIN" });
      const c = await createDeskConversation(u.operationId);
      const url = `/conversations/${c.conversation.id}/messages`;
      expect((await post(url, u.headers, { text: "  " })).statusCode).toBe(400);
      adapter.failNext = true;
      expect((await post(url, u.headers, { text: "oi" })).statusCode).toBe(502);
      expect(
        await prisma.message.count({
          where: { conversationId: c.conversation.id, direction: "OUTBOUND" },
        }),
      ).toBe(0);
    });
  });

  describe("POST /conversations/:id/assign", () => {
    it("ADMIN atribui, desatribui e define fila", async () => {
      const admin = await createAuthedUser({ role: "ADMIN" });
      const agentU = await createAuthedUser({ operationId: admin.operationId });
      const queue = await prisma.queue.create({
        data: { name: "Vendas", operationId: admin.operationId },
      });
      const c = await createDeskConversation(admin.operationId);
      const url = `/conversations/${c.conversation.id}/assign`;

      let res = await post(url, admin.headers, {
        agentId: agentU.agent!.id,
        queueId: queue.id,
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().conversation).toMatchObject({
        assignedAgent: { id: agentU.agent!.id },
        queue: { id: queue.id, name: "Vendas" },
      });

      res = await post(url, admin.headers, { agentId: null });
      expect(res.json().conversation.assignedAgent).toBeNull();
    });

    it("rejeita agente de outra operação", async () => {
      const admin = await createAuthedUser({ role: "ADMIN" });
      const foreign = await createAuthedUser({ role: "AGENT" });
      const c = await createDeskConversation(admin.operationId);
      const res = await post(`/conversations/${c.conversation.id}/assign`, admin.headers, {
        agentId: foreign.agent!.id,
      });
      expect(res.statusCode).toBe(404);
    });

    it("AGENT só assume para si ou devolve a própria", async () => {
      const admin = await createAuthedUser({ role: "ADMIN" });
      const me = await createAuthedUser({ operationId: admin.operationId });
      const other = await createAuthedUser({ operationId: admin.operationId });
      const c = await createDeskConversation(admin.operationId);
      const url = `/conversations/${c.conversation.id}/assign`;

      expect((await post(url, me.headers, { agentId: other.agent!.id })).statusCode).toBe(403);
      expect((await post(url, me.headers, { agentId: me.agent!.id })).statusCode).toBe(200);
      expect((await post(url, me.headers, { agentId: null })).statusCode).toBe(200);
    });
  });

  describe("POST /conversations/:id/status", () => {
    it("RESOLVED define resolvedAt e envia pergunta de CSAT", async () => {
      const u = await createAuthedUser({ role: "ADMIN" });
      const c = await createDeskConversation(u.operationId);
      const res = await post(`/conversations/${c.conversation.id}/status`, u.headers, {
        status: "RESOLVED",
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().conversation.status).toBe("RESOLVED");
      expect(res.json().conversation.resolvedAt).toBeTruthy();
      expect(adapter.sent.map((s) => s.message.text)).toEqual([CSAT_QUESTION]);
      const conv = await prisma.conversation.findUniqueOrThrow({ where: { id: c.conversation.id } });
      expect(conv.csatRequestedAt).not.toBeNull();
      // A pergunta de CSAT não conta como primeira resposta.
      expect(conv.firstResponseAt).toBeNull();
    });

    it("resolve mesmo se o envio do CSAT falhar; reabrir limpa resolvedAt", async () => {
      const u = await createAuthedUser({ role: "ADMIN" });
      const c = await createDeskConversation(u.operationId);
      const url = `/conversations/${c.conversation.id}/status`;
      adapter.failNext = true;
      const res = await post(url, u.headers, { status: "RESOLVED" });
      expect(res.statusCode).toBe(200);
      expect(res.json().conversation.status).toBe("RESOLVED");

      const reopen = await post(url, u.headers, { status: "OPEN" });
      expect(reopen.json().conversation).toMatchObject({ status: "OPEN", resolvedAt: null });
    });

    it("PENDING e status inválido", async () => {
      const u = await createAuthedUser({ role: "ADMIN" });
      const c = await createDeskConversation(u.operationId);
      const url = `/conversations/${c.conversation.id}/status`;
      expect((await post(url, u.headers, { status: "PENDING" })).json().conversation.status).toBe(
        "PENDING",
      );
      expect((await post(url, u.headers, { status: "XYZ" })).statusCode).toBe(400);
    });
  });

  describe("notas e leitura", () => {
    it("POST notes cria TimelineEvent NOTE", async () => {
      const u = await createAuthedUser({ role: "AGENT" });
      const c = await createDeskConversation(u.operationId);
      const res = await post(`/conversations/${c.conversation.id}/notes`, u.headers, {
        text: "cliente VIP",
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().event).toMatchObject({ type: "NOTE", content: "cliente VIP" });
      expect(adapter.sent).toHaveLength(0);
    });

    it("POST read zera unreadCount (204)", async () => {
      const u = await createAuthedUser({ role: "AGENT" });
      const c = await createDeskConversation(u.operationId, { unreadCount: 4 });
      const res = await post(`/conversations/${c.conversation.id}/read`, u.headers);
      expect(res.statusCode).toBe(204);
      const conv = await prisma.conversation.findUniqueOrThrow({ where: { id: c.conversation.id } });
      expect(conv.unreadCount).toBe(0);
    });
  });

  describe("/queues", () => {
    it("CRUD e membros (ADMIN); AGENT só lista", async () => {
      const admin = await createAuthedUser({ role: "ADMIN" });
      const agentU = await createAuthedUser({ operationId: admin.operationId });

      const created = await post("/queues", admin.headers, { name: "Suporte" });
      expect(created.statusCode).toBe(201);
      const id = created.json().queue.id;

      expect((await post("/queues", admin.headers, { name: "Suporte" })).statusCode).toBe(409);
      expect((await post("/queues", agentU.headers, { name: "X" })).statusCode).toBe(403);

      const members = await put(`/queues/${id}/members`, admin.headers, {
        agentIds: [agentU.agent!.id],
      });
      expect(members.statusCode).toBe(200);
      expect(members.json().queue.members.map((m: any) => m.id)).toEqual([agentU.agent!.id]);

      const foreign = await createAuthedUser({ role: "AGENT" });
      const bad = await put(`/queues/${id}/members`, admin.headers, {
        agentIds: [foreign.agent!.id],
      });
      expect(bad.statusCode).toBe(400);

      const renamed = await put(`/queues/${id}`, admin.headers, { name: "Suporte N2" });
      expect(renamed.json().queue.name).toBe("Suporte N2");

      expect((await get("/queues", agentU.headers)).json().queues).toHaveLength(1);

      const outsider = await createAuthedUser({ role: "ADMIN" });
      expect((await get("/queues", outsider.headers)).json().queues).toHaveLength(0);
      expect((await del(`/queues/${id}`, outsider.headers)).statusCode).toBe(404);

      expect((await del(`/queues/${id}`, admin.headers)).statusCode).toBe(204);
    });
  });

  describe("GET /metrics/desk", () => {
    it("só ADMIN/MANAGER", async () => {
      const agentU = await createAuthedUser({ role: "AGENT" });
      expect((await get("/metrics/desk", agentU.headers)).statusCode).toBe(403);
    });

    it("agrega totais, tempos, CSAT, agente, fila e volume", async () => {
      const admin = await createAuthedUser({ role: "ADMIN" });
      const agentU = await createAuthedUser({ operationId: admin.operationId, name: "Ana" });
      const queue = await prisma.queue.create({
        data: { name: "Vendas", operationId: admin.operationId },
      });

      const open = await createDeskConversation(admin.operationId, {
        queueId: queue.id,
        assignedAgentId: agentU.agent!.id,
      });
      await prisma.conversation.update({
        where: { id: open.conversation.id },
        data: { firstResponseAt: new Date(), timeToFirstInteraction: 60 },
      });
      const resolved = await createDeskConversation(admin.operationId, {
        status: "RESOLVED",
        assignedAgentId: agentU.agent!.id,
      });
      await prisma.conversation.update({
        where: { id: resolved.conversation.id },
        data: {
          firstMessageAt: new Date(Date.now() - 600_000),
          resolvedAt: new Date(),
          firstResponseAt: new Date(),
          timeToFirstInteraction: 120,
        },
      });
      await prisma.csatResponse.create({
        data: { conversationId: resolved.conversation.id, score: 4 },
      });
      await createDeskConversation(admin.operationId);
      await createDeskConversation((await createAuthedUser()).operationId); // outra operação

      const res = await get("/metrics/desk", admin.headers);
      expect(res.statusCode).toBe(200);
      const m = res.json();
      expect(m.totals).toEqual({ open: 2, pending: 0, resolved: 1, unassigned: 1 });
      expect(m.firstResponseAvgSeconds).toBe(90);
      expect(m.resolutionAvgSeconds).toBeGreaterThanOrEqual(599);
      expect(m.csat).toEqual({ avg: 4, count: 1 });
      const ana = m.byAgent.find((a: any) => a.agentId === agentU.agent!.id);
      expect(ana).toMatchObject({
        name: "Ana",
        handled: 2,
        resolved: 1,
        firstResponseAvgSeconds: 90,
        csatAvg: 4,
      });
      expect(m.byQueue).toEqual([{ queueId: queue.id, name: "Vendas", open: 1, pending: 0 }]);
      expect(m.volumeByDay).toHaveLength(1);
      expect(m.volumeByDay[0]).toMatchObject({ inbound: 3, outbound: 0 });
    });

    it("sem dados devolve nulos", async () => {
      const admin = await createAuthedUser({ role: "MANAGER" });
      const m = (await get("/metrics/desk", admin.headers)).json();
      expect(m.firstResponseAvgSeconds).toBeNull();
      expect(m.resolutionAvgSeconds).toBeNull();
      expect(m.csat).toEqual({ avg: null, count: 0 });
      expect(m.volumeByDay).toEqual([]);
    });
  });

  describe("GET /events (SSE)", () => {
    it("entrega só eventos da operação do usuário", async () => {
      const u = await createAuthedUser({ role: "AGENT" });
      const address = await app.listen({ port: 0, host: "127.0.0.1" });
      const ctrl = new AbortController();
      const res = await fetch(`${address}/events`, { headers: u.headers, signal: ctrl.signal });
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/event-stream");

      emitDeskEvent({ type: "conversation.updated", operationId: "outra", conversationId: "xyz" });
      emitDeskEvent({
        type: "conversation.updated",
        operationId: u.operationId,
        conversationId: "abc",
      });

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let text = "";
      while (!text.includes("abc")) {
        const { value, done } = await reader.read();
        if (done) break;
        text += decoder.decode(value);
      }
      expect(text).toContain("event: conversation.updated");
      expect(text).toContain('"conversationId":"abc"');
      expect(text).not.toContain("xyz");
      ctrl.abort();
    });
  });
});
