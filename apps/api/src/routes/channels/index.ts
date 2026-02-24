import { ChannelStatus, ChannelType } from "@prisma/client";
import { FastifyInstance } from "fastify";
import { z } from "zod";
import { authMiddleware } from "../../middleware/auth";
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
  app.post(
    "/whatsapp",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const user = request.user!;
      const body = createChannelSchema.parse(request.body);

      // Valida que está criando na sua própria operation
      if (!user.operationId) {
        return reply
          .status(403)
          .send({ error: "Usuário sem operation vinculada" });
      }

      if (body.operationId !== user.operationId) {
        return reply.status(403).send({ error: "Acesso negado" });
      }

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

        console.error("[Channels] Erro ao criar sessão WAHA:", error);

        return reply.status(500).send({
          error: "Falha ao criar sessão no WAHA",
          channel: {
            ...channel,
            status: ChannelStatus.FAILED,
          },
        });
      }
    },
  );

  /**
   * GET /channels/:id/qr
   * Obtém o QR code para autenticação do WhatsApp
   */
  app.get("/:id/qr", { preHandler: authMiddleware }, async (request, reply) => {
    const user = request.user!;
    const { id } = channelParamsSchema.parse(request.params);

    const channel = await prisma.channel.findUnique({
      where: { id },
      include: { whatsappDetails: true },
    });

    if (!channel) {
      return reply.status(404).send({ error: "Canal não encontrado" });
    }

    // Valida que o canal pertence à operation do usuário
    if (channel.operationId !== user.operationId) {
      return reply.status(403).send({ error: "Acesso negado" });
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
        "image",
      );

      return reply.send({
        channelId: channel.id,
        qrCode: qr.data, // Base64 da imagem
        qrValue: qr.value, // String para gerar QR se preferir
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Erro desconhecido";

      console.error("[Channels] Erro ao obter QR:", error);

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
      });
    }
  });

  /**
   * GET /channels/:id/status
   * Verifica o status atual do canal/sessão
   */
  app.get(
    "/:id/status",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const user = request.user!;
      const { id } = channelParamsSchema.parse(request.params);

      const channel = await prisma.channel.findUnique({
        where: { id },
        include: { whatsappDetails: true },
      });

      if (!channel) {
        return reply.status(404).send({ error: "Canal não encontrado" });
      }

      // Valida que o canal pertence à operation do usuário
      if (channel.operationId !== user.operationId) {
        return reply.status(403).send({ error: "Acesso negado" });
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
          channel.whatsappDetails.sessionName,
        );
        const newStatus = mapWahaStatusToChannelStatus(wahaSession.status);
        const phoneNumber = wahaSession.me?.id?.split("@")[0];

        // Atualiza o status no banco se mudou
        if (channel.status !== newStatus || phoneNumber) {
          try {
            await prisma.channel.update({
              where: { id: channel.id },
              data: {
                status: newStatus,
                // Salva o número do WhatsApp quando conectar
                externalIdentifier: phoneNumber || channel.externalIdentifier,
              },
            });
          } catch (updateError) {
            // Se falhar por constraint única, o mesmo número já está em outro channel
            if (
              updateError instanceof Error &&
              updateError.message.includes("externalIdentifier")
            ) {
              console.warn(
                `[Channels] Número ${phoneNumber} já está em uso por outro channel`,
              );
            } else {
              throw updateError;
            }
          }
        }

        return reply.send({
          channelId: channel.id,
          type: channel.type,
          status: newStatus,
          wahaStatus: wahaSession.status,
          phoneNumber,
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
    },
  );

  /**
   * POST /channels/:id/reconnect
   * Tenta reconectar uma sessão que falhou
   */
  app.post(
    "/:id/reconnect",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const user = request.user!;
      const { id } = channelParamsSchema.parse(request.params);

      const channel = await prisma.channel.findUnique({
        where: { id },
        include: { whatsappDetails: true },
      });

      if (!channel) {
        return reply.status(404).send({ error: "Canal não encontrado" });
      }

      // Valida que o canal pertence à operation do usuário
      if (channel.operationId !== user.operationId) {
        return reply.status(403).send({ error: "Acesso negado" });
      }

      if (channel.type !== ChannelType.WHATSAPP || !channel.whatsappDetails) {
        return reply
          .status(400)
          .send({ error: "Canal não é do tipo WhatsApp" });
      }

      try {
        // Tenta parar e iniciar a sessão
        try {
          await waha.stopSession(channel.whatsappDetails.sessionName);
        } catch {
          // Ignora erro se já estiver parada
        }

        const wahaSession = await waha.startSession(
          channel.whatsappDetails.sessionName,
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
        console.error("[Channels] Erro ao reconectar:", error);

        await prisma.channel.update({
          where: { id: channel.id },
          data: { status: ChannelStatus.FAILED },
        });

        return reply.status(500).send({
          error: "Falha ao reconectar",
        });
      }
    },
  );

  /**
   * DELETE /channels/:id
   * Remove um canal e sua sessão WAHA
   */
  app.delete("/:id", { preHandler: authMiddleware }, async (request, reply) => {
    const user = request.user!;
    const { id } = channelParamsSchema.parse(request.params);

    const channel = await prisma.channel.findUnique({
      where: { id },
      include: { whatsappDetails: true },
    });

    if (!channel) {
      return reply.status(404).send({ error: "Canal não encontrado" });
    }

    // Valida que o canal pertence à operation do usuário
    if (channel.operationId !== user.operationId) {
      return reply.status(403).send({ error: "Acesso negado" });
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
   * Lista todos os canais da operation do usuário (com filtros opcionais)
   */
  app.get("/", { preHandler: authMiddleware }, async (request, reply) => {
    const user = request.user!;
    const querySchema = z.object({
      agentId: z.uuid().optional(),
      type: z.enum(ChannelType).optional(),
      status: z.enum(ChannelStatus).optional(),
    });

    const query = querySchema.parse(request.query);

    if (!user.operationId) {
      return reply.send({ channels: [] });
    }

    const channels = await prisma.channel.findMany({
      where: {
        operationId: user.operationId, // Sempre filtra pela operation do usuário
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

  /**
   * GET /channels/:id/chats
   * Lista os chats disponíveis do WhatsApp (WAHA) para vincular a contatos
   */
  app.get(
    "/:id/chats",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const user = request.user!;
      const { id } = channelParamsSchema.parse(request.params);

      const querySchema = z.object({
        search: z.string().optional(),
        limit: z.coerce.number().min(1).max(200).optional().default(50),
        offset: z.coerce.number().min(0).optional().default(0),
      });
      const query = querySchema.parse(request.query);

      const channel = await prisma.channel.findUnique({
        where: { id },
        include: { whatsappDetails: true },
      });

      if (!channel) {
        return reply.status(404).send({ error: "Canal não encontrado" });
      }

      if (channel.operationId !== user.operationId) {
        return reply.status(403).send({ error: "Acesso negado" });
      }

      if (!channel.whatsappDetails?.sessionName) {
        return reply
          .status(400)
          .send({ error: "Canal sem sessão WhatsApp configurada" });
      }

      try {
        const sessionName = channel.whatsappDetails.sessionName;
        const batchSize = query.limit * 2;

        const firstBatch = await waha.getChatsOverview({ sessionName, limit: batchSize, offset: query.offset });

        // LID → telefone: extraído do _data.Info.RecipientAlt das próprias mensagens
        const lidToPhone = new Map<string, string>();

        // Classifica chats em @c.us (diretos) e @lid (pra enriquecer)
        const directChats: waha.WAHAChatOverview[] = [];
        const lidChats: waha.WAHAChatOverview[] = [];
        let wahaOffset = query.offset;
        let wahaHasMore = true;

        const classifyBatch = (batch: waha.WAHAChatOverview[]) => {
          wahaHasMore = batch.length >= batchSize;
          wahaOffset += batch.length;
          for (const chat of batch) {
            if (chat.id.endsWith("@c.us")) {
              directChats.push(chat);
              // Extrai mapeamento LID do _data da própria mensagem
              const recipAlt = chat.lastMessage?._data?.Info?.RecipientAlt;
              if (recipAlt?.endsWith("@lid")) {
                lidToPhone.set(recipAlt.replace(/@lid$/, ""), chat.id.replace("@c.us", ""));
              }
            } else if (chat.id.endsWith("@lid")) {
              lidChats.push(chat);
              // Extrai mapeamento phone do _data da própria mensagem
              const recipAlt = chat.lastMessage?._data?.Info?.RecipientAlt;
              if (recipAlt?.endsWith("@s.whatsapp.net")) {
                lidToPhone.set(chat.id.replace(/@lid$/, ""), recipAlt.replace(/@s\.whatsapp\.net$/, ""));
              }
            }
          }
        };

        classifyBatch(firstBatch);

        // Busca mais batches até preencher o limit
        for (let i = 0; i < 5 && directChats.length < query.limit && wahaHasMore; i++) {
          const batch = await waha.getChatsOverview({ sessionName, limit: batchSize, offset: wahaOffset });
          classifyBatch(batch);
        }
        // Trunca ao limit pedido
        directChats.length = Math.min(directChats.length, query.limit);

        // Enriquece lastMessage dos @c.us com o @lid correspondente (se mais recente)
        if (lidChats.length > 0) {
          const phoneToLastMsg = new Map<string, waha.WAHAChatOverview["lastMessage"]>();
          for (const lid of lidChats) {
            if (!lid.lastMessage) continue;
            const phone = lidToPhone.get(lid.id.replace(/@lid$/, ""));
            if (!phone) continue;
            const prev = phoneToLastMsg.get(phone);
            if (!prev || lid.lastMessage.timestamp > prev.timestamp) {
              phoneToLastMsg.set(phone, lid.lastMessage);
            }
          }
          for (const chat of directChats) {
            const lidMsg = phoneToLastMsg.get(chat.id.replace("@c.us", ""));
            if (lidMsg && (!chat.lastMessage || lidMsg.timestamp > chat.lastMessage.timestamp)) {
              chat.lastMessage = lidMsg;
            }
          }
        }

        // Busca quais chats já estão vinculados a contatos (pelo número do WhatsApp)
        const waIds = directChats.map((c) => c.id.replace("@c.us", ""));
        const existingIdentities = await prisma.identity.findMany({
          where: {
            type: "WHATSAPP",
            value: { in: waIds },
          },
          include: {
            contact: {
              include: {
                company: { select: { id: true, name: true, alias: true } },
              },
            },
          },
        });

        const identityMap = new Map(
          existingIdentities.map((i) => [i.value, i]),
        );

        // Monta resposta com info de vínculo
        const result = directChats.map((chat) => {
          const waId = chat.id.replace("@c.us", "");
          const identity = identityMap.get(waId);

          return {
            waId,
            chatId: chat.id,
            name: chat.name,
            picture: chat.picture,
            lastMessage: chat.lastMessage
              ? {
                  body: chat.lastMessage.body,
                  timestamp: chat.lastMessage.timestamp,
                  fromMe: chat.lastMessage.fromMe,
                }
              : null,
            linked: !!identity,
            linkedToCompany: !!identity?.contact?.companyId,
            contact: identity
              ? {
                  id: identity.contact.id,
                  name: identity.contact.name,
                  company: identity.contact.company,
                }
              : null,
          };
        });

        // Filtra por busca se fornecido
        let filtered = result;
        if (query.search) {
          const searchLower = query.search.toLowerCase();
          filtered = result.filter(
            (chat) =>
              chat.name?.toLowerCase().includes(searchLower) ||
              chat.waId.includes(query.search!),
          );
        }

        const hasMore = wahaHasMore || directChats.length >= query.limit;

        return reply.send({
          chats: filtered,
          pagination: {
            offset: query.offset,
            limit: query.limit,
            hasMore,
            totalFetched: wahaOffset - query.offset,
          },
        });
      } catch (error) {
        console.error("[Channels] Erro ao buscar chats:", error);
        return reply.status(500).send({
          error: "Erro ao buscar chats do WhatsApp",
          details: error instanceof Error ? error.message : "Erro desconhecido",
        });
      }
    },
  );
}

// ============================================================================
// Helpers
// ============================================================================

function mapWahaStatusToChannelStatus(
  wahaStatus: waha.WAHASessionStatus,
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
