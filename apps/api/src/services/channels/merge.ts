import { ChannelStatus, type Conversation, type Prisma } from "@prisma/client";
import { emitDeskEvent } from "../../events/bus";
import { prisma } from "../../prisma";

export interface ChannelMergeResult {
  /** Conversas que passaram para o canal novo como estavam. */
  moved: number;
  /** Conversas unidas a uma conversa do mesmo contato que já existia no canal novo. */
  merged: number;
  /** Mensagens repetidas descartadas (mesmo id externo nos dois canais). */
  duplicates: number;
}

function minDate(a: Date | null, b: Date | null): Date | null {
  if (!a) return b;
  if (!b) return a;
  return a < b ? a : b;
}

/**
 * Une a conversa `source` em `target` (mesmo contato): mensagens e timeline passam
 * para `target`, repetidas são descartadas, e `source` é apagada.
 */
async function mergeConversation(
  tx: Prisma.TransactionClient,
  source: Conversation & { csat: { id: string } | null },
  target: Conversation & { csat: { id: string } | null },
  resetDesk: boolean,
): Promise<number> {
  const sourceExternalIds = (
    await tx.message.findMany({
      where: { conversationId: source.id, externalId: { not: null } },
      select: { externalId: true },
    })
  ).map((m) => m.externalId as string);

  let duplicateIds: string[] = [];
  if (sourceExternalIds.length > 0) {
    const existing = await tx.message.findMany({
      where: { conversationId: target.id, externalId: { in: sourceExternalIds } },
      select: { externalId: true },
    });
    if (existing.length > 0) {
      duplicateIds = (
        await tx.message.findMany({
          where: { conversationId: source.id, externalId: { in: existing.map((m) => m.externalId as string) } },
          select: { id: true },
        })
      ).map((m) => m.id);
    }
  }

  if (duplicateIds.length > 0) {
    const dupSet = new Set(duplicateIds);
    const events = await tx.timelineEvent.findMany({
      where: { conversationId: source.id },
      select: { id: true, metadata: true },
    });
    const dupEvents = events
      .filter((e) => {
        const messageId = (e.metadata as { whatsapp?: { messageId?: unknown } } | null)?.whatsapp?.messageId;
        return typeof messageId === "string" && dupSet.has(messageId);
      })
      .map((e) => e.id);
    if (dupEvents.length > 0) await tx.timelineEvent.deleteMany({ where: { id: { in: dupEvents } } });
    await tx.message.deleteMany({ where: { id: { in: duplicateIds } } });
  }

  await tx.message.updateMany({ where: { conversationId: source.id }, data: { conversationId: target.id } });
  await tx.timelineEvent.updateMany({ where: { conversationId: source.id }, data: { conversationId: target.id } });
  if (source.csat && !target.csat) {
    await tx.csatResponse.update({ where: { id: source.csat.id }, data: { conversationId: target.id } });
  }

  // Estado de atendimento vem da conversa mais recente; métricas de "primeiro" da mais antiga.
  const newer = source.lastMessageAt > target.lastMessageAt ? source : target;
  const older = source.firstMessageAt < target.firstMessageAt ? source : target;
  await tx.conversation.update({
    where: { id: target.id },
    data: {
      firstMessageAt: older.firstMessageAt,
      lastMessageAt: newer.lastMessageAt,
      firstInboundMessageAt: minDate(source.firstInboundMessageAt, target.firstInboundMessageAt),
      firstOutboundMessageAt: minDate(source.firstOutboundMessageAt, target.firstOutboundMessageAt),
      firstResponseAt: minDate(source.firstResponseAt, target.firstResponseAt),
      isStartedByContact: older.isStartedByContact,
      timeToFirstInteraction: older.timeToFirstInteraction,
      unreadCount: source.unreadCount + target.unreadCount,
      needsAnalysis: true,
      status: newer.status,
      resolvedAt: newer.resolvedAt,
      csatRequestedAt: newer.csatRequestedAt,
      queueId: resetDesk && newer === source ? null : newer.queueId,
      assignedAgentId: resetDesk && newer === source ? null : newer.assignedAgentId,
    },
  });
  await tx.conversation.delete({ where: { id: source.id } });
  return duplicateIds.length;
}

/**
 * Passa o histórico do canal `sourceId` para `targetId` e deixa `sourceId` como registro:
 * arquivado, sem número, apontando para quem o substituiu. Usado quando o mesmo número
 * é conectado num canal novo, para o histórico nunca ficar preso no canal antigo.
 */
export async function mergeChannelInto(sourceId: string, targetId: string): Promise<ChannelMergeResult> {
  if (sourceId === targetId) throw new Error("Canal de origem e destino são o mesmo");

  const result = await prisma.$transaction(
    async (tx) => {
      const [source, target] = await Promise.all([
        tx.channel.findUniqueOrThrow({ where: { id: sourceId } }),
        tx.channel.findUniqueOrThrow({ where: { id: targetId } }),
      ]);
      // Fila e atendente pertencem à operação: não valem em outra.
      const resetDesk = source.operationId !== target.operationId;

      const conversations = await tx.conversation.findMany({
        where: { channelId: sourceId },
        include: { csat: { select: { id: true } } },
        orderBy: { lastMessageAt: "desc" },
      });

      const stats: ChannelMergeResult = { moved: 0, merged: 0, duplicates: 0 };
      for (const conversation of conversations) {
        const existing = await tx.conversation.findFirst({
          where: { channelId: targetId, contactId: conversation.contactId },
          include: { csat: { select: { id: true } } },
          orderBy: { lastMessageAt: "desc" },
        });
        if (existing) {
          stats.duplicates += await mergeConversation(tx, conversation, existing, resetDesk);
          stats.merged += 1;
        } else {
          await tx.conversation.update({
            where: { id: conversation.id },
            data: {
              channelId: targetId,
              ...(resetDesk ? { queueId: null, assignedAgentId: null } : {}),
            },
          });
          stats.moved += 1;
        }
      }

      const now = new Date();
      await tx.channel.update({
        where: { id: sourceId },
        data: {
          externalIdentifier: null,
          status: ChannelStatus.STOPPED,
          archivedAt: source.archivedAt ?? now,
          replacedById: targetId,
          replacedAt: now,
        },
      });
      // A sessão do canal antigo não recebe mais nada; o registro WAHA dele sai.
      await tx.whatsAppChannel.deleteMany({ where: { channelId: sourceId } });

      return { stats, sourceOperationId: source.operationId, targetOperationId: target.operationId };
    },
    { timeout: 300_000, maxWait: 10_000 },
  );

  for (const operationId of new Set([result.sourceOperationId, result.targetOperationId])) {
    if (!operationId) continue;
    emitDeskEvent({ type: "channel.updated", operationId, channelId: targetId });
  }
  console.log(
    `[Channels] Canal ${sourceId} absorvido por ${targetId}: ${result.stats.moved} conversas movidas, ` +
      `${result.stats.merged} unidas, ${result.stats.duplicates} mensagens repetidas descartadas`,
  );
  return result.stats;
}
