import { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { GetMessagesResponse } from "../../src/api-types";
import { onDeskEvent, type DeskEvent } from "../../src/events/bus";
import { prisma } from "../../src/prisma";
import { readMetadata } from "../../src/services/conversations/media";
import { createAuthedUser } from "../helpers/auth";
import { createDeskConversation } from "../helpers/desk";
import { client } from "../helpers/http";
import { closeTestApp, getTestApp } from "../helpers/test-app";

const SECRET = "segredo-ack";
const BUSINESS = "5511900000001";
const EXTERNAL_ID = "true_5511988887777@c.us_3EB0ACK";

function ackBody(ack: number, ackName: string, id = EXTERNAL_ID, session = "sessao-ack") {
  return {
    event: "message.ack",
    session,
    me: { id: `${BUSINESS}@c.us` },
    payload: { id, from: "5511988887777@c.us", fromMe: true, ack, ackName },
  };
}

describe("message.ack (status de entrega)", () => {
  let app: FastifyInstance;
  let http: ReturnType<typeof client>;
  const originalSecret = process.env.WEBHOOK_SECRET;
  const auth = { "x-webhook-secret": SECRET };

  beforeAll(async () => {
    app = await getTestApp();
    http = client(app);
  });

  beforeEach(() => {
    process.env.WEBHOOK_SECRET = SECRET;
  });

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.WEBHOOK_SECRET;
    else process.env.WEBHOOK_SECRET = originalSecret;
  });

  afterAll(async () => {
    await closeTestApp();
  });

  async function setup(externalId = EXTERNAL_ID) {
    const admin = await createAuthedUser({ role: "ADMIN" });
    const { conversation, channel } = await createDeskConversation(admin.operationId);
    await prisma.whatsAppChannel.create({ data: { channelId: channel.id, sessionName: "sessao-ack" } });
    const message = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction: "OUTBOUND",
        content: "Seu pedido saiu",
        externalId,
        sentAt: new Date(),
        metadata: { csatRequest: false },
      },
    });
    return { admin, conversation, channel, message };
  }

  const ackOf = async (id: string) =>
    readMetadata((await prisma.message.findUniqueOrThrow({ where: { id } })).metadata).ack;

  it("atualiza metadata.ack, preserva o resto da metadata e emite conversation.updated", async () => {
    const { admin, conversation, message } = await setup();
    const events: DeskEvent[] = [];
    const off = onDeskEvent((e) => events.push(e));

    const res = await http.post("/webhooks/whatsapp", auth, ackBody(2, "DEVICE"));
    off();
    expect(res.statusCode).toBe(202);
    expect(res.json()).toMatchObject({ processed: true, event: "message.ack", updated: 1 });

    const stored = await prisma.message.findUniqueOrThrow({ where: { id: message.id } });
    expect(stored.metadata).toEqual({ csatRequest: false, ack: "delivered" });
    expect(events).toContainEqual({
      type: "conversation.updated",
      operationId: admin.operationId,
      conversationId: conversation.id,
    });

    const list = await http.get(`/conversations/${conversation.id}/messages`, admin.headers);
    const item = (list.json() as GetMessagesResponse).messages.find((m) => m.id === message.id)!;
    expect(item.ack).toBe("delivered");
  });

  it("não regride: READ seguido de DEVICE atrasado continua 'read'", async () => {
    const { message } = await setup();
    await http.post("/webhooks/whatsapp", auth, ackBody(3, "READ"));
    expect(await ackOf(message.id)).toBe("read");

    const late = await http.post("/webhooks/whatsapp", auth, ackBody(2, "DEVICE"));
    expect(late.json()).toMatchObject({ updated: 0 });
    expect(await ackOf(message.id)).toBe("read");
  });

  it("casa pelo ID curto quando o envio gravou só o final do ID", async () => {
    const { message } = await setup("3EB0ACK");
    await http.post("/webhooks/whatsapp", auth, ackBody(3, "READ"));
    expect(await ackOf(message.id)).toBe("read");
  });

  it("ack de sessão desconhecida ou mensagem inexistente: 202 sem efeito", async () => {
    const { message } = await setup();
    const unknownSession = await http.post(
      "/webhooks/whatsapp",
      auth,
      { ...ackBody(3, "READ", EXTERNAL_ID, "outra"), me: { id: "5500000000000@c.us" } },
    );
    expect(unknownSession.statusCode).toBe(202);
    expect(unknownSession.json()).toMatchObject({ updated: 0 });

    const unknownMessage = await http.post("/webhooks/whatsapp", auth, ackBody(3, "READ", "true_x@c.us_NOPE"));
    expect(unknownMessage.json()).toMatchObject({ updated: 0 });
    expect(await ackOf(message.id)).toBeUndefined();
  });

  it("ack ERROR é ignorado; payload inválido = 400", async () => {
    await setup();
    const error = await http.post("/webhooks/whatsapp", auth, ackBody(-1, "ERROR"));
    expect(error.statusCode).toBe(202);
    expect(error.json()).toMatchObject({ skipped: true, reason: "unknown-ack" });

    const invalid = await http.post("/webhooks/whatsapp", auth, { event: "message.ack", payload: {} });
    expect(invalid.statusCode).toBe(400);
  });

  it("não sobrescreve ack de mensagem de outro canal com o mesmo ID", async () => {
    const { message } = await setup();
    const otherAdmin = await createAuthedUser({ role: "ADMIN" });
    const other = await createDeskConversation(otherAdmin.operationId);
    const foreign = await prisma.message.create({
      data: {
        conversationId: other.conversation.id,
        direction: "OUTBOUND",
        content: "x",
        externalId: EXTERNAL_ID,
        sentAt: new Date(),
      },
    });
    await http.post("/webhooks/whatsapp", auth, ackBody(3, "READ"));
    expect(await ackOf(message.id)).toBe("read");
    expect(await ackOf(foreign.id)).toBeUndefined();
  });
});
