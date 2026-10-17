import type { BadgeTone } from "../../components/ui";
import type { ChannelHealthResponse, ChannelStatus } from "../../lib/api";

export interface ChannelStatusMeta {
  label: string;
  tone: BadgeTone;
  /** Mensagens não chegam: canal parado ou com falha. */
  down: boolean;
}

/** Rótulo e cor do status; o status ao vivo do WAHA (se houver) refina o do banco. */
export function channelStatusMeta(
  status: ChannelStatus,
  wahaStatus?: ChannelHealthResponse["wahaStatus"],
): ChannelStatusMeta {
  if (wahaStatus === "SCAN_QR_CODE") return { label: "Aguardando QR", tone: "warning", down: false };
  if (wahaStatus === "NOT_FOUND") return { label: "Desconectado", tone: "danger", down: true };
  switch (status) {
    case "WORKING":
      return { label: "Conectado", tone: "success", down: false };
    case "CONNECTING":
      return { label: "Conectando", tone: "warning", down: false };
    case "PENDING":
      return { label: "Aguardando QR", tone: "warning", down: false };
    case "STOPPED":
      return { label: "Desconectado", tone: "danger", down: true };
    case "FAILED":
    default:
      return { label: "Falhou", tone: "danger", down: true };
  }
}

/** Canal parado/falho (ou nunca conectado e sem sessão). */
export const isChannelDown = (status: ChannelStatus) => status === "STOPPED" || status === "FAILED";

/** Sem mensagem recebida há mais que isso com o canal conectado = alerta. */
export const STALE_INBOUND_MS = 24 * 60 * 60 * 1000;

export function formatChannelPhone(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  const m = digits.match(/^(\d{2})(\d{2})(\d{4,5})(\d{4})$/);
  return m ? `+${m[1]} (${m[2]}) ${m[3]}-${m[4]}` : `+${digits}`;
}
