import { MessageDirection, type ChannelType, type Message } from "@prisma/client";
import type { DeskDeliveryAck, DeskMediaKind, DeskThreadMessage } from "../../api-types";
import { getChannelAdapter } from "../../channels/registry";
import type { StoredPayloadDescription } from "../../channels/types";
import { prisma } from "../../prisma";
import { externalIdCandidates } from "./ack";
import {
  FILE_MEDIA_KINDS,
  readMetadata,
  signMediaUrl,
  statStoredMedia,
  type StoredMedia,
} from "./media";

// ============================================================================
// Visão das mensagens para a mesa: mídia (com URL assinada), citação,
// localização e status de entrega. Mensagens novas têm isso em
// Message.metadata; as antigas são derivadas do payload cru pelo adaptador.
// ============================================================================

/** Depois disso, mídia sem arquivo e sem erro deixa de ser "carregando". */
const PENDING_WINDOW_MS = 30 * 60 * 1000;

interface Described {
  media: StoredMedia | null;
  replyTo: { externalId: string | null; text: string | null } | null;
  ack: DeskDeliveryAck | null;
  /** Veio da metadata (gravada na ingestão) e não do payload antigo. */
  fromMetadata: boolean;
}

function describeFromPayload(channelType: ChannelType, payload: unknown): StoredPayloadDescription | null {
  if (payload === null || payload === undefined) return null;
  try {
    return getChannelAdapter(channelType).describeStoredPayload?.(payload) ?? null;
  } catch {
    return null;
  }
}

type DescribableMessage = Pick<Message, "metadata" | "payload" | "hasMedia">;

function describe(message: DescribableMessage, channelType: ChannelType): Described {
  const metadata = readMetadata(message.metadata);
  const needsPayload = !metadata.media || !metadata.replyTo || !metadata.ack;
  const fallback = needsPayload ? describeFromPayload(channelType, message.payload) : null;

  let media: StoredMedia | null = metadata.media ?? null;
  if (!media && fallback?.media) {
    const m = fallback.media;
    media = {
      kind: m.kind,
      mimetype: m.mimetype ?? null,
      filename: m.filename ?? null,
      caption: m.caption ?? null,
      size: null,
      stored: false,
      location: m.location ?? null,
      contact: m.contact ?? null,
    };
  }

  const replyTo =
    metadata.replyTo ??
    (fallback && (fallback.replyToExternalId || fallback.quotedText)
      ? { externalId: fallback.replyToExternalId, text: fallback.quotedText }
      : null);

  return {
    media,
    replyTo,
    ack: metadata.ack ?? fallback?.ack ?? null,
    fromMetadata: Boolean(metadata.media),
  };
}

/** Tipo de mídia de uma mensagem (prévia na lista de conversas). */
export function messageMediaKind(message: DescribableMessage, channelType: ChannelType): DeskMediaKind | null {
  if (!message.hasMedia && !readMetadata(message.metadata).media) return null;
  return describe(message, channelType).media?.kind ?? null;
}

/** Converte as mensagens do banco no formato da mesa (assina as URLs de mídia). */
export async function toThreadMessages(
  messages: Message[],
  conversationId: string,
  channelType: ChannelType,
  now = Date.now(),
): Promise<DeskThreadMessage[]> {
  const described = messages.map((m) => describe(m, channelType));

  // Resolve as mensagens citadas (por ID externo) dentro da mesma conversa.
  const quotedIds = [
    ...new Set(described.map((d) => d.replyTo?.externalId).filter((v): v is string => Boolean(v))),
  ];
  const quoted =
    quotedIds.length > 0
      ? await prisma.message.findMany({
          where: {
            conversationId,
            OR: quotedIds.flatMap((id) => {
              const { exact, suffix } = externalIdCandidates(id);
              return [{ externalId: { in: exact } }, { externalId: { endsWith: suffix } }];
            }),
          },
          select: { id: true, externalId: true, content: true },
        })
      : [];
  const findQuoted = (externalId: string) => {
    const { exact, suffix } = externalIdCandidates(externalId);
    return quoted.find(
      (q) => q.externalId && (exact.includes(q.externalId) || q.externalId.endsWith(suffix)),
    );
  };

  return Promise.all(
    messages.map(async (message, index) => {
      const d = described[index];
      const { payload: _payload, metadata: _metadata, ...base } = message;

      let media: DeskThreadMessage["media"] = null;
      if (d.media) {
        const hasFile = FILE_MEDIA_KINDS.has(d.media.kind);
        const file = hasFile ? await statStoredMedia(d.media) : null;
        const pending =
          hasFile &&
          !file &&
          d.fromMetadata &&
          !d.media.stored &&
          !d.media.error &&
          now - message.createdAt.getTime() < PENDING_WINDOW_MS;
        media = {
          kind: d.media.kind,
          mimetype: d.media.mimetype,
          filename: d.media.filename,
          caption: message.content ?? d.media.caption ?? null,
          url: file ? await signMediaUrl(message.id, now) : null,
          available: hasFile ? Boolean(file) : true,
          pending,
          size: file?.size ?? d.media.size ?? null,
        };
      }

      let replyTo: DeskThreadMessage["replyTo"] = null;
      if (d.replyTo) {
        const target = d.replyTo.externalId ? findQuoted(d.replyTo.externalId) : undefined;
        replyTo = { id: target?.id ?? null, text: d.replyTo.text ?? target?.content ?? null };
      }

      const location = d.media?.kind === "location" && d.media.location
        ? { lat: d.media.location.lat, lng: d.media.location.lng, name: d.media.location.name ?? null }
        : null;
      const contactCard = d.media?.kind === "contact" && d.media.contact
        ? { name: d.media.contact.name ?? null, phone: d.media.contact.phone ?? null }
        : null;

      const ack: DeskDeliveryAck | null =
        message.direction === MessageDirection.OUTBOUND
          ? (d.ack ?? (message.externalId ? "sent" : "pending"))
          : null;

      return { ...base, media, replyTo, location, contactCard, ack };
    }),
  );
}
