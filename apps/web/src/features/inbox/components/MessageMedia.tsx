import {
  Check,
  CheckCheck,
  Clock,
  Contact,
  Download,
  FileText,
  FileX,
  Headphones,
  ImageOff,
  MapPin,
  Mic,
  MicOff,
  Sticker,
  VideoOff,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import { Dialog, Spinner } from "../../../components/ui";
import type { DeskDeliveryAck, DeskMediaKind, DeskMessage, DeskMessageMedia } from "../../../lib/api";
import { apiUrl } from "../../../lib/api";
import { cn } from "../../../lib/cn";
import { MEDIA_LABEL } from "../labels";

// ============================================================================
// Conteúdo de mídia das mensagens (foto, figurinha, vídeo, áudio, documento,
// localização, contato), citação de resposta e ticks de entrega.
// ============================================================================

const UNAVAILABLE_ICON: Record<DeskMediaKind, LucideIcon> = {
  image: ImageOff,
  sticker: Sticker,
  video: VideoOff,
  audio: MicOff,
  voice: MicOff,
  document: FileX,
  location: MapPin,
  contact: Contact,
};

/** "Foto indisponível", "Áudio indisponível"... */
function unavailableLabel(kind: DeskMediaKind) {
  return `${MEDIA_LABEL[kind]} indisponível`;
}

function formatBytes(size: number | null) {
  if (!size) return null;
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

function documentExtension(media: DeskMessageMedia) {
  const fromName = media.filename?.match(/\.([a-z0-9]{1,6})$/i)?.[1];
  if (fromName) return fromName.toUpperCase();
  const sub = media.mimetype?.split("/")[1]?.split(";")[0];
  return sub && sub.length <= 6 ? sub.toUpperCase() : "ARQ";
}

function MediaPlaceholder({ media }: { media: DeskMessageMedia }) {
  const Icon = UNAVAILABLE_ICON[media.kind];
  const label = MEDIA_LABEL[media.kind].toLowerCase();
  return (
    <div
      className="flex min-w-48 items-center gap-2.5 rounded-lg border border-dashed border-line-strong bg-subtle/60 px-3 py-2.5 text-xs text-fg-muted"
      role={media.pending ? "status" : undefined}
    >
      {media.pending ? (
        <>
          <Spinner size="sm" label={`Carregando ${label}`} />
          <span>Carregando {label}…</span>
        </>
      ) : (
        <>
          <Icon className="size-4 shrink-0 text-fg-faint" aria-hidden />
          <span>{unavailableLabel(media.kind)}</span>
        </>
      )}
    </div>
  );
}

function ImageMedia({ media, src }: { media: DeskMessageMedia; src: string }) {
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  if (failed) return <MediaPlaceholder media={{ ...media, pending: false }} />;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="block overflow-hidden rounded-lg focus-visible:outline-2"
        aria-label="Ampliar foto"
      >
        <img
          src={src}
          alt={media.caption ?? "Foto"}
          loading="lazy"
          onError={() => setFailed(true)}
          className="block max-h-[280px] w-auto max-w-[280px] rounded-lg object-cover transition-opacity hover:opacity-95"
        />
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Foto" size="lg">
        <div className="space-y-3">
          <img
            src={src}
            alt={media.caption ?? "Foto"}
            className="mx-auto max-h-[70vh] w-auto rounded-lg object-contain"
          />
          {media.caption && (
            <p className="whitespace-pre-wrap break-words text-sm text-fg">{media.caption}</p>
          )}
          <div className="flex justify-end">
            <a
              href={src}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-accent-700 hover:underline"
            >
              <Download className="size-4" /> Abrir original
            </a>
          </div>
        </div>
      </Dialog>
    </>
  );
}

function AudioMedia({ media, src }: { media: DeskMessageMedia; src: string }) {
  const Icon = media.kind === "voice" ? Mic : Headphones;
  return (
    <div className="flex w-72 max-w-full items-center gap-2 rounded-lg bg-subtle/70 p-1.5 pr-2">
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-full",
          media.kind === "voice" ? "bg-accent-600 text-white" : "bg-surface text-fg-muted",
        )}
        aria-hidden
      >
        <Icon className="size-4" />
      </span>
      <audio
        controls
        preload="metadata"
        src={src}
        aria-label={media.kind === "voice" ? "Mensagem de voz" : "Áudio"}
        className="h-8 min-w-0 flex-1 [&::-webkit-media-controls-panel]:bg-transparent"
      />
    </div>
  );
}

function DocumentMedia({ media, src }: { media: DeskMessageMedia; src: string | null }) {
  const size = formatBytes(media.size);
  return (
    <div className="flex w-72 max-w-full items-center gap-3 rounded-lg border border-line bg-surface p-2.5">
      <span className="relative flex size-10 shrink-0 items-center justify-center rounded-md bg-accent-50 text-accent-700">
        <FileText className="size-5" aria-hidden />
        <span className="absolute -bottom-1 rounded bg-accent-600 px-1 text-[9px] font-semibold leading-3 text-white">
          {documentExtension(media)}
        </span>
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-fg" title={media.filename ?? undefined}>
          {media.filename ?? "Documento"}
        </p>
        <p className="text-2xs text-fg-muted">
          {src ? (size ?? "Documento") : media.pending ? "Carregando…" : "Documento indisponível"}
        </p>
      </div>
      {src ? (
        <a
          href={src}
          download={media.filename ?? true}
          aria-label={`Baixar ${media.filename ?? "documento"}`}
          className="flex size-8 shrink-0 items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-subtle hover:text-fg"
        >
          <Download className="size-4" />
        </a>
      ) : media.pending ? (
        <Spinner size="sm" />
      ) : (
        <FileX className="size-4 shrink-0 text-fg-faint" aria-hidden />
      )}
    </div>
  );
}

function LocationCard({ location }: { location: NonNullable<DeskMessage["location"]> }) {
  const href = `https://www.google.com/maps/search/?api=1&query=${location.lat},${location.lng}`;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="flex w-64 max-w-full items-center gap-3 rounded-lg border border-line bg-surface p-2.5 transition-colors hover:bg-subtle"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-success-50 text-success-700">
        <MapPin className="size-5" aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-fg">
          {location.name ?? "Localização"}
        </span>
        <span className="block text-2xs text-accent-700">Abrir no Google Maps</span>
      </span>
    </a>
  );
}

function ContactCard({ contact }: { contact: NonNullable<DeskMessage["contactCard"]> }) {
  return (
    <div className="flex w-64 max-w-full items-center gap-3 rounded-lg border border-line bg-surface p-2.5">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-subtle text-fg-muted">
        <Contact className="size-5" aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-fg">{contact.name ?? "Contato"}</span>
        {contact.phone && <span className="block text-2xs text-fg-muted">{contact.phone}</span>}
      </span>
    </div>
  );
}

/** Corpo de mídia da mensagem (sem a legenda). */
export function MessageMedia({ message }: { message: DeskMessage }) {
  const { media } = message;
  if (!media) return null;

  if (media.kind === "location" && message.location) {
    return <LocationCard location={message.location} />;
  }
  if (media.kind === "contact" && message.contactCard) {
    return <ContactCard contact={message.contactCard} />;
  }

  const src = media.available && media.url ? apiUrl(media.url) : null;
  if (media.kind === "document") return <DocumentMedia media={media} src={src} />;
  if (!src) return <MediaPlaceholder media={media} />;

  switch (media.kind) {
    case "image":
      return <ImageMedia media={media} src={src} />;
    case "sticker":
      return (
        <img
          src={src}
          alt="Figurinha"
          loading="lazy"
          className="block size-32 object-contain"
        />
      );
    case "video":
      return (
        <video
          controls
          preload="metadata"
          src={src}
          className="block max-h-[280px] w-[280px] max-w-full rounded-lg bg-fg/90"
        />
      );
    case "audio":
    case "voice":
      return <AudioMedia media={media} src={src} />;
    default:
      return <MediaPlaceholder media={media} />;
  }
}

/** Bloco da mensagem citada (resposta), acima do texto. */
export function QuotedMessage({
  replyTo,
  outbound,
  onJump,
}: {
  replyTo: NonNullable<DeskMessage["replyTo"]>;
  outbound: boolean;
  onJump?: (id: string) => void;
}) {
  const jumpTo = replyTo.id;
  const content = (
    <span className="line-clamp-2 whitespace-pre-wrap break-words">
      {replyTo.text ?? "Mensagem"}
    </span>
  );
  const className = cn(
    "mb-1.5 block w-full rounded-md border-l-2 border-accent-500 px-2 py-1 text-left text-xs text-fg-muted",
    outbound ? "bg-surface/60" : "bg-subtle",
  );
  if (jumpTo && onJump) {
    return (
      <button
        type="button"
        className={cn(className, "transition-colors hover:text-fg")}
        onClick={() => onJump(jumpTo)}
        aria-label="Ir para a mensagem citada"
      >
        {content}
      </button>
    );
  }
  return <div className={className}>{content}</div>;
}

const ACK_LABEL: Record<DeskDeliveryAck, string> = {
  pending: "Enviando",
  sent: "Enviada",
  delivered: "Entregue",
  read: "Lida",
};

/** ✓ enviada, ✓✓ entregue, ✓✓ em destaque = lida. */
export function DeliveryTicks({ ack }: { ack: DeskDeliveryAck }) {
  const label = ACK_LABEL[ack];
  const Icon = ack === "pending" ? Clock : ack === "sent" ? Check : CheckCheck;
  return (
    <span title={label} aria-label={label} role="img" className="inline-flex">
      <Icon
        className={cn(
          ack === "pending" ? "size-3" : "size-3.5",
          ack === "read" ? "text-accent-600" : "text-fg-faint",
        )}
        aria-hidden
      />
    </span>
  );
}
