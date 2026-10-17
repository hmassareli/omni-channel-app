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

/** O webhook configurado na sessão entrega os eventos do app, com o segredo (se houver). */
export function isSessionWebhookOk(
  session: waha.WAHASession,
  storedWebhookUrl: string | null,
): boolean | undefined {
  const expected = resolveWhatsappWebhookUrl(storedWebhookUrl);
  if (!expected) return undefined;
  const secret = process.env.WEBHOOK_SECRET;
  return (session.config?.webhooks ?? []).some((hook) => {
    if (hook.url !== expected) return false;
    const events = hook.events ?? [];
    const hasMessages = events.includes("message.any") || events.includes("message");
    if (!hasMessages || !events.includes("session.status") || !events.includes("message.ack")) {
      return false; // sessão antiga sem ack: será reconfigurada
    }
    if (!secret) return true;
    const header = (hook.customHeaders ?? []).find(
      (h) => h.name.toLowerCase() === "x-webhook-secret",
    );
    // Algumas versões do WAHA podem omitir o valor; o nome do header já basta.
    return !!header && (header.value === undefined || header.value === secret);
  });
}

/**
 * Garante o webhook da sessão. Só grava se a config atual estiver errada: no WAHA
 * atual, o PUT da sessão a reinicia (e o WORKING seguinte chamaria isto de novo).
 */
export async function ensureWhatsappSessionWebhook(
  sessionName: string,
  webhookUrl?: string | null,
) {
  const resolvedWebhookUrl = resolveWhatsappWebhookUrl(webhookUrl);

  if (!resolvedWebhookUrl) {
    return null;
  }

  const current = await waha.getSession(sessionName).catch(() => null);
  if (current && isSessionWebhookOk(current, webhookUrl ?? null)) {
    return resolvedWebhookUrl;
  }

  await waha.configureWebhooks(sessionName, resolvedWebhookUrl, waha.WAHA_WEBHOOK_EVENTS);

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
