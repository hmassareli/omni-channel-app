import { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Nunca toca em rede: o status WORKING reconfigura o webhook e sincroniza chats no WAHA.
const { ensureWebhook, syncChats } = vi.hoisted(() => ({
  ensureWebhook: vi.fn(async () => undefined),
  syncChats: vi.fn(async () => ({ totalChats: 0, newConversations: 0 })),
}));
vi.mock("../../src/channels/whatsapp-waha/webhook-config", () => ({
  ensureWhatsappSessionWebhook: ensureWebhook,
}));
vi.mock("../../src/channels/whatsapp-waha/sync", () => ({
  syncWhatsAppChats: syncChats,
}));
vi.mock("../../src/channels/whatsapp-waha/waha", () => new Proxy({}, {
  get: (_t, name) => {
    if (name === "then") return undefined;
    return () => {
      throw new Error(`Chamada de rede bloqueada nos testes: waha.${String(name)}`);
    };
  },
}));

import { prisma } from "../../src/prisma";
import { client } from "../helpers/http";
import { closeTestApp, getTestApp } from "../helpers/test-app";

const SECRET = "segredo-de-teste";
const BUSINESS = "5511900000000";

function messageBody(overrides: Record<string, unknown> = {}, id = "false_5511988887777@c.us_MSG1") {
  return {
    event: "message",
    session: "sessao-1",
    me: { id: `${BUSINESS}@c.us`, pushName: "Empresa" },
    payload: {
      id,
      timestamp: 1_760_000_000,
      from: "5511988887777@c.us",
      fromMe: false,
      to: `${BUSINESS}@c.us`,
      body: "Olá, preciso de ajuda",
      hasMedia: false,
      ...overrides,
    },
  };
}

describe("POST /webhooks/whatsapp", () => {
  let app: FastifyInstance;
  let http: ReturnType<typeof client>;
  const originalSecret = process.env.WEBHOOK_SECRET;
  const originalEnv = process.env.NODE_ENV;

  beforeAll(async () => {
    app = await getTestApp();
    http = client(app);
  });

  beforeEach(() => {
    ensureWebhook.mockClear();
    syncChats.mockClear();
    process.env.WEBHOOK_SECRET = SECRET;
  });

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.WEBHOOK_SECRET;
    else process.env.WEBHOOK_SECRET = originalSecret;
    process.env.NODE_ENV = originalEnv;
  });

  afterAll(async () => {
    await closeTestApp();
  });

  const auth = { "x-webhook-secret": SECRET };

  async function createChannel(operationId?: string) {
    const op = operationId ?? (await prisma.operation.create({ data: { name: "Op webhook" } })).id;
    return prisma.channel.create({
      data: {
        name: "WhatsApp",
        type: "WHATSAPP",
        externalIdentifier: BUSINESS,
        operationId: op,
        whatsappDetails: { create: { sessionName: "sessao-1" } },
      },
    });
  }

  describe("autenticação do webhook", () => {
    it("401 sem x-webhook-secret", async () => {
      const res = await http.post("/webhooks/whatsapp", {}, messageBody());
      expect(res.statusCode).toBe(401);
      expect(await prisma.rawWhatsappMessage.count()).toBe(0);
    });

    it("401 com segredo errado", async () => {
      const res = await http.post("/webhooks/whatsapp", { "x-webhook-secret": "errado" }, messageBody());
      expect(res.statusCode).toBe(401);
      expect(await prisma.message.count()).toBe(0);
    });

    it("401 com segredo de tamanho diferente", async () => {
      const res = await http.post("/webhooks/whatsapp", { "x-webhook-secret": SECRET + "x" }, messageBody());
      expect(res.statusCode).toBe(401);
    });

    it("aceita com o segredo correto", async () => {
      await createChannel();
      const res = await http.post("/webhooks/whatsapp", auth, messageBody());
      expect(res.statusCode).toBe(202);
    });

    it("503 em production sem WEBHOOK_SECRET configurado", async () => {
      delete process.env.WEBHOOK_SECRET;
      process.env.NODE_ENV = "production";
      const res = await http.post("/webhooks/whatsapp", {}, messageBody());
      expect(res.statusCode).toBe(503);
      expect(await prisma.message.count()).toBe(0);
    });

    it("sem WEBHOOK_SECRET fora de production aceita (dev local)", async () => {
      delete process.env.WEBHOOK_SECRET;
      await createChannel();
      const res = await http.post("/webhooks/whatsapp", {}, messageBody());
      expect(res.statusCode).toBe(202);
    });
  });

  describe("mensagens", () => {
    it("cria contato, conversa e mensagem; grava o payload cru", async () => {
      const channel = await createChannel();
      const res = await http.post("/webhooks/whatsapp", auth, messageBody());
      expect(res.statusCode).toBe(202);
      const { conversationId, messageId } = res.json();
      expect(conversationId).toBeTruthy();

      const message = await prisma.message.findUniqueOrThrow({ where: { id: messageId } });
      expect(message).toMatchObject({
        conversationId,
        direction: "INBOUND",
        content: "Olá, preciso de ajuda",
        externalId: "false_5511988887777@c.us_MSG1",
      });
      expect(message.sentAt.toISOString()).toBe(new Date(1_760_000_000 * 1000).toISOString());

      const conversation = await prisma.conversation.findUniqueOrThrow({
        where: { id: conversationId },
        include: { contact: { include: { identities: true } } },
      });
      expect(conversation.channelId).toBe(channel.id);
      expect(conversation.status).toBe("OPEN");
      expect(conversation.unreadCount).toBe(1);
      expect(conversation.contact.identities[0]).toMatchObject({ type: "WHATSAPP", value: "5511988887777" });

      const raw = await prisma.rawWhatsappMessage.findMany();
      expect(raw).toHaveLength(1);
      expect(raw[0].processed).toBe(true);
    });

    it("é idempotente: reenvio do mesmo id não duplica mensagem nem conta não lida", async () => {
      await createChannel();
      const first = await http.post("/webhooks/whatsapp", auth, messageBody());
      const second = await http.post("/webhooks/whatsapp", auth, messageBody());

      expect(first.statusCode).toBe(202);
      expect(second.statusCode).toBe(202);
      expect(second.json()).toEqual({ skipped: true, reason: "duplicate-message" });
      expect(await prisma.message.count()).toBe(1);
      expect(await prisma.conversation.count()).toBe(1);
      expect((await prisma.conversation.findFirstOrThrow()).unreadCount).toBe(1);
    });

    it("segunda mensagem reaproveita a conversa e soma não lidas", async () => {
      await createChannel();
      await http.post("/webhooks/whatsapp", auth, messageBody({}, "MSG-A"));
      await http.post("/webhooks/whatsapp", auth, messageBody({ body: "Segunda" }, "MSG-B"));
      expect(await prisma.conversation.count()).toBe(1);
      expect(await prisma.message.count()).toBe(2);
      expect((await prisma.conversation.findFirstOrThrow()).unreadCount).toBe(2);
    });

    it("mensagem enviada pelo próprio número (fromMe) é OUTBOUND e não conta como não lida", async () => {
      await createChannel();
      const res = await http.post(
        "/webhooks/whatsapp",
        auth,
        messageBody({ fromMe: true, from: `${BUSINESS}@c.us`, to: "5511988887777@c.us", body: "Resposta" }, "OUT-1"),
      );
      expect(res.statusCode).toBe(202);
      const message = await prisma.message.findFirstOrThrow();
      expect(message.direction).toBe("OUTBOUND");
      expect((await prisma.conversation.findFirstOrThrow()).unreadCount).toBe(0);
    });

    it("resolve o canal pela sessão quando ainda não tem externalIdentifier", async () => {
      const op = await prisma.operation.create({ data: { name: "Op" } });
      const channel = await prisma.channel.create({
        data: {
          name: "Sem número",
          type: "WHATSAPP",
          operationId: op.id,
          whatsappDetails: { create: { sessionName: "sessao-1" } },
        },
      });
      const res = await http.post("/webhooks/whatsapp", auth, messageBody());
      expect(res.statusCode).toBe(202);
      expect((await prisma.conversation.findFirstOrThrow()).channelId).toBe(channel.id);
      expect((await prisma.channel.findUniqueOrThrow({ where: { id: channel.id } })).externalIdentifier).toBe(BUSINESS);
    });

    it("a sessão vence o número: canal antigo com o mesmo número perde o vínculo", async () => {
      // Canal antigo (sem sessão) ainda guarda o número; a sessão foi recriada em outro canal.
      const old = await prisma.channel.create({
        data: { name: "Antigo", type: "WHATSAPP", externalIdentifier: BUSINESS },
      });
      const op = await prisma.operation.create({ data: { name: "Op" } });
      const current = await prisma.channel.create({
        data: {
          name: "Atual",
          type: "WHATSAPP",
          operationId: op.id,
          whatsappDetails: { create: { sessionName: "sessao-1" } },
        },
      });

      const res = await http.post("/webhooks/whatsapp", auth, messageBody());
      expect(res.statusCode).toBe(202);
      expect((await prisma.conversation.findFirstOrThrow()).channelId).toBe(current.id);
      expect((await prisma.channel.findUniqueOrThrow({ where: { id: current.id } })).externalIdentifier).toBe(BUSINESS);
      expect((await prisma.channel.findUniqueOrThrow({ where: { id: old.id } })).externalIdentifier).toBeNull();
    });

    it("ignora mensagens vazias e de grupo (202 skipped)", async () => {
      await createChannel();
      const empty = await http.post("/webhooks/whatsapp", auth, messageBody({ body: "  " }, "E1"));
      expect(empty.json()).toEqual({ skipped: true, reason: "empty-message" });
      const group = await http.post(
        "/webhooks/whatsapp",
        auth,
        messageBody({ participant: "5511977776666@c.us", from: "123@g.us" }, "G1"),
      );
      expect(group.json()).toEqual({ skipped: true, reason: "group-message" });
      expect(await prisma.message.count()).toBe(0);
    });

    it("202 skipped quando o payload não informa o número do canal (me)", async () => {
      const body = messageBody();
      delete (body as { me?: unknown }).me;
      const res = await http.post("/webhooks/whatsapp", auth, body);
      expect(res.statusCode).toBe(202);
      expect(res.json().skipped).toBe(true);
      expect(await prisma.message.count()).toBe(0);
    });

    it("400 para payload fora do formato do WAHA", async () => {
      const res = await http.post("/webhooks/whatsapp", auth, { event: "message", payload: { fromMe: "talvez" } });
      expect(res.statusCode).toBe(400);
    });
  });

  describe("session.status", () => {
    const statusBody = (status: string) => ({
      event: "session.status",
      session: "sessao-1",
      me: { id: `${BUSINESS}@c.us`, pushName: "Empresa" },
      payload: { status },
    });

    it("atualiza o status e o número do canal", async () => {
      const channel = await prisma.channel.create({
        data: {
          name: "WA",
          type: "WHATSAPP",
          whatsappDetails: { create: { sessionName: "sessao-1" } },
        },
      });
      const res = await http.post("/webhooks/whatsapp", auth, statusBody("SCAN_QR_CODE"));
      expect(res.statusCode).toBe(202);
      expect(res.json()).toEqual({ processed: true, event: "session.status" });

      const updated = await prisma.channel.findUniqueOrThrow({ where: { id: channel.id } });
      expect(updated.status).toBe("CONNECTING");
      expect(updated.externalIdentifier).toBe(BUSINESS);
      expect(syncChats).not.toHaveBeenCalled();
    });

    it("ao conectar, assume o número que estava em outro canal", async () => {
      const old = await prisma.channel.create({
        data: { name: "Antigo", type: "WHATSAPP", externalIdentifier: BUSINESS },
      });
      const channel = await prisma.channel.create({
        data: { name: "WA", type: "WHATSAPP", whatsappDetails: { create: { sessionName: "sessao-1" } } },
      });
      const res = await http.post("/webhooks/whatsapp", auth, statusBody("WORKING"));
      expect(res.statusCode).toBe(202);
      expect((await prisma.channel.findUniqueOrThrow({ where: { id: channel.id } })).externalIdentifier).toBe(BUSINESS);
      expect((await prisma.channel.findUniqueOrThrow({ where: { id: old.id } })).externalIdentifier).toBeNull();
    });

    it("mapeia STOPPED e FAILED", async () => {
      const channel = await prisma.channel.create({
        data: { name: "WA", type: "WHATSAPP", whatsappDetails: { create: { sessionName: "sessao-1" } } },
      });
      await http.post("/webhooks/whatsapp", auth, statusBody("STOPPED"));
      expect((await prisma.channel.findUniqueOrThrow({ where: { id: channel.id } })).status).toBe("STOPPED");
      await http.post("/webhooks/whatsapp", auth, statusBody("FAILED"));
      expect((await prisma.channel.findUniqueOrThrow({ where: { id: channel.id } })).status).toBe("FAILED");
    });

    it("WORKING marca o canal e dispara reconfiguração do webhook e sync (mockados)", async () => {
      const channel = await prisma.channel.create({
        data: { name: "WA", type: "WHATSAPP", whatsappDetails: { create: { sessionName: "sessao-1" } } },
      });
      const res = await http.post("/webhooks/whatsapp", auth, statusBody("WORKING"));
      expect(res.statusCode).toBe(202);
      expect((await prisma.channel.findUniqueOrThrow({ where: { id: channel.id } })).status).toBe("WORKING");
      expect(ensureWebhook).toHaveBeenCalledWith("sessao-1", null);
      expect(syncChats).toHaveBeenCalledWith(channel.id, "sessao-1");
    });

    it("sessão desconhecida não falha (202) nem cria canal", async () => {
      const res = await http.post("/webhooks/whatsapp", auth, statusBody("WORKING"));
      expect(res.statusCode).toBe(202);
      expect(await prisma.channel.count()).toBe(0);
    });

    it("400 para status inválido", async () => {
      const res = await http.post("/webhooks/whatsapp", auth, statusBody("QUALQUER"));
      expect(res.statusCode).toBe(400);
    });

    it("exige o segredo também para eventos de status", async () => {
      const res = await http.post("/webhooks/whatsapp", {}, statusBody("WORKING"));
      expect(res.statusCode).toBe(401);
    });
  });
});
