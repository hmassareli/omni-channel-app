import { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// WAHA, webhook e sync mockados: nenhum teste toca a rede.
const { wahaMock, ensureWebhook, syncChats } = vi.hoisted(() => ({
  wahaMock: {
    getSession: vi.fn(),
    createSession: vi.fn(),
    startSession: vi.fn(),
    stopSession: vi.fn(),
    deleteSession: vi.fn(),
    getQRCode: vi.fn(),
    configureWebhooks: vi.fn(),
    getServerVersion: vi.fn(),
  },
  ensureWebhook: vi.fn(async (_session: string, url?: string | null) => url ?? null),
  syncChats: vi.fn(async () => ({ totalChats: 0, newConversations: 0 })),
}));
vi.mock("../../src/channels/whatsapp-waha/waha", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/channels/whatsapp-waha/waha")>()),
  ...wahaMock,
}));
vi.mock("../../src/channels/whatsapp-waha/webhook-config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/channels/whatsapp-waha/webhook-config")>()),
  ensureWhatsappSessionWebhook: ensureWebhook,
}));
vi.mock("../../src/channels/whatsapp-waha/sync", () => ({ syncWhatsAppChats: syncChats }));

import { WahaRequestError } from "../../src/channels/whatsapp-waha/waha";
import { onDeskEvent, type DeskEvent } from "../../src/events/bus";
import { prisma } from "../../src/prisma";
import { createAuthedUser } from "../helpers/auth";
import { createDeskConversation } from "../helpers/desk";
import { client } from "../helpers/http";
import { closeTestApp, getTestApp } from "../helpers/test-app";

const SECRET = "segredo-canais";
const WEBHOOK_URL = "https://app.test/webhooks/whatsapp";
const PHONE = "5511955554444";

let seq = 0;
async function createWhatsappChannel(
  operationId: string,
  overrides: { status?: "PENDING" | "CONNECTING" | "WORKING" | "FAILED" | "STOPPED"; agentId?: string } = {},
) {
  const n = ++seq;
  return prisma.channel.create({
    data: {
      name: `WhatsApp ${n}`,
      type: "WHATSAPP",
      status: overrides.status ?? "PENDING",
      operationId,
      agentId: overrides.agentId,
      whatsappDetails: { create: { sessionName: `sessao-${n}-${Date.now()}`, webhookUrl: WEBHOOK_URL } },
    },
    include: { whatsappDetails: true },
  });
}

const okWebhook = {
  url: WEBHOOK_URL,
  events: ["message.any", "message.ack", "session.status"],
  customHeaders: [{ name: "x-webhook-secret", value: SECRET }],
};

function session(status: string, extra: Record<string, unknown> = {}) {
  return { name: "s", status, config: { webhooks: [okWebhook] }, ...extra };
}

describe("rotas de canais", () => {
  let app: FastifyInstance;
  let http: ReturnType<typeof client>;
  let events: DeskEvent[];
  let unsubscribe: () => void;
  const originalSecret = process.env.WEBHOOK_SECRET;

  beforeAll(async () => {
    app = await getTestApp();
    http = client(app);
  });

  beforeEach(() => {
    for (const fn of Object.values(wahaMock)) fn.mockReset();
    ensureWebhook.mockClear();
    syncChats.mockClear();
    process.env.WEBHOOK_SECRET = SECRET;
    events = [];
    unsubscribe = onDeskEvent((e) => events.push(e));
  });

  afterEach(() => {
    unsubscribe();
    if (originalSecret === undefined) delete process.env.WEBHOOK_SECRET;
    else process.env.WEBHOOK_SECRET = originalSecret;
  });

  afterAll(async () => {
    await closeTestApp();
  });

  describe("GET /channels", () => {
    it("inclui lastInboundAt (só INBOUND), atendente e contagem de conversas; filtra a operação", async () => {
      const admin = await createAuthedUser({ role: "ADMIN" });
      const channel = await createWhatsappChannel(admin.operationId, { agentId: admin.agent!.id });
      const empty = await createWhatsappChannel(admin.operationId);

      const older = new Date("2026-06-01T10:00:00Z");
      const newer = new Date("2026-06-10T10:00:00Z");
      await createDeskConversation(admin.operationId, { channelId: channel.id, lastMessageAt: older });
      const { conversation } = await createDeskConversation(admin.operationId, {
        channelId: channel.id,
        lastMessageAt: newer,
      });
      // OUTBOUND mais recente não conta
      await prisma.message.create({
        data: {
          conversationId: conversation.id,
          direction: "OUTBOUND",
          content: "resposta",
          sentAt: new Date("2026-06-20T10:00:00Z"),
        },
      });

      const other = await createAuthedUser({ role: "ADMIN" });
      await createWhatsappChannel(other.operationId);

      const res = await http.get("/channels", admin.headers);
      expect(res.statusCode).toBe(200);
      const channels = res.json().channels as Array<Record<string, unknown>>;
      expect(channels).toHaveLength(2);
      const item = channels.find((c) => c.id === channel.id)!;
      expect(item.lastInboundAt).toBe(newer.toISOString());
      expect(item.agent).toEqual({ id: admin.agent!.id, name: admin.agent!.name });
      expect(item._count).toEqual({ conversations: 2 });
      expect(channels.find((c) => c.id === empty.id)!.lastInboundAt).toBeNull();
    });

    it("AGENT também lista", async () => {
      const agent = await createAuthedUser({ role: "AGENT" });
      await createWhatsappChannel(agent.operationId);
      const res = await http.get("/channels", agent.headers);
      expect(res.statusCode).toBe(200);
      expect(res.json().channels).toHaveLength(1);
    });
  });

  describe("GET /channels/:id/health", () => {
    it("WORKING: grava status e número, webhook ok, emite channel.updated e dispara sync", async () => {
      const user = await createAuthedUser({ role: "AGENT" });
      const channel = await createWhatsappChannel(user.operationId, { status: "CONNECTING" });
      const at = new Date("2026-07-01T12:00:00Z");
      await createDeskConversation(user.operationId, { channelId: channel.id, lastMessageAt: at });
      wahaMock.getSession.mockResolvedValue(
        session("WORKING", { me: { id: `${PHONE}@c.us`, pushName: "Loja" } }),
      );

      const res = await http.get(`/channels/${channel.id}/health`, user.headers);
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({
        channelId: channel.id,
        status: "WORKING",
        wahaStatus: "WORKING",
        me: { phoneNumber: PHONE, pushName: "Loja" },
        lastInboundAt: at.toISOString(),
        webhookOk: true,
      });
      expect(wahaMock.getSession).toHaveBeenCalledWith(channel.whatsappDetails!.sessionName);

      const saved = await prisma.channel.findUniqueOrThrow({ where: { id: channel.id } });
      expect(saved.status).toBe("WORKING");
      expect(saved.externalIdentifier).toBe(PHONE);
      expect(events).toContainEqual({
        type: "channel.updated",
        operationId: user.operationId,
        channelId: channel.id,
      });
      expect(syncChats).toHaveBeenCalledWith(channel.id, channel.whatsappDetails!.sessionName);
    });

    it("WORKING com webhook errado reconfigura e informa", async () => {
      const user = await createAuthedUser({ role: "ADMIN" });
      const channel = await createWhatsappChannel(user.operationId, { status: "WORKING" });
      wahaMock.getSession.mockResolvedValue({ name: "s", status: "WORKING", config: { webhooks: [] } });

      const res = await http.get(`/channels/${channel.id}/health`, user.headers);
      expect(res.json()).toMatchObject({ webhookOk: true, webhookRepaired: true });
      expect(ensureWebhook).toHaveBeenCalledWith(channel.whatsappDetails!.sessionName, WEBHOOK_URL);
      // status não mudou: sem evento nem sync
      expect(events).toHaveLength(0);
      expect(syncChats).not.toHaveBeenCalled();
    });

    it("SCAN_QR_CODE: CONNECTING, sem número", async () => {
      const user = await createAuthedUser({ role: "MANAGER" });
      const channel = await createWhatsappChannel(user.operationId, { status: "WORKING" });
      wahaMock.getSession.mockResolvedValue(session("SCAN_QR_CODE"));

      const res = await http.get(`/channels/${channel.id}/health`, user.headers);
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({
        status: "CONNECTING",
        wahaStatus: "SCAN_QR_CODE",
        me: null,
        lastInboundAt: null,
      });
      expect((await prisma.channel.findUniqueOrThrow({ where: { id: channel.id } })).status).toBe("CONNECTING");
      expect(syncChats).not.toHaveBeenCalled();
    });

    it.each([
      ["404 tipado", new WahaRequestError("WAHA Error: Session not found", 404)],
      ["mensagem", new Error("WAHA Error: Session not found")],
    ])("Session not found (%s): 200 desconectado, não 500", async (_label, error) => {
      const user = await createAuthedUser({ role: "AGENT" });
      const channel = await createWhatsappChannel(user.operationId, { status: "WORKING" });
      wahaMock.getSession.mockRejectedValue(error);

      const res = await http.get(`/channels/${channel.id}/health`, user.headers);
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({
        status: "STOPPED",
        wahaStatus: "NOT_FOUND",
        me: null,
        webhookOk: false,
      });
      expect((await prisma.channel.findUniqueOrThrow({ where: { id: channel.id } })).status).toBe("STOPPED");
      expect(events.map((e) => e.type)).toEqual(["channel.updated"]);
    });

    it("WAHA inacessível: 200 com erro, status mantido", async () => {
      const user = await createAuthedUser({ role: "AGENT" });
      const channel = await createWhatsappChannel(user.operationId, { status: "WORKING" });
      wahaMock.getSession.mockRejectedValue(new Error("connect ECONNREFUSED"));

      const res = await http.get(`/channels/${channel.id}/health`, user.headers);
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ status: "WORKING", wahaStatus: null });
      expect(res.json().error).toContain("ECONNREFUSED");
      expect(events).toHaveLength(0);
    });

    it("403 para canal de outra operação e 404 para inexistente", async () => {
      const user = await createAuthedUser({ role: "ADMIN" });
      const other = await createAuthedUser({ role: "ADMIN" });
      const channel = await createWhatsappChannel(other.operationId);
      expect((await http.get(`/channels/${channel.id}/health`, user.headers)).statusCode).toBe(403);
      expect(
        (await http.get("/channels/00000000-0000-4000-8000-000000000000/health", user.headers)).statusCode,
      ).toBe(404);
      expect(wahaMock.getSession).not.toHaveBeenCalled();
    });
  });

  describe("POST /channels/:id/reconnect", () => {
    it("sessão inexistente no WAHA: recria com o mesmo nome, configura webhook e inicia", async () => {
      const admin = await createAuthedUser({ role: "ADMIN" });
      const channel = await createWhatsappChannel(admin.operationId, { status: "WORKING" });
      const sessionName = channel.whatsappDetails!.sessionName;
      wahaMock.getSession.mockRejectedValue(new WahaRequestError("WAHA Error: Session not found", 404));
      wahaMock.createSession.mockResolvedValue(session("STOPPED"));
      wahaMock.startSession.mockResolvedValue(session("STARTING"));

      const res = await http.post(`/channels/${channel.id}/reconnect`, admin.headers);
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({
        channelId: channel.id,
        status: "CONNECTING",
        wahaStatus: "STARTING",
        recreated: true,
        webhookConfigured: true,
      });

      expect(wahaMock.createSession).toHaveBeenCalledWith(
        expect.objectContaining({
          name: sessionName,
          start: false,
          config: { webhooks: [expect.objectContaining({ url: WEBHOOK_URL, customHeaders: okWebhook.customHeaders })] },
        }),
      );
      expect(ensureWebhook).toHaveBeenCalledWith(sessionName, WEBHOOK_URL);
      expect(wahaMock.startSession).toHaveBeenCalledWith(sessionName);
      expect(wahaMock.stopSession).not.toHaveBeenCalled();
      // ordem: cria -> webhook -> inicia
      expect(wahaMock.createSession.mock.invocationCallOrder[0]).toBeLessThan(
        ensureWebhook.mock.invocationCallOrder[0],
      );
      expect(ensureWebhook.mock.invocationCallOrder[0]).toBeLessThan(
        wahaMock.startSession.mock.invocationCallOrder[0],
      );

      const saved = await prisma.channel.findUniqueOrThrow({ where: { id: channel.id } });
      expect(saved.status).toBe("CONNECTING");
      expect(events).toContainEqual({ type: "channel.updated", operationId: admin.operationId, channelId: channel.id });
    });

    it("sessão existente: para e inicia sem recriar", async () => {
      const manager = await createAuthedUser({ role: "MANAGER" });
      const channel = await createWhatsappChannel(manager.operationId, { status: "FAILED" });
      wahaMock.getSession.mockResolvedValue(session("FAILED"));
      wahaMock.stopSession.mockResolvedValue(undefined);
      wahaMock.startSession.mockResolvedValue(session("SCAN_QR_CODE"));

      const res = await http.post(`/channels/${channel.id}/reconnect`, manager.headers);
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ status: "CONNECTING", recreated: false });
      expect(wahaMock.createSession).not.toHaveBeenCalled();
      expect(wahaMock.stopSession).toHaveBeenCalledOnce();
      expect(wahaMock.startSession).toHaveBeenCalledOnce();
    });

    it("credencial salva falha (STARTING -> FAILED): espera assentar e sugere novo QR", async () => {
      const admin = await createAuthedUser({ role: "ADMIN" });
      const channel = await createWhatsappChannel(admin.operationId, { status: "STOPPED" });
      wahaMock.getSession
        .mockResolvedValueOnce(session("STOPPED")) // existe?
        .mockResolvedValue(session("FAILED")); // após o start
      wahaMock.stopSession.mockResolvedValue(undefined);
      wahaMock.startSession.mockResolvedValue(session("STARTING"));

      const res = await http.post(`/channels/${channel.id}/reconnect`, admin.headers);
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({
        status: "FAILED",
        wahaStatus: "FAILED",
        recreated: false,
        failure: { code: "SESSION_FAILED" },
      });
      expect(wahaMock.deleteSession).not.toHaveBeenCalled();

      // o diagnóstico continua aparecendo no health
      const health = await http.get(`/channels/${channel.id}/health`, admin.headers);
      expect(health.json()).toMatchObject({ status: "FAILED", failure: { code: "SESSION_FAILED" } });
      expect(health.json().error).toContain("novo QR");
    });

    it("fresh: apaga a sessão, recria do zero; se nem assim gera QR, culpa o WAHA (com versão)", async () => {
      const admin = await createAuthedUser({ role: "ADMIN" });
      const channel = await createWhatsappChannel(admin.operationId, { status: "FAILED" });
      const sessionName = channel.whatsappDetails!.sessionName;
      wahaMock.getSession.mockResolvedValue(session("FAILED"));
      wahaMock.deleteSession.mockResolvedValue(undefined);
      wahaMock.createSession.mockResolvedValue(session("STOPPED"));
      wahaMock.startSession.mockResolvedValue(session("FAILED"));
      wahaMock.getServerVersion.mockResolvedValue({ version: "2026.3.4", engine: "GOWS" });

      const res = await http.post(`/channels/${channel.id}/reconnect`, admin.headers, { fresh: true });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({
        status: "FAILED",
        recreated: true,
        failure: { code: "WAHA_CANNOT_CONNECT" },
      });
      expect(res.json().failure.error).toContain("2026.3.4");
      expect(wahaMock.deleteSession).toHaveBeenCalledWith(sessionName);
      expect(wahaMock.deleteSession.mock.invocationCallOrder[0]).toBeLessThan(
        wahaMock.createSession.mock.invocationCallOrder[0],
      );
      expect(wahaMock.stopSession).not.toHaveBeenCalled();
    });

    it("fresh que chega ao QR limpa o diagnóstico anterior", async () => {
      const admin = await createAuthedUser({ role: "ADMIN" });
      const channel = await createWhatsappChannel(admin.operationId, { status: "FAILED" });
      wahaMock.getSession.mockResolvedValue(session("FAILED"));
      wahaMock.startSession.mockResolvedValue(session("FAILED"));
      await http.post(`/channels/${channel.id}/reconnect`, admin.headers);

      wahaMock.startSession.mockResolvedValue(session("SCAN_QR_CODE"));
      const res = await http.post(`/channels/${channel.id}/reconnect`, admin.headers, { fresh: true });
      expect(res.json()).toMatchObject({ status: "CONNECTING", wahaStatus: "SCAN_QR_CODE" });
      expect(res.json().failure).toBeUndefined();

      wahaMock.getSession.mockResolvedValue(session("SCAN_QR_CODE"));
      const health = await http.get(`/channels/${channel.id}/health`, admin.headers);
      expect(health.json().failure).toBeUndefined();
    });

    it("falha no WAHA: 502 e canal FAILED", async () => {
      const admin = await createAuthedUser({ role: "ADMIN" });
      const channel = await createWhatsappChannel(admin.operationId, { status: "WORKING" });
      wahaMock.getSession.mockRejectedValue(new Error("connect ECONNREFUSED"));

      const res = await http.post(`/channels/${channel.id}/reconnect`, admin.headers);
      expect(res.statusCode).toBe(502);
      expect((await prisma.channel.findUniqueOrThrow({ where: { id: channel.id } })).status).toBe("FAILED");
    });
  });

  describe("permissões", () => {
    it("AGENT não conecta, reconecta, pega QR nem remove", async () => {
      const agent = await createAuthedUser({ role: "AGENT" });
      const channel = await createWhatsappChannel(agent.operationId);

      const responses = await Promise.all([
        http.post(`/channels/${channel.id}/reconnect`, agent.headers),
        http.get(`/channels/${channel.id}/qr`, agent.headers),
        http.del(`/channels/${channel.id}`, agent.headers),
        http.post("/channels/whatsapp", agent.headers, { name: "Novo", operationId: agent.operationId }),
      ]);
      for (const res of responses) expect(res.statusCode).toBe(403);
      expect(await prisma.channel.count({ where: { id: channel.id } })).toBe(1);
      for (const fn of Object.values(wahaMock)) expect(fn).not.toHaveBeenCalled();
    });

    it("ADMIN remove o canal (sessão WAHA apagada) e emite channel.updated", async () => {
      const admin = await createAuthedUser({ role: "ADMIN" });
      const channel = await createWhatsappChannel(admin.operationId);
      wahaMock.deleteSession.mockRejectedValue(new WahaRequestError("WAHA Error: Session not found", 404));

      const res = await http.del(`/channels/${channel.id}`, admin.headers);
      expect(res.statusCode).toBe(204);
      expect(wahaMock.deleteSession).toHaveBeenCalledWith(channel.whatsappDetails!.sessionName);
      expect(await prisma.channel.count({ where: { id: channel.id } })).toBe(0);
      expect(events).toContainEqual({ type: "channel.updated", operationId: admin.operationId, channelId: channel.id });
    });

    it("QR de sessão inexistente responde 409 SESSION_NOT_FOUND", async () => {
      const admin = await createAuthedUser({ role: "ADMIN" });
      const channel = await createWhatsappChannel(admin.operationId);
      wahaMock.getQRCode.mockRejectedValue(new WahaRequestError("WAHA Error: Session not found", 404));

      const res = await http.get(`/channels/${channel.id}/qr`, admin.headers);
      expect(res.statusCode).toBe(409);
      expect(res.json().code).toBe("SESSION_NOT_FOUND");
    });
  });

  describe("evento channel.updated no webhook session.status", () => {
    const statusBody = (sessionName: string, status: string) => ({
      event: "session.status",
      session: sessionName,
      payload: { status },
    });

    it("emite quando o status muda e não emite quando repete", async () => {
      const admin = await createAuthedUser({ role: "ADMIN" });
      const channel = await createWhatsappChannel(admin.operationId, { status: "WORKING" });
      const sessionName = channel.whatsappDetails!.sessionName;
      const auth = { "x-webhook-secret": SECRET };

      const res = await http.post("/webhooks/whatsapp", auth, statusBody(sessionName, "FAILED"));
      expect(res.statusCode).toBe(202);
      expect(events).toEqual([{ type: "channel.updated", operationId: admin.operationId, channelId: channel.id }]);

      await http.post("/webhooks/whatsapp", auth, statusBody(sessionName, "FAILED"));
      expect(events).toHaveLength(1);
    });
  });
  describe("DELETE /channels/:id", () => {
    it("com conversas, arquiva em vez de apagar: some da lista e mantém o histórico", async () => {
      const admin = await createAuthedUser({ role: "ADMIN" });
      const channel = await createWhatsappChannel(admin.operationId);
      await createDeskConversation(admin.operationId, { channelId: channel.id });

      const res = await http.del(`/channels/${channel.id}`, admin.headers);
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ archived: true, conversations: 1 });
      expect(wahaMock.deleteSession).toHaveBeenCalledWith(channel.whatsappDetails!.sessionName);

      const archived = await prisma.channel.findUniqueOrThrow({
        where: { id: channel.id },
        include: { whatsappDetails: true },
      });
      expect(archived.archivedAt).not.toBeNull();
      expect(archived.whatsappDetails).toBeNull();
      expect(await prisma.conversation.count({ where: { channelId: channel.id } })).toBe(1);

      const list = await http.get("/channels", admin.headers);
      expect(list.json().channels.map((c: { id: string }) => c.id)).not.toContain(channel.id);
      expect((await http.get(`/channels/${channel.id}/health`, admin.headers)).statusCode).toBe(404);
    });

    it("lista mostra de quais canais antigos o histórico foi herdado", async () => {
      const admin = await createAuthedUser({ role: "ADMIN" });
      const current = await createWhatsappChannel(admin.operationId);
      await prisma.channel.create({
        data: {
          name: "Antigo",
          type: "WHATSAPP",
          operationId: admin.operationId,
          archivedAt: new Date(),
          replacedById: current.id,
          replacedAt: new Date("2026-10-17T12:00:00Z"),
        },
      });
      const item = (await http.get("/channels", admin.headers))
        .json()
        .channels.find((c: { id: string }) => c.id === current.id);
      expect(item.predecessors).toEqual([
        expect.objectContaining({ name: "Antigo", replacedAt: "2026-10-17T12:00:00.000Z" }),
      ]);
    });

    it("remove canal sem conversas", async () => {
      const admin = await createAuthedUser({ role: "ADMIN" });
      const channel = await createWhatsappChannel(admin.operationId);
      expect((await http.del(`/channels/${channel.id}`, admin.headers)).statusCode).toBe(204);
      expect(await prisma.channel.findUnique({ where: { id: channel.id } })).toBeNull();
    });
  });
});
