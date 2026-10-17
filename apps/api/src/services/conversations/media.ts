import { createHmac, timingSafeEqual } from "crypto";
import { createWriteStream, promises as fs } from "fs";
import path from "path";
import { Readable, Transform } from "stream";
import { pipeline } from "stream/promises";
import type { ReadableStream as WebReadableStream } from "stream/web";
import { getDerivedSecret } from "../../auth/tokens";
import { getChannelAdapter } from "../../channels/registry";
import type { DeliveryAck, MediaKind, NormalizedInboundMessage, NormalizedMedia } from "../../channels/types";
import { config } from "../../config";
import { emitDeskEvent } from "../../events/bus";
import { enqueue, QUEUES } from "../../jobs/boss";
import { prisma } from "../../prisma";

// ============================================================================
// Mídia das mensagens — agnóstico de canal.
// O adaptador diz o que é a mídia e sabe buscá-la; aqui baixamos para
// MEDIA_DIR/<operationId>/<messageId>.<ext> e registramos em Message.metadata.media.
// ============================================================================

/** Formato de Message.metadata.media. */
export interface StoredMedia {
  kind: MediaKind;
  mimetype: string | null;
  filename: string | null;
  caption?: string | null;
  size: number | null;
  /** Arquivo salvo em MEDIA_DIR. */
  stored: boolean;
  /** Falha definitiva (não haverá nova tentativa). */
  error?: string;
  /** Última falha transitória (ainda haverá nova tentativa). */
  lastError?: string;
  attempts?: number;
  /** Caminho relativo a MEDIA_DIR (sempre "<operação>/<mensagem>.<ext>"). */
  file?: string;
  location?: NormalizedMedia["location"];
  contact?: NormalizedMedia["contact"];
}

/** Formato de Message.metadata (as chaves que este módulo usa). */
export interface MessageMetadata {
  media?: StoredMedia;
  replyTo?: { externalId: string | null; text: string | null };
  ack?: DeliveryAck;
  [key: string]: unknown;
}

/** Tentativas totais de download (a fila refaz com backoff até lá). */
export const MEDIA_MAX_ATTEMPTS = 5;

/** Tipos de mídia que têm arquivo para baixar. */
export const FILE_MEDIA_KINDS: ReadonlySet<MediaKind> = new Set([
  "image",
  "sticker",
  "video",
  "audio",
  "voice",
  "document",
]);

export function readMetadata(value: unknown): MessageMetadata {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as MessageMetadata)
    : {};
}

/** Metadata inicial de uma mensagem recebida (mídia/citação/ack). Undefined = nada. */
export function buildInboundMetadata(message: NormalizedInboundMessage): MessageMetadata | undefined {
  const metadata: MessageMetadata = {};
  if (message.media) {
    const { media } = message;
    metadata.media = {
      kind: media.kind,
      mimetype: media.mimetype ?? null,
      filename: media.filename ?? null,
      caption: media.caption ?? null,
      size: null,
      stored: false,
      ...(media.location ? { location: media.location } : {}),
      ...(media.contact ? { contact: media.contact } : {}),
      ...(FILE_MEDIA_KINDS.has(media.kind) && !media.sourceUrl ? { error: "no-source" } : {}),
    };
  }
  if (message.replyToExternalId || message.quotedText) {
    metadata.replyTo = {
      externalId: message.replyToExternalId ?? null,
      text: message.quotedText ?? null,
    };
  }
  if (message.ack) metadata.ack = message.ack;
  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

/**
 * Mescla chaves de primeiro nível em Message.metadata de forma atômica
 * (o job de mídia e o ack podem escrever ao mesmo tempo).
 */
export async function mergeMessageMetadata(messageId: string, patch: Partial<MessageMetadata>) {
  await prisma.$executeRaw`
    UPDATE "omni_messages"
    SET "metadata" = (CASE WHEN jsonb_typeof("metadata") = 'object' THEN "metadata" ELSE '{}'::jsonb END)
      || ${JSON.stringify(patch)}::jsonb
    WHERE "id" = ${messageId}`;
}

// ----------------------------------------------------------------------------
// Arquivos
// ----------------------------------------------------------------------------

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/heic": "heic",
  "video/mp4": "mp4",
  "video/3gpp": "3gp",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/aac": "aac",
  "audio/amr": "amr",
  "audio/wav": "wav",
  "audio/webm": "weba",
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "application/zip": "zip",
  "text/plain": "txt",
  "text/csv": "csv",
};

export function baseMimetype(mimetype: string | null | undefined): string | null {
  const base = mimetype?.split(";")[0]?.trim().toLowerCase();
  return base || null;
}

function safeExt(value: string | null | undefined): string | null {
  const ext = value?.toLowerCase();
  return ext && /^[a-z0-9]{1,10}$/.test(ext) ? ext : null;
}

function extFromName(name: string | null | undefined): string | null {
  const match = name?.match(/\.([A-Za-z0-9]{1,10})$/);
  return safeExt(match?.[1]);
}

/** Extensão segura do arquivo salvo (só [a-z0-9]). */
export function extensionFor(mimetype: string | null, filename: string | null, sourceUrl?: string | null): string {
  const base = baseMimetype(mimetype);
  let fromUrl: string | null = null;
  try {
    fromUrl = sourceUrl ? extFromName(new URL(sourceUrl, "http://x").pathname) : null;
  } catch {
    fromUrl = null;
  }
  return (base && EXT_BY_MIME[base]) || extFromName(filename) || fromUrl || "bin";
}

/** Caminho absoluto de um arquivo de MEDIA_DIR; null se escapar do diretório. */
export function resolveMediaPath(relative: string): string | null {
  const root = config.mediaDir;
  const full = path.resolve(root, relative);
  return full.startsWith(root + path.sep) ? full : null;
}

/** Arquivo da mídia, se existir em disco. */
export async function statStoredMedia(media: StoredMedia | undefined) {
  if (!media?.stored || !media.file) return null;
  const full = resolveMediaPath(media.file);
  if (!full) return null;
  try {
    const stat = await fs.stat(full);
    return stat.isFile() ? { path: full, size: stat.size } : null;
  } catch {
    return null;
  }
}

// ----------------------------------------------------------------------------
// Download (job "download-media")
// ----------------------------------------------------------------------------

export function enqueueMediaDownload(messageId: string, sourceUrl: string) {
  return enqueue(QUEUES.downloadMedia, { messageId, sourceUrl }, { singletonKey: messageId });
}

class TooLargeError extends Error {}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Baixa a mídia de uma mensagem pelo adaptador do canal e salva em MEDIA_DIR.
 * Falha transitória: grava `lastError` e lança (a fila tenta de novo).
 * Falha definitiva (404, tamanho, sem URL, última tentativa): grava `error` e retorna.
 */
export async function downloadMessageMedia(messageId: string, sourceUrl: string): Promise<void> {
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: {
      id: true,
      conversationId: true,
      metadata: true,
      conversation: { select: { channel: true } },
    },
  });
  if (!message) return;

  const { channel } = message.conversation;
  const metadata = readMetadata(message.metadata);
  const current = metadata.media;
  if (current && (await statStoredMedia(current))) return; // já baixada

  const base: StoredMedia = current ?? {
    kind: "document",
    mimetype: null,
    filename: null,
    size: null,
    stored: false,
  };
  const { error: _e, lastError: _l, ...clean } = base;
  const attempts = (base.attempts ?? 0) + 1;

  const notify = () => {
    if (channel.operationId) {
      emitDeskEvent({
        type: "conversation.updated",
        operationId: channel.operationId,
        conversationId: message.conversationId,
      });
    }
  };

  const fail = async (reason: string, retryable: boolean) => {
    const final = !retryable || attempts >= MEDIA_MAX_ATTEMPTS;
    await mergeMessageMetadata(messageId, {
      media: { ...clean, stored: false, attempts, ...(final ? { error: reason } : { lastError: reason }) },
    });
    if (final) {
      console.warn(`[media] mensagem ${messageId}: download desistido (${reason})`);
      notify();
      return;
    }
    throw new Error(`Falha ao baixar mídia da mensagem ${messageId}: ${reason}`);
  };

  const adapter = getChannelAdapter(channel.type);
  if (!adapter.fetchMedia) return fail("unsupported-channel", false);

  let response: Response;
  try {
    response = await adapter.fetchMedia(channel, sourceUrl);
  } catch (error) {
    const retryable = (error as { retryable?: boolean }).retryable !== false;
    return fail(errorText(error), retryable);
  }

  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    const retryable = response.status >= 500 || response.status === 408 || response.status === 429;
    return fail(`http-${response.status}`, retryable);
  }

  const max = config.mediaMaxBytes;
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > max) {
    await response.body?.cancel().catch(() => undefined);
    return fail("too-large", false);
  }
  if (!response.body) return fail("empty", true);

  const mimetype = base.mimetype ?? baseMimetype(response.headers.get("content-type"));
  const ext = extensionFor(mimetype, base.filename, sourceUrl);
  const folder = channel.operationId ?? "_sem-operacao";
  const relative = `${folder}/${message.id}.${ext}`;
  const finalPath = resolveMediaPath(relative);
  if (!finalPath) return fail("invalid-path", false);

  await fs.mkdir(path.dirname(finalPath), { recursive: true });
  const tmpPath = `${finalPath}.${process.pid}-${Date.now()}.part`;

  let size = 0;
  const limiter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      size += chunk.length;
      if (size > max) callback(new TooLargeError("too-large"));
      else callback(null, chunk);
    },
  });

  try {
    await pipeline(
      Readable.fromWeb(response.body as unknown as WebReadableStream<Uint8Array>),
      limiter,
      createWriteStream(tmpPath),
    );
  } catch (error) {
    await fs.rm(tmpPath, { force: true });
    if (error instanceof TooLargeError) return fail("too-large", false);
    return fail(errorText(error), true);
  }

  if (size === 0) {
    await fs.rm(tmpPath, { force: true });
    return fail("empty", true);
  }

  await fs.rename(tmpPath, finalPath);
  await mergeMessageMetadata(messageId, {
    media: { ...clean, mimetype, size, stored: true, file: relative, attempts },
  });
  notify();
}

// ----------------------------------------------------------------------------
// URL assinada (GET /media/:messageId?exp=&sig=)
// <img>/<audio> não mandam Authorization: a listagem (que já checa acesso)
// gera uma URL de curta duração assinada com HMAC-SHA256.
// ----------------------------------------------------------------------------

export const MEDIA_URL_TTL_SECONDS = 60 * 60;
/** Arredonda a expiração: a URL fica estável por um tempo e o navegador reaproveita o cache. */
const MEDIA_URL_BUCKET_SECONDS = 10 * 60;

async function mediaSignature(messageId: string, exp: number) {
  const key = await getDerivedSecret("media-url");
  return createHmac("sha256", key).update(`${messageId}.${exp}`).digest("base64url");
}

export async function signMediaUrl(messageId: string, now = Date.now()) {
  const minExp = Math.floor(now / 1000) + MEDIA_URL_TTL_SECONDS;
  const exp = Math.ceil(minExp / MEDIA_URL_BUCKET_SECONDS) * MEDIA_URL_BUCKET_SECONDS;
  const sig = await mediaSignature(messageId, exp);
  return `/media/${messageId}?exp=${exp}&sig=${sig}`;
}

export async function verifyMediaSignature(messageId: string, exp: number, sig: string, now = Date.now()) {
  const nowSeconds = Math.floor(now / 1000);
  if (!Number.isInteger(exp) || exp < nowSeconds) return false;
  // Nada de expiração "eterna" forjada com um segredo antigo vazado.
  if (exp > nowSeconds + MEDIA_URL_TTL_SECONDS + MEDIA_URL_BUCKET_SECONDS + 60) return false;
  const expected = Buffer.from(await mediaSignature(messageId, exp));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
