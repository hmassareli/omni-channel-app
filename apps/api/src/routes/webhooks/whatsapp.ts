import { ChannelStatus } from "@prisma/client";
import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../prisma";
import {
  ingestWhatsappMessage,
  whatsappWebhookSchema,
} from "../../services/whatsapp-ingest";

const webhookResponseSchema = z.object({
  conversationId: z.string().optional(),
  messageId: z.string().optional(),
  skipped: z.boolean().optional(),
  reason: z.string().optional(),
});

// Schema para webhook de session.status do WAHA
const sessionStatusWebhookSchema = z.object({
  event: z.literal("session.status"),
  session: z.string(),
  me: z
    .object({
      id: z.string().optional(),
      pushName: z.string().optional(),
    })
    .optional(),
  payload: z.object({
    status: z.enum([
      "STOPPED",
      "STARTING",
      "SCAN_QR_CODE",
      "WORKING",
      "FAILED",
    ]),
  }),
});

export async function registerWhatsappWebhookRoutes(app: FastifyInstance) {
  /**
   * POST /webhooks/whatsapp
   * Webhook principal - recebe mensagens e eventos do WAHA
   */
  app.post("/whatsapp", async (request, reply) => {
    const body = request.body as Record<string, unknown>;

    // Verifica se é um evento de session.status
    if (body.event === "session.status") {
      const result = sessionStatusWebhookSchema.safeParse(body);

      if (!result.success) {
        app.log.warn(
          { body, error: result.error },
          "Invalid session.status payload"
        );
        return reply
          .status(400)
          .send({ error: "Invalid session.status payload" });
      }

      await handleSessionStatusWebhook(result.data);
      return reply
        .status(202)
        .send({ processed: true, event: "session.status" });
    }

    // Evento de mensagem
    const parseResult = whatsappWebhookSchema.safeParse(body);

    if (!parseResult.success) {
      app.log.warn(
        { body, error: parseResult.error },
        "Invalid message payload"
      );
      return reply.status(400).send({ error: "Invalid payload" });
    }

    const result = await ingestWhatsappMessage(parseResult.data);

    if (result.skipped) {
      return reply.status(202).send({
        skipped: true,
        reason: result.reason,
      });
    }

    return reply.status(202).send({
      conversationId: result.conversationId,
      messageId: result.messageId,
    });
  });
}

// ============================================================================
// Session Status Handler
// ============================================================================

async function handleSessionStatusWebhook(
  data: z.infer<typeof sessionStatusWebhookSchema>
): Promise<void> {
  const { session, payload, me } = data;

  // Encontra o canal pelo nome da sessão
  const whatsappChannel = await prisma.whatsAppChannel.findUnique({
    where: { sessionName: session },
    include: { channel: true },
  });

  if (!whatsappChannel) {
    console.log(`[Webhook] Sessão ${session} não encontrada no banco`);
    return;
  }

  // Mapeia status do WAHA para ChannelStatus
  const newStatus = mapWahaStatusToChannelStatus(payload.status);

  // Atualiza o canal
  await prisma.channel.update({
    where: { id: whatsappChannel.channelId },
    data: {
      status: newStatus,
      // Salva o número quando conectar
      externalIdentifier:
        me?.id?.split("@")[0] || whatsappChannel.channel.externalIdentifier,
    },
  });

  console.log(
    `[Webhook] Canal ${whatsappChannel.channel.name} atualizado: ${payload.status} -> ${newStatus}`
  );
}

function mapWahaStatusToChannelStatus(
  wahaStatus: "STOPPED" | "STARTING" | "SCAN_QR_CODE" | "WORKING" | "FAILED"
): ChannelStatus {
  switch (wahaStatus) {
    case "WORKING":
      return ChannelStatus.WORKING;
    case "STARTING":
    case "SCAN_QR_CODE":
      return ChannelStatus.CONNECTING;
    case "STOPPED":
      return ChannelStatus.STOPPED;
    case "FAILED":
    default:
      return ChannelStatus.FAILED;
  }
}
