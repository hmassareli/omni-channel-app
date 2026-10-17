import type { BadgeTone } from "../../components/ui";
import type {
  ConversationListItem,
  ConversationStatusValue,
  DeskMediaKind,
} from "../../lib/api";

export const STATUS_LABEL: Record<ConversationStatusValue, string> = {
  OPEN: "Aberta",
  PENDING: "Pendente",
  RESOLVED: "Resolvida",
};

export const STATUS_TONE: Record<ConversationStatusValue, BadgeTone> = {
  OPEN: "accent",
  PENDING: "warning",
  RESOLVED: "success",
};

export const CHANNEL_LABEL: Record<ConversationListItem["channel"]["type"], string> = {
  WHATSAPP: "WhatsApp",
  EMAIL: "E-mail",
  INSTAGRAM: "Instagram",
  SMS: "SMS",
  OTHER: "Outro",
};

/** Nome curto do tipo de mídia (prévia na lista e placeholders). */
export const MEDIA_LABEL: Record<DeskMediaKind, string> = {
  image: "Foto",
  sticker: "Figurinha",
  video: "Vídeo",
  audio: "Áudio",
  voice: "Áudio",
  document: "Documento",
  location: "Localização",
  contact: "Contato",
};
