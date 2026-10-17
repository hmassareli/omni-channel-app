import { createReadStream } from "fs";
import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../prisma";
import {
  baseMimetype,
  readMetadata,
  statStoredMedia,
  verifyMediaSignature,
} from "../../services/conversations/media";

// ============================================================================
// GET /media/:messageId?exp=&sig=
// Entrega o arquivo de mídia de uma mensagem. Sem Authorization (é usado em
// <img>/<audio>/<video>): o acesso é a URL assinada gerada pela listagem de
// mensagens, que já filtra por operação/papel.
// ============================================================================

const paramsSchema = z.object({ messageId: z.uuid() });
const querySchema = z.object({
  exp: z.coerce.number().int(),
  sig: z.string().min(1).max(128),
});

/** Tipos exibidos inline; qualquer outro vai como download (evita HTML/SVG no domínio da API). */
const INLINE_TYPES = /^(image\/(jpeg|png|webp|gif)|video\/(mp4|3gpp|webm|quicktime)|audio\/[a-z0-9.+-]+|application\/pdf)$/;

function contentDisposition(kind: string, filename: string | null, inline: boolean) {
  const type = inline && kind !== "document" ? "inline" : "attachment";
  if (!filename) return type;
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

/** "bytes=a-b" -> intervalo; null = sem Range; "invalid" = 416. */
function parseRange(header: string | undefined, size: number) {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (match[1] === "" && match[2] === "")) return "invalid" as const;
  let start: number;
  let end: number;
  if (match[1] === "") {
    const suffix = Number(match[2]);
    if (suffix === 0) return "invalid" as const;
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] === "" ? size - 1 : Math.min(Number(match[2]), size - 1);
  }
  if (start > end || start >= size) return "invalid" as const;
  return { start, end };
}

export async function mediaRoutes(app: FastifyInstance) {
  app.get("/:messageId", async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    const query = querySchema.safeParse(request.query);
    if (!params.success || !query.success) {
      return reply.status(400).send({ error: "Link de mídia inválido" });
    }
    const { messageId } = params.data;
    if (!(await verifyMediaSignature(messageId, query.data.exp, query.data.sig))) {
      return reply.status(403).send({ error: "Link de mídia expirado ou inválido" });
    }

    const message = await prisma.message.findUnique({
      where: { id: messageId },
      select: { metadata: true },
    });
    const media = readMetadata(message?.metadata).media;
    const file = await statStoredMedia(media);
    if (!media || !file) {
      return reply.status(404).send({ error: "Mídia indisponível" });
    }

    const mimetype = baseMimetype(media.mimetype);
    const inline = Boolean(mimetype && INLINE_TYPES.test(mimetype));
    const range = parseRange(request.headers.range, file.size);

    reply
      .header("Content-Type", inline && mimetype ? mimetype : "application/octet-stream")
      .header("Content-Disposition", contentDisposition(media.kind, media.filename, inline))
      .header("Accept-Ranges", "bytes")
      .header("Cache-Control", "private, max-age=3600")
      .header("X-Content-Type-Options", "nosniff")
      .header("Content-Security-Policy", "default-src 'none'; sandbox")
      .header("Cross-Origin-Resource-Policy", "cross-origin");

    if (range === "invalid") {
      return reply.status(416).header("Content-Range", `bytes */${file.size}`).send();
    }
    if (range) {
      return reply
        .status(206)
        .header("Content-Range", `bytes ${range.start}-${range.end}/${file.size}`)
        .header("Content-Length", String(range.end - range.start + 1))
        .send(createReadStream(file.path, { start: range.start, end: range.end }));
    }
    return reply
      .header("Content-Length", String(file.size))
      .send(createReadStream(file.path));
  });
}
