import { ChannelStatus, ChannelType } from "@prisma/client";
import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../prisma";
import * as waha from "../../services/waha";

// ============================================================================
// Schemas de validação
// ============================================================================

const createChannelSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  operationId: z.uuid("operationId inválido"),
  agentId: z.uuid("agentId inválido").optional(),
  webhookUrl: z.string().url("webhookUrl inválida").optional(),
});

const channelParamsSchema = z.object({
  id: z.uuid("ID inválido"),
});

// ============================================================================
// Routes
// ============================================================================

export async function channelsRoutes(app: FastifyInstance) {
  /**
   * POST /channels/whatsapp
   * Cria um novo canal WhatsApp e inicia sessão no WAHA
   */
  app.post("/whatsapp", async (request, reply) => {
    const body = createChannelSchema.parse(request.body);

    // Verifica se a operation existe
    const operation = await prisma.operation.findUnique({
      where: { id: body.operationId },
    });

    if (!operation) {
      return reply.status(404).send({ error: "Operation não encontrada" });
    }

    // Verifica se o agent existe (se fornecido)
    if (body.agentId) {
      const agent = await prisma.agent.findUnique({
        where: { id: body.agentId },
      });
      if (!agent) {
        return reply.status(404).send({ error: "Agent não encontrado" });
      }
    }

    // Gera nome único para sessão WAHA
    const sessionName = `channel-${Date.now()}`;

    // Cria o canal no banco
    const channel = await prisma.channel.create({
      data: {
        name: body.name,
        type: ChannelType.WHATSAPP,
        status: ChannelStatus.PENDING,
        operationId: body.operationId,
        agentId: body.agentId,
        whatsappDetails: {
          create: {
            sessionName,
            webhookUrl: body.webhookUrl,
          },
        },
      },
      include: {
        whatsappDetails: true,
      },
    });

    try {
      // Cria sessão no WAHA
      const wahaSession = await waha.createSession({
        name: sessionName,
        start: true,
        config: {
          webhooks: body.webhookUrl
            ? [
                {
                  url: body.webhookUrl,
                  events: ["message", "session.status"],
                },
              ]
            : undefined,
        },
      });

      // Atualiza status baseado na resposta do WAHA
      const newStatus = mapWahaStatusToChannelStatus(wahaSession.status);

      await prisma.channel.update({
        where: { id: channel.id },
        data: { status: newStatus },
      });

      return reply.status(201).send({
        channel: {
          ...channel,
          status: newStatus,
        },
        wahaSession: {
          name: wahaSession.name,
          status: wahaSession.status,
        },
      });
    } catch (error) {
      // Se falhar no WAHA, marca como FAILED mas mantém o canal
      await prisma.channel.update({
        where: { id: channel.id },
        data: { status: ChannelStatus.FAILED },
      });

      const errorMessage =
        error instanceof Error ? error.message : "Erro desconhecido";

      return reply.status(500).send({
        error: "Falha ao criar sessão no WAHA",
        details: errorMessage,
        channel: {
          ...channel,
          status: ChannelStatus.FAILED,
        },
      });
    }
  });

  /**
   * GET /channels/:id/qr
   * Obtém o QR code para autenticação do WhatsApp
   */
  app.get("/:id/qr", async (request, reply) => {
    const { id } = channelParamsSchema.parse(request.params);

    const channel = await prisma.channel.findUnique({
      where: { id },
      include: { whatsappDetails: true },
    });

    if (!channel) {
      return reply.status(404).send({ error: "Canal não encontrado" });
    }

    if (channel.type !== ChannelType.WHATSAPP) {
      return reply.status(400).send({ error: "Canal não é do tipo WhatsApp" });
    }

    if (!channel.whatsappDetails) {
      return reply
        .status(500)
        .send({ error: "Detalhes do WhatsApp não encontrados" });
    }

    try {
      const qr = await waha.getQRCode(
        channel.whatsappDetails.sessionName,
        "image"
      );

      return reply.send({
        channelId: channel.id,
        qrCode: qr.data, // Base64 da imagem
        qrValue: qr.value, // String para gerar QR se preferir
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Erro desconhecido";

      // Pode ser que a sessão já esteja autenticada
      if (
        errorMessage.includes("authenticated") ||
        errorMessage.includes("WORKING")
      ) {
        return reply.status(400).send({
          error: "Sessão já está autenticada",
          status: "WORKING",
        });
      }

      return reply.status(500).send({
        error: "Falha ao obter QR code",
        details: errorMessage,
      });
    }
  });

  /**
   * GET /channels/:id/status
   * Verifica o status atual do canal/sessão
   */
  app.get("/:id/status", async (request, reply) => {
    const { id } = channelParamsSchema.parse(request.params);

    const channel = await prisma.channel.findUnique({
      where: { id },
      include: { whatsappDetails: true },
    });

    if (!channel) {
      return reply.status(404).send({ error: "Canal não encontrado" });
    }

    if (channel.type !== ChannelType.WHATSAPP || !channel.whatsappDetails) {
      return reply.send({
        channelId: channel.id,
        type: channel.type,
        status: channel.status,
      });
    }

    try {
      const wahaSession = await waha.getSession(
        channel.whatsappDetails.sessionName
      );
      const newStatus = mapWahaStatusToChannelStatus(wahaSession.status);

      // Atualiza o status no banco se mudou
      if (channel.status !== newStatus) {
        await prisma.channel.update({
          where: { id: channel.id },
          data: {
            status: newStatus,
            // Salva o número do WhatsApp quando conectar
            externalIdentifier:
              wahaSession.me?.id?.split("@")[0] || channel.externalIdentifier,
          },
        });
      }

      return reply.send({
        channelId: channel.id,
        type: channel.type,
        status: newStatus,
        wahaStatus: wahaSession.status,
        phoneNumber: wahaSession.me?.id?.split("@")[0],
        pushName: wahaSession.me?.pushName,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Erro desconhecido";

      return reply.send({
        channelId: channel.id,
        type: channel.type,
        status: channel.status,
        error: errorMessage,
      });
    }
  });

  /**
   * POST /channels/:id/reconnect
   * Tenta reconectar uma sessão que falhou
   */
  app.post("/:id/reconnect", async (request, reply) => {
    const { id } = channelParamsSchema.parse(request.params);

    const channel = await prisma.channel.findUnique({
      where: { id },
      include: { whatsappDetails: true },
    });

    if (!channel) {
      return reply.status(404).send({ error: "Canal não encontrado" });
    }

    if (channel.type !== ChannelType.WHATSAPP || !channel.whatsappDetails) {
      return reply.status(400).send({ error: "Canal não é do tipo WhatsApp" });
    }

    try {
      // Tenta parar e iniciar a sessão
      try {
        await waha.stopSession(channel.whatsappDetails.sessionName);
      } catch {
        // Ignora erro se já estiver parada
      }

      const wahaSession = await waha.startSession(
        channel.whatsappDetails.sessionName
      );
      const newStatus = mapWahaStatusToChannelStatus(wahaSession.status);

      await prisma.channel.update({
        where: { id: channel.id },
        data: { status: newStatus },
      });

      return reply.send({
        channelId: channel.id,
        status: newStatus,
        wahaStatus: wahaSession.status,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Erro desconhecido";

      await prisma.channel.update({
        where: { id: channel.id },
        data: { status: ChannelStatus.FAILED },
      });

      return reply.status(500).send({
        error: "Falha ao reconectar",
        details: errorMessage,
      });
    }
  });

  /**
   * DELETE /channels/:id
   * Remove um canal e sua sessão WAHA
   */
  app.delete("/:id", async (request, reply) => {
    const { id } = channelParamsSchema.parse(request.params);

    const channel = await prisma.channel.findUnique({
      where: { id },
      include: { whatsappDetails: true },
    });

    if (!channel) {
      return reply.status(404).send({ error: "Canal não encontrado" });
    }

    // Se for WhatsApp, remove a sessão do WAHA primeiro
    if (channel.type === ChannelType.WHATSAPP && channel.whatsappDetails) {
      try {
        await waha.deleteSession(channel.whatsappDetails.sessionName);
      } catch {
        // Ignora erro se sessão não existir no WAHA
      }
    }

    // Remove o canal (cascade remove whatsappDetails)
    await prisma.channel.delete({
      where: { id: channel.id },
    });

    return reply.status(204).send();
  });

  /**
   * GET /channels
   * Lista todos os canais (com filtros opcionais)
   */
  app.get("/", async (request, reply) => {
    const querySchema = z.object({
      operationId: z.uuid().optional(),
      agentId: z.uuid().optional(),
      type: z.enum(ChannelType).optional(),
      status: z.enum(ChannelStatus).optional(),
    });

    const query = querySchema.parse(request.query);

    const channels = await prisma.channel.findMany({
      where: {
        operationId: query.operationId,
        agentId: query.agentId,
        type: query.type,
        status: query.status,
      },
      include: {
        whatsappDetails: true,
        operation: { select: { id: true, name: true } },
        agent: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return reply.send({ channels });
  });
}

// ============================================================================
// Helpers
// ============================================================================

function mapWahaStatusToChannelStatus(
  wahaStatus: waha.WAHASessionStatus
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
