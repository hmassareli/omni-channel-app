import { prisma } from "../../prisma";
import * as waha from "./waha";

function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

export function resolveWhatsappWebhookUrl(explicitWebhookUrl?: string | null) {
  if (explicitWebhookUrl?.trim()) {
    return explicitWebhookUrl.trim();
  }

  const publicUrl = process.env.APP_PUBLIC_URL?.trim();
  if (!publicUrl) {
    return null;
  }

  return `${normalizeBaseUrl(publicUrl)}/webhooks/whatsapp`;
}

export async function ensureWhatsappSessionWebhook(
  sessionName: string,
  webhookUrl?: string | null,
) {
  const resolvedWebhookUrl = resolveWhatsappWebhookUrl(webhookUrl);

  if (!resolvedWebhookUrl) {
    return null;
  }

  await waha.configureWebhooks(sessionName, resolvedWebhookUrl, [
    "message.any",
    "session.status",
  ]);

  return resolvedWebhookUrl;
}

/**
 * Reaplica a configuração de webhook (URL + segredo) em todas as sessões WAHA.
 * Chamado no boot para que mudanças de WEBHOOK_SECRET/APP_PUBLIC_URL valham
 * sem esperar a sessão reconectar. Falhas são só logadas.
 */
export async function reconfigureAllWhatsappWebhooks(): Promise<void> {
  if (!resolveWhatsappWebhookUrl()) return;

  const sessions = await prisma.whatsAppChannel.findMany({
    where: { channel: { status: { in: ["WORKING", "CONNECTING"] } } },
    select: { sessionName: true, webhookUrl: true },
  });

  for (const session of sessions) {
    try {
      await ensureWhatsappSessionWebhook(session.sessionName, session.webhookUrl);
    } catch (error) {
      console.error(
        `[Webhook] Falha ao reconfigurar sessão ${session.sessionName}:`,
        error instanceof Error ? error.message : error,
      );
    }
  }
}
