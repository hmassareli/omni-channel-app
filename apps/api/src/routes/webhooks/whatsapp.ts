import { ChannelType } from "@prisma/client";
import { FastifyInstance } from "fastify";
import { getChannelAdapter } from "../../channels/registry";
import { handleWhatsappAck } from "../../channels/whatsapp-waha/ack";
import {
  handleIgnoredWhatsappEvent,
  handleWhatsappMessage,
  handleWhatsappStatus,
} from "../../channels/whatsapp-waha/inbound";
import { InvalidWebhookPayloadError } from "../../channels/whatsapp-waha/parse";
import { webhookAuthMiddleware } from "../../middleware/webhook-auth";

const webhookDebugEnabled =
  process.env.WHATSAPP_WEBHOOK_DEBUG?.toLowerCase() === "true";

function logWebhookRouteDebug(stage: string, details: Record<string, unknown>) {
  if (!webhookDebugEnabled) {
    return;
  }

  console.log(
    `[WebhookDebug] route:${stage} ${JSON.stringify(details, null, 2)}`,
  );
}

export async function registerWhatsappWebhookRoutes(app: FastifyInstance) {
  /**
   * POST /webhooks/whatsapp
   * Webhook principal - recebe mensagens e eventos do WAHA.
   * O adaptador normaliza o payload; o núcleo de conversas persiste.
   */
  app.post(
    "/whatsapp",
    { preHandler: webhookAuthMiddleware },
    async (request, reply) => {
      const body = request.body as Record<string, unknown>;

      logWebhookRouteDebug("received", {
        body,
        bodyKeys: Object.keys(body ?? {}),
        event: typeof body?.event === "string" ? body.event : null,
      });

      const adapter = getChannelAdapter(ChannelType.WHATSAPP);

      let events;
      try {
        events = adapter.parseWebhook(body);
      } catch (error) {
        if (error instanceof InvalidWebhookPayloadError) {
          app.log.warn({ body, error: error.details }, error.message);
          return reply.status(400).send({ error: error.message });
        }
        throw error;
      }

      const event = events[0];

      if (!event) {
        return reply.status(202).send({ skipped: true, reason: "no-events" });
      }

      if (event.kind === "status") {
        await handleWhatsappStatus(event);
        return reply
          .status(202)
          .send({ processed: true, event: "session.status" });
      }

      if (event.kind === "ack") {
        const { updated } = await handleWhatsappAck(event);
        return reply.status(202).send({ processed: true, event: "message.ack", updated });
      }

      if (event.kind === "ignored") {
        const skipped = await handleIgnoredWhatsappEvent(event, body);
        return reply.status(202).send(skipped);
      }

      const result = await handleWhatsappMessage(event, body);

      logWebhookRouteDebug("message-result", { result });

      if ("reason" in result) {
        return reply.status(202).send({
          skipped: true,
          reason: result.reason,
        });
      }

      return reply.status(202).send({
        conversationId: result.conversationId,
        messageId: result.messageId,
      });
    },
  );
}
