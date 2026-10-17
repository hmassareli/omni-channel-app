import type {
  DeliveryAck,
  MediaKind,
  NormalizedLocation,
  NormalizedMedia,
  StoredPayloadDescription,
} from "../types";

// ============================================================================
// Extração de mídia / citação / ack do payload do WAHA (engine GOWS e afins).
// Funções puras e tolerantes: o payload cru pode vir de versões diferentes do
// WAHA, então tudo é lido de forma defensiva.
// ============================================================================

type Loose = Record<string, unknown>;

function obj(value: unknown): Loose | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Loose)
    : null;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function num(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

function truthy(value: unknown): boolean {
  return value === true || (typeof value === "string" && value.toLowerCase() === "true");
}

/** Lê uma chave em camelCase ou PascalCase (protojson do GOWS varia). */
function pick(source: Loose | null, key: string): unknown {
  if (!source) return undefined;
  if (key in source) return source[key];
  const pascal = key.charAt(0).toUpperCase() + key.slice(1);
  return source[pascal];
}

/** Mensagem protobuf do WhatsApp dentro de `_data` (GOWS: _data.Message). */
function innerMessage(payload: Loose): Loose | null {
  const data = obj(payload._data);
  return obj(pick(data, "message"));
}

function mediaTypeHint(payload: Loose): string | null {
  const info = obj(pick(obj(payload._data), "info"));
  return str(pick(info, "mediaType"))?.toLowerCase() ?? null;
}

function isSticker(payload: Loose, mimetype: string | null): boolean {
  if (mediaTypeHint(payload) === "sticker") return true;
  if (obj(pick(innerMessage(payload), "stickerMessage"))) return true;
  if (str(payload.type)?.toLowerCase() === "sticker") return true;
  return mimetype === "image/webp";
}

function isVoice(payload: Loose, mimetype: string | null): boolean {
  const hint = mediaTypeHint(payload);
  if (hint === "ptt") return true;
  const audio = obj(pick(innerMessage(payload), "audioMessage"));
  if (audio && truthy(pick(audio, "PTT") ?? pick(audio, "ptt"))) return true;
  if (str(payload.type)?.toLowerCase() === "ptt") return true;
  return Boolean(mimetype?.startsWith("audio/ogg") && mimetype.includes("opus"));
}

/** Classifica a mídia pelo mimetype + dicas do payload. */
export function classifyMedia(payload: Loose, mimetype: string | null): MediaKind {
  const base = mimetype?.split(";")[0]?.trim().toLowerCase() ?? "";
  if (base.startsWith("image/")) return isSticker(payload, base) ? "sticker" : "image";
  if (base.startsWith("video/")) return "video";
  if (base.startsWith("audio/")) return isVoice(payload, mimetype?.toLowerCase() ?? null) ? "voice" : "audio";
  if (base) return "document";

  // Sem mimetype: tenta pelas dicas do provedor.
  const hint = mediaTypeHint(payload);
  const inner = innerMessage(payload);
  if (hint === "sticker" || obj(pick(inner, "stickerMessage"))) return "sticker";
  if (hint === "ptt") return "voice";
  if (hint === "image" || obj(pick(inner, "imageMessage"))) return "image";
  if (hint === "video" || hint === "gif" || obj(pick(inner, "videoMessage"))) return "video";
  if (hint === "audio" || obj(pick(inner, "audioMessage"))) return isVoice(payload, null) ? "voice" : "audio";
  return "document";
}

function extractLocation(payload: Loose): NormalizedLocation | null {
  const location = obj(payload.location);
  if (location) {
    const lat = num(location.latitude);
    const lng = num(location.longitude);
    if (lat !== null && lng !== null) {
      return {
        lat,
        lng,
        name: str(location.name) ?? str(location.description) ?? str(location.address),
      };
    }
  }
  const inner = obj(pick(innerMessage(payload), "locationMessage"));
  if (inner) {
    const lat = num(pick(inner, "degreesLatitude"));
    const lng = num(pick(inner, "degreesLongitude"));
    if (lat !== null && lng !== null) {
      return { lat, lng, name: str(pick(inner, "name")) ?? str(pick(inner, "address")) };
    }
  }
  return null;
}

/** Nome (FN) e primeiro telefone (TEL) de um vCard. */
export function parseVCard(vcard: string): { name: string | null; phone: string | null } {
  const lines = vcard.split(/\r?\n/);
  const field = (prefix: string) => {
    const line = lines.find((l) => l.toUpperCase().startsWith(prefix));
    const value = line?.slice(line.indexOf(":") + 1).trim();
    return value || null;
  };
  const telLine = lines.find((l) => l.toUpperCase().startsWith("TEL"));
  const waid = telLine?.match(/waid=(\d+)/i)?.[1];
  const tel = telLine?.slice(telLine.lastIndexOf(":") + 1).trim();
  return { name: field("FN"), phone: waid ?? (tel || null) };
}

function extractContact(payload: Loose): NormalizedMedia["contact"] | null {
  const vcards = Array.isArray(payload.vCards) ? payload.vCards : [];
  const first = vcards.find((v): v is string => typeof v === "string" && v.trim().length > 0);
  if (first) return parseVCard(first);
  const inner = obj(pick(innerMessage(payload), "contactMessage"));
  if (inner) {
    const vcard = str(pick(inner, "vcard"));
    const parsed = vcard ? parseVCard(vcard) : { name: null, phone: null };
    return { name: str(pick(inner, "displayName")) ?? parsed.name, phone: parsed.phone };
  }
  return null;
}

function documentFilename(payload: Loose, media: Loose | null): string | null {
  const fromMedia = str(media?.filename);
  if (fromMedia) return fromMedia;
  const doc = obj(pick(innerMessage(payload), "documentMessage"));
  return str(pick(doc, "fileName")) ?? str(pick(doc, "title"));
}

/** Legenda/texto: o WAHA coloca a legenda da mídia em `body`. */
function captionOf(payload: Loose): string | null {
  return str(payload.body);
}

/**
 * Extrai a mídia (ou localização/contato) do payload. Null = mensagem de texto.
 */
export function extractWahaMedia(rawPayload: unknown): NormalizedMedia | null {
  const payload = obj(rawPayload);
  if (!payload) return null;

  const location = extractLocation(payload);
  if (location) {
    return { kind: "location", location, caption: null };
  }

  const contact = extractContact(payload);
  if (contact) {
    return { kind: "contact", contact, caption: null };
  }

  const media = obj(payload.media);
  const hasMedia = truthy(payload.hasMedia) || Boolean(media);
  if (!hasMedia) return null;

  const mimetype = str(media?.mimetype);
  const kind = classifyMedia(payload, mimetype);
  return {
    kind,
    mimetype,
    filename: kind === "document" ? documentFilename(payload, media) : str(media?.filename),
    caption: kind === "sticker" ? null : captionOf(payload),
    sourceUrl: str(media?.url),
  };
}

/** ID curto do WhatsApp: "true_5511...@c.us_3EB0ABC" -> "3EB0ABC". */
export function shortWaMessageId(id: string): string {
  const parts = id.split("_");
  return parts.length >= 3 ? parts.slice(2).join("_") : id;
}

export function extractWahaReply(rawPayload: unknown): {
  replyToExternalId: string | null;
  quotedText: string | null;
} {
  const payload = obj(rawPayload);
  const replyTo = obj(payload?.replyTo);
  if (!replyTo) return { replyToExternalId: null, quotedText: null };
  return {
    replyToExternalId: str(replyTo.id),
    quotedText: str(replyTo.body),
  };
}

/** Ack do WAHA (número ou nome) -> status de entrega. ERROR/desconhecido = null. */
export function mapWahaAck(ack: unknown, ackName?: unknown): DeliveryAck | null {
  const name = str(ackName)?.toUpperCase();
  const value = num(ack);
  if (name === "PENDING" || value === 0) return "pending";
  if (name === "SERVER" || value === 1) return "sent";
  if (name === "DEVICE" || value === 2) return "delivered";
  if (name === "READ" || name === "PLAYED" || value === 3 || value === 4) return "read";
  return null;
}

/** Descreve um payload cru já gravado (mensagens antigas, sem metadata). */
export function describeWahaPayload(rawPayload: unknown): StoredPayloadDescription {
  const payload = obj(rawPayload);
  const media = extractWahaMedia(payload);
  const reply = extractWahaReply(payload);
  return {
    media,
    ...reply,
    ack: payload && truthy(payload.fromMe) ? mapWahaAck(payload.ack, payload.ackName) : null,
  };
}
