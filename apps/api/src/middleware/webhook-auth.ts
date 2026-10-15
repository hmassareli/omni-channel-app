import { timingSafeEqual } from "crypto";
import { FastifyReply, FastifyRequest } from "fastify";
import { config } from "../config";

export const WEBHOOK_SECRET_HEADER = "x-webhook-secret";

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Autentica webhooks de canais por segredo compartilhado.
 * Em produção, sem WEBHOOK_SECRET configurado o webhook fica fechado.
 */
export async function webhookAuthMiddleware(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const secret = config.webhookSecret;

  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      return reply.status(503).send({ error: "Webhook não configurado" });
    }
    return; // dev local: aceita sem segredo
  }

  const received = request.headers[WEBHOOK_SECRET_HEADER];
  if (typeof received !== "string" || !safeEqual(received, secret)) {
    return reply.status(401).send({ error: "Webhook não autorizado" });
  }
}
