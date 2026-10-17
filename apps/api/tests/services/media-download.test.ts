import { existsSync, mkdtempSync, readFileSync, rmSync } from "fs";
import os from "os";
import path from "path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { registerAllChannels } from "../../src/channels";
import type { NormalizedInboundMessage } from "../../src/channels/types";
import { onDeskEvent, type DeskEvent } from "../../src/events/bus";
import { prisma } from "../../src/prisma";
import { ingestChannelMessage } from "../../src/services/conversations/ingest";
import {
  downloadMessageMedia,
  MEDIA_MAX_ATTEMPTS,
  readMetadata,
} from "../../src/services/conversations/media";

const SOURCE = "http://localhost:80/api/files/sessao-1/ABC.jpeg";
const fetchMock = vi.fn<typeof fetch>();
let mediaDir: string;
let seq = 0;

function inbound(overrides: Partial<NormalizedInboundMessage> = {}): NormalizedInboundMessage {
  return {
    identity: { type: "WHATSAPP", value: "5511999990000" },
    externalMessageId: `ext-media-${++seq}`,
    conversationExternalId: "5511999990000@c.us",
    direction: "INBOUND",
    text: null,
    hasMedia: true,
    media: { kind: "image", mimetype: "image/jpeg", sourceUrl: SOURCE, caption: null },
    sentAt: new Date(),
    raw: {},
    ...overrides,
  };
}

function fileResponse(bytes: Uint8Array, headers: Record<string, string> = {}) {
  return new Response(bytes, {
    status: 200,
    headers: { "content-type": "image/jpeg", "content-length": String(bytes.length), ...headers },
  });
}

async function setup() {
  const operation = await prisma.operation.create({ data: { name: "Op mídia" } });
  const channel = await prisma.channel.create({
    data: { name: "WA", type: "WHATSAPP", operationId: operation.id },
  });
  return { operation, channel };
}

async function ingest(channel: Awaited<ReturnType<typeof setup>>["channel"], m = inbound()) {
  const result = await ingestChannelMessage(channel, m);
  if (result.skipped) throw new Error(result.reason);
  return result;
}

async function mediaOf(messageId: string) {
  const message = await prisma.message.findUniqueOrThrow({ where: { id: messageId } });
  return readMetadata(message.metadata).media!;
}

describe("job download-media", () => {
  const env = { ...process.env };

  beforeAll(() => {
    registerAllChannels();
  });

  beforeEach(() => {
    mediaDir = mkdtempSync(path.join(os.tmpdir(), "omni-media-"));
    process.env.MEDIA_DIR = mediaDir;
    process.env.WAHA_API_URL = "http://waha.interno:3000/";
    process.env.WAHA_API_KEY = "chave-waha";
    delete process.env.MEDIA_MAX_BYTES;
    delete process.env.GROQ_API_KEY;
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    rmSync(mediaDir, { recursive: true, force: true });
    for (const key of ["MEDIA_DIR", "WAHA_API_URL", "WAHA_API_KEY", "MEDIA_MAX_BYTES"]) {
      if (env[key] === undefined) delete process.env[key];
      else process.env[key] = env[key];
    }
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it("baixa do WAHA (base trocada + X-Api-Key) e salva em MEDIA_DIR/<operação>/<mensagem>.<ext>", async () => {
    const { operation, channel } = await setup();
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3]);
    fetchMock.mockResolvedValueOnce(fileResponse(bytes));
    const events: DeskEvent[] = [];
    const off = onDeskEvent((e) => events.push(e));

    const { messageId, conversationId } = await ingest(channel);
    off();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://waha.interno:3000/api/files/sessao-1/ABC.jpeg");
    expect((init?.headers as Record<string, string>)["X-Api-Key"]).toBe("chave-waha");

    const media = await mediaOf(messageId);
    expect(media).toMatchObject({
      kind: "image",
      mimetype: "image/jpeg",
      size: bytes.length,
      stored: true,
      file: `${operation.id}/${messageId}.jpg`,
    });
    expect(media.error).toBeUndefined();
    const saved = path.join(mediaDir, operation.id, `${messageId}.jpg`);
    expect(readFileSync(saved)).toEqual(Buffer.from(bytes));
    expect(events).toContainEqual({
      type: "conversation.updated",
      operationId: operation.id,
      conversationId,
    });

    const message = await prisma.message.findUniqueOrThrow({ where: { id: messageId } });
    expect(message.content).toBeNull();
  });

  it("404 do WAHA: falha definitiva gravada; a mensagem continua gravada", async () => {
    const { channel } = await setup();
    fetchMock.mockResolvedValueOnce(new Response("nope", { status: 404 }));

    const { messageId } = await ingest(channel);

    const media = await mediaOf(messageId);
    expect(media).toMatchObject({ stored: false, error: "http-404", attempts: 1 });
    expect(await prisma.message.count()).toBe(1);
  });

  it("erro transitório: lança (retry da fila) até a última tentativa, então desiste", async () => {
    const { channel } = await setup();
    fetchMock.mockImplementation(async () => new Response("erro", { status: 503 }));

    // Inline na ingestão: a falha não derruba a ingestão.
    const { messageId } = await ingest(channel);
    let media = await mediaOf(messageId);
    expect(media).toMatchObject({ stored: false, lastError: "http-503", attempts: 1 });
    expect(media.error).toBeUndefined();

    for (let attempt = 2; attempt < MEDIA_MAX_ATTEMPTS; attempt += 1) {
      await expect(downloadMessageMedia(messageId, SOURCE)).rejects.toThrow(/http-503/);
    }
    await expect(downloadMessageMedia(messageId, SOURCE)).resolves.toBeUndefined();
    media = await mediaOf(messageId);
    expect(media).toMatchObject({ stored: false, error: "http-503", attempts: MEDIA_MAX_ATTEMPTS });
  });

  it("falha de rede é transitória; nova tentativa com sucesso limpa o erro", async () => {
    const { channel } = await setup();
    fetchMock
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(fileResponse(new Uint8Array([1, 2, 3])));

    const { messageId } = await ingest(channel);
    expect((await mediaOf(messageId)).lastError).toBe("fetch failed");

    await downloadMessageMedia(messageId, SOURCE);
    const media = await mediaOf(messageId);
    expect(media).toMatchObject({ stored: true, size: 3, attempts: 2 });
    expect(media.lastError).toBeUndefined();
  });

  it("Content-Length acima do limite: não baixa", async () => {
    process.env.MEDIA_MAX_BYTES = "10";
    const { channel } = await setup();
    fetchMock.mockResolvedValueOnce(fileResponse(new Uint8Array(20)));

    const { messageId } = await ingest(channel);
    expect(await mediaOf(messageId)).toMatchObject({ stored: false, error: "too-large" });
  });

  it("corpo maior que o limite sem Content-Length: aborta e apaga o parcial", async () => {
    process.env.MEDIA_MAX_BYTES = "10";
    const { operation, channel } = await setup();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(8));
        controller.enqueue(new Uint8Array(8));
        controller.close();
      },
    });
    fetchMock.mockResolvedValueOnce(new Response(stream, { headers: { "content-type": "image/jpeg" } }));

    const { messageId } = await ingest(channel);
    expect(await mediaOf(messageId)).toMatchObject({ stored: false, error: "too-large" });
    const folder = path.join(mediaDir, operation.id);
    expect(existsSync(path.join(folder, `${messageId}.jpg`))).toBe(false);
    if (existsSync(folder)) {
      const { readdirSync } = await import("fs");
      expect(readdirSync(folder)).toEqual([]);
    }
  });

  it("URL fora de /api/files é recusada sem chamar a rede", async () => {
    const { channel } = await setup();
    const { messageId } = await ingest(
      channel,
      inbound({ media: { kind: "image", mimetype: "image/jpeg", sourceUrl: "http://evil.example/x.jpg" } }),
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect((await mediaOf(messageId)).error).toMatch(/fora de \/api\/files/);
  });

  it("sem sourceUrl (ex.: localização): não agenda download", async () => {
    const { channel } = await setup();
    const { messageId } = await ingest(
      channel,
      inbound({
        hasMedia: true,
        media: { kind: "location", location: { lat: 1, lng: 2, name: "Loja" } },
      }),
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await mediaOf(messageId)).toMatchObject({
      kind: "location",
      stored: false,
      location: { lat: 1, lng: 2, name: "Loja" },
    });
  });

  it("extensão do arquivo vem do mimetype (documento docx)", async () => {
    const { operation, channel } = await setup();
    fetchMock.mockResolvedValueOnce(fileResponse(new Uint8Array([1]), { "content-type": "application/octet-stream" }));
    const { messageId } = await ingest(
      channel,
      inbound({
        media: {
          kind: "document",
          mimetype: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          filename: "contrato.docx",
          sourceUrl: "http://localhost:80/api/files/sessao-1/ABC.docx",
        },
      }),
    );
    expect((await mediaOf(messageId)).file).toBe(`${operation.id}/${messageId}.docx`);
  });
});
