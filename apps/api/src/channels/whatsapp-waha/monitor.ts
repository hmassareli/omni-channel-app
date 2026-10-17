import { ChannelType } from "@prisma/client";
import { prisma } from "../../prisma";
import { checkWhatsappChannelHealth, type WhatsappChannelRecord } from "./health";

const DEFAULT_INTERVAL_MS = 3 * 60_000;

/** Verifica ao vivo todas as sessões WhatsApp com operação (atualiza status e emite channel.updated). */
export async function checkAllWhatsappChannels(): Promise<void> {
  const channels = await prisma.channel.findMany({
    where: {
      type: ChannelType.WHATSAPP,
      operationId: { not: null },
      archivedAt: null,
      whatsappDetails: { isNot: null },
    },
    include: { whatsappDetails: true },
  });
  for (const channel of channels) {
    try {
      await checkWhatsappChannelHealth(channel as WhatsappChannelRecord);
    } catch (error) {
      console.error(`[Monitor] Falha ao verificar canal ${channel.id}:`, error);
    }
  }
}

/**
 * Monitor periódico das sessões WhatsApp: sem ele, uma sessão que some do WAHA
 * (ex.: "Session not found") nunca manda session.status e o canal fica WORKING no banco.
 * Devolve a função que para o monitor.
 */
export function startWhatsappHealthMonitor(intervalMs = DEFAULT_INTERVAL_MS): () => void {
  if (!process.env.WAHA_API_URL) return () => undefined;
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await checkAllWhatsappChannels();
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => void tick(), intervalMs);
  timer.unref();
  void tick();
  return () => clearInterval(timer);
}
