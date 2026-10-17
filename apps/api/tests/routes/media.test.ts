import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { FastifyInstance } from "fastify";
import os from "os";
import path from "path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { GetMessagesResponse } from "../../src/api-types";
import { prisma } from "../../src/prisma";
import { signMediaUrl, type StoredMedia } from "../../src/services/conversations/media";
import { createAuthedUser } from "../helpers/auth";
import { createDeskConversation } from "../helpers/desk";
import { client } from "../helpers/http";
import { closeTestApp, getTestApp } from "../helpers/test-app";

const BYTES = Buffer.from("0123456789abcdefghij"); // 20 bytes

describe("mídia nas mensagens + GET /media/:messageId", () => {
  let app: FastifyInstance;
  let http: ReturnType<typeof client>;
  let mediaDir: string;
  const originalMediaDir = process.env.MEDIA_DIR;

  beforeAll(async () => {
    app = await getTestApp();
    http = client(app);
  });

  beforeEach(() => {
    mediaDir = mkdtempSync(path.join(os.tmpdir(), "omni-media-route-"));
    process.env.MEDIA_DIR = mediaDir;
  });

  afterEach(() => {
    rmSync(mediaDir, { recursive: true, force: true });
    if (originalMediaDir === undefined) delete process.env.MEDIA_DIR;
    else process.env.MEDIA_DIR = originalMediaDir;
  });

  afterAll(async () => {
    await closeTestApp();
  });

  async function setup() {
    const admin = await createAuthedUser({ role: "ADMIN" });
    const desk = await createDeskConversation(admin.operationId, { inbound: null });
    return { admin, ...desk };
  }

  async function storedMessage(
    conversationId: string,
    operationId: string,
    media: Partial<StoredMedia> & { ext?: string } = {},
    extra: { content?: string | null; externalId?: string; payload?: object } = {},
  ) {
    const { ext = "jpg", ...rest } = media;
    const message = await prisma.message.create({
      data: {
        conversationId,
        direction: "INBOUND",
        content: extra.content ?? null,
        hasMedia: true,
        externalId: extra.externalId,
        payload: extra.payload,
        sentAt: new Date(),
      },
    });
    const file = `${operationId}/${message.id}.${ext}`;
    mkdirSync(path.join(mediaDir, operationId), { recursive: true });
    writeFileSync(path.join(mediaDir, file), BYTES);
    const metadata: StoredMedia = {
      kind: "image",
      mimetype: "image/jpeg",
      filename: null,
      size: BYTES.length,
      stored: true,
      file,
      ...rest,
    };
    await prisma.message.update({ where: { id: message.id }, data: { metadata: { media: metadata } as object } });
    return message;
  }

  async function listMessages(conversationId: string, headers: Record<string, string>) {
    const res = await http.get(`/conversations/${conversationId}/messages`, headers);
    expect(res.statusCode).toBe(200);
    return res.json() as GetMessagesResponse;
  }

  it("listagem devolve mídia com URL assinada; a URL entrega o arquivo", async () => {
    const { admin, conversation, channel } = await setup();
    const message = await storedMessage(conversation.id, admin.operationId, {}, { content: "legenda" });

    const { messages } = await listMessages(conversation.id, admin.headers);
    const item = messages.find((m) => m.id === message.id)!;
    expect(item).not.toHaveProperty("payload");
    expect(item.media).toMatchObject({
      kind: "image",
      mimetype: "image/jpeg",
      caption: "legenda",
      available: true,
      pending: false,
    });
    expect(item.media!.url).toMatch(new RegExp(`^/media/${message.id}\\?exp=\\d+&sig=`));
    expect(item.ack).toBeNull();
    expect(channel.operationId).toBe(admin.operationId);

    const file = await http.get(item.media!.url!);
    expect(file.statusCode).toBe(200);
    expect(file.headers["content-type"]).toBe("image/jpeg");
    expect(file.headers["cache-control"]).toMatch(/^private/);
    expect(file.headers["accept-ranges"]).toBe("bytes");
    expect(file.headers["content-disposition"]).toBe("inline");
    expect(file.rawPayload).toEqual(BYTES);
  });

  it("Range: 206 com Content-Range; sufixo; fora do arquivo = 416", async () => {
    const { admin, conversation } = await setup();
    const message = await storedMessage(conversation.id, admin.operationId, {
      kind: "voice",
      mimetype: "audio/ogg; codecs=opus",
      ext: "ogg",
    });
    const url = await signMediaUrl(message.id);

    const partial = await app.inject({ method: "GET", url, headers: { range: "bytes=2-5" } });
    expect(partial.statusCode).toBe(206);
    expect(partial.headers["content-range"]).toBe(`bytes 2-5/${BYTES.length}`);
    expect(partial.headers["content-type"]).toBe("audio/ogg");
    expect(partial.rawPayload.toString()).toBe("2345");

    const suffix = await app.inject({ method: "GET", url, headers: { range: "bytes=-3" } });
    expect(suffix.statusCode).toBe(206);
    expect(suffix.rawPayload.toString()).toBe("hij");

    const open = await app.inject({ method: "GET", url, headers: { range: "bytes=18-" } });
    expect(open.rawPayload.toString()).toBe("ij");

    const invalid = await app.inject({ method: "GET", url, headers: { range: "bytes=50-60" } });
    expect(invalid.statusCode).toBe(416);
    expect(invalid.headers["content-range"]).toBe(`bytes */${BYTES.length}`);
  });

  it("assinatura expirada, adulterada, ausente ou de outra mensagem: 403/400", async () => {
    const { admin, conversation } = await setup();
    const message = await storedMessage(conversation.id, admin.operationId);
    const other = await storedMessage(conversation.id, admin.operationId);

    const expired = await signMediaUrl(message.id, Date.now() - 3 * 60 * 60 * 1000);
    expect((await http.get(expired)).statusCode).toBe(403);

    const valid = await signMediaUrl(message.id);
    const tampered = valid.replace(/sig=(.)/, (_m, c: string) => `sig=${c === "A" ? "B" : "A"}`);
    expect((await http.get(tampered)).statusCode).toBe(403);

    const longer = valid.replace(/exp=(\d+)/, (_m, exp: string) => `exp=${Number(exp) + 60}`);
    expect((await http.get(longer)).statusCode).toBe(403);

    const otherMessage = valid.replace(message.id, other.id);
    expect((await http.get(otherMessage)).statusCode).toBe(403);

    expect((await http.get(`/media/${message.id}`)).statusCode).toBe(400);
    expect((await http.get(`/media/../etc/passwd?exp=1&sig=x`)).statusCode).toBeGreaterThanOrEqual(400);
  });

  it("usuário de outra operação não lista as mensagens (não recebe URL)", async () => {
    const { admin, conversation } = await setup();
    await storedMessage(conversation.id, admin.operationId);
    const outsider = await createAuthedUser({ role: "ADMIN" });

    const res = await http.get(`/conversations/${conversation.id}/messages`, outsider.headers);
    expect(res.statusCode).toBe(404);
  });

  it("AGENT sem acesso à conversa (atribuída a outro) não recebe URL", async () => {
    const { admin, conversation } = await setup();
    const other = await createAuthedUser({ role: "AGENT", operationId: admin.operationId });
    const agent = await createAuthedUser({ role: "AGENT", operationId: admin.operationId });
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { assignedAgentId: other.agent!.id },
    });
    await storedMessage(conversation.id, admin.operationId);

    const res = await http.get(`/conversations/${conversation.id}/messages`, agent.headers);
    expect(res.statusCode).toBe(404);
  });

  it("caminho gravado fora de MEDIA_DIR não é servido", async () => {
    const { admin, conversation } = await setup();
    const message = await storedMessage(conversation.id, admin.operationId, {
      file: "../../../../etc/passwd",
    });
    const url = await signMediaUrl(message.id);
    expect((await http.get(url)).statusCode).toBe(404);
  });

  it("documento: Content-Disposition attachment com o nome original", async () => {
    const { admin, conversation } = await setup();
    const message = await storedMessage(conversation.id, admin.operationId, {
      kind: "document",
      mimetype: "application/pdf",
      filename: "Relatório final.pdf",
      ext: "pdf",
    });
    const res = await http.get(await signMediaUrl(message.id));
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("application/pdf");
    expect(res.headers["content-disposition"]).toBe(
      `attachment; filename="Relat_rio final.pdf"; filename*=UTF-8''${encodeURIComponent("Relatório final.pdf")}`,
    );
  });

  it("tipo perigoso (svg/html) vai como octet-stream + attachment", async () => {
    const { admin, conversation } = await setup();
    const message = await storedMessage(conversation.id, admin.operationId, {
      kind: "image",
      mimetype: "image/svg+xml",
      ext: "svg",
    });
    const res = await http.get(await signMediaUrl(message.id));
    expect(res.headers["content-type"]).toBe("application/octet-stream");
    expect(res.headers["content-disposition"]).toBe("attachment");
  });

  it("mensagem antiga (só payload): tipo derivado, indisponível, sem URL", async () => {
    const { admin, conversation } = await setup();
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction: "INBOUND",
        content: "<media>",
        hasMedia: true,
        sentAt: new Date(),
        payload: {
          hasMedia: true,
          media: { url: "http://localhost:80/api/files/s/x.oga", mimetype: "audio/ogg; codecs=opus" },
        },
      },
    });
    const { messages } = await listMessages(conversation.id, admin.headers);
    expect(messages[0].media).toMatchObject({
      kind: "voice",
      url: null,
      available: false,
      pending: false,
    });
  });

  it("arquivo apagado do disco: available=false", async () => {
    const { admin, conversation } = await setup();
    const message = await storedMessage(conversation.id, admin.operationId);
    rmSync(path.join(mediaDir, admin.operationId, `${message.id}.jpg`));
    const { messages } = await listMessages(conversation.id, admin.headers);
    expect(messages[0].media).toMatchObject({ available: false, url: null });
  });

  it("download pendente: pending=true", async () => {
    const { admin, conversation } = await setup();
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction: "INBOUND",
        hasMedia: true,
        sentAt: new Date(),
        metadata: { media: { kind: "video", mimetype: "video/mp4", filename: null, size: null, stored: false } },
      },
    });
    const { messages } = await listMessages(conversation.id, admin.headers);
    expect(messages[0].media).toMatchObject({ kind: "video", available: false, pending: true });
  });

  it("citação, localização e contato", async () => {
    const { admin, conversation } = await setup();
    const quoted = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction: "OUTBOUND",
        content: "Pode ser amanhã?",
        externalId: "true_5511988887777@c.us_3EB0QUOTED",
        sentAt: new Date(Date.now() - 60_000),
      },
    });
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction: "INBOUND",
        content: "Sim",
        sentAt: new Date(Date.now() - 50_000),
        payload: { replyTo: { id: "3EB0QUOTED", body: "Pode ser amanhã?" } },
      },
    });
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction: "INBOUND",
        hasMedia: true,
        sentAt: new Date(Date.now() - 40_000),
        metadata: {
          media: {
            kind: "location",
            mimetype: null,
            filename: null,
            size: null,
            stored: false,
            location: { lat: -23.5, lng: -46.6, name: "Loja" },
          },
        },
      },
    });
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction: "INBOUND",
        hasMedia: true,
        sentAt: new Date(Date.now() - 30_000),
        payload: { vCards: ["BEGIN:VCARD\nFN:Ana\nTEL;waid=5511911112222:+55\nEND:VCARD"] },
      },
    });

    const { messages } = await listMessages(conversation.id, admin.headers);
    const [first, reply, location, contact] = messages;
    expect(first.ack).toBe("sent");
    expect(reply.replyTo).toEqual({ id: quoted.id, text: "Pode ser amanhã?" });
    expect(location.location).toEqual({ lat: -23.5, lng: -46.6, name: "Loja" });
    expect(location.media).toMatchObject({ kind: "location", available: true, url: null });
    expect(contact.contactCard).toEqual({ name: "Ana", phone: "5511911112222" });
  });

  it("prévia na lista de conversas traz o tipo da mídia", async () => {
    const { admin, conversation } = await setup();
    await storedMessage(conversation.id, admin.operationId, { kind: "sticker", mimetype: "image/webp", ext: "webp" });
    const res = await http.get(`/conversations?status=OPEN`, admin.headers);
    const item = res.json().conversations.find((c: { id: string }) => c.id === conversation.id);
    expect(item.lastMessage).toMatchObject({ content: null, mediaKind: "sticker" });
  });
});
