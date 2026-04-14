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
    "message",
    "session.status",
  ]);

  return resolvedWebhookUrl;
}
