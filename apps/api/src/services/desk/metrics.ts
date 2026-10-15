import { Prisma } from "@prisma/client";
import { prisma } from "../../prisma";

export interface DeskMetrics {
  totals: { open: number; pending: number; resolved: number; unassigned: number };
  firstResponseAvgSeconds: number | null;
  resolutionAvgSeconds: number | null;
  csat: { avg: number | null; count: number };
  byAgent: Array<{
    agentId: string;
    name: string;
    handled: number;
    resolved: number;
    firstResponseAvgSeconds: number | null;
    csatAvg: number | null;
  }>;
  byQueue: Array<{ queueId: string; name: string; open: number; pending: number }>;
  volumeByDay: Array<{ date: string; inbound: number; outbound: number }>;
}

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

/**
 * Métricas da mesa. Totais/filas são o retrato atual; os demais indicadores
 * consideram o período [from, to] (padrão: últimos 30 dias).
 * Tudo agregado no banco.
 */
export async function getDeskMetrics(
  operationId: string,
  range: { from?: Date; to?: Date } = {},
): Promise<DeskMetrics> {
  const to = range.to ?? new Date();
  const from = range.from ?? new Date(to.getTime() - 30 * 24 * 3600 * 1000);

  // Conversas da operação (sempre filtradas por operationId via canal).
  const base = Prisma.sql`
    FROM "omni_conversations" c
    JOIN "omni_channels" ch ON ch."id" = c."channelId"
    WHERE ch."operationId" = ${operationId}`;

  const [totalsRows, general, csatRows, agentRows, agentCsatRows, queueRows, volumeRows, agents] =
    await Promise.all([
      prisma.$queryRaw<
        Array<{ open: number; pending: number; resolved: number; unassigned: number }>
      >`
        SELECT
          COUNT(*) FILTER (WHERE c."status" = 'OPEN')::int AS open,
          COUNT(*) FILTER (WHERE c."status" = 'PENDING')::int AS pending,
          COUNT(*) FILTER (WHERE c."status" = 'RESOLVED')::int AS resolved,
          COUNT(*) FILTER (WHERE c."assignedAgentId" IS NULL AND c."status" <> 'RESOLVED')::int AS unassigned
        ${base}`,
      prisma.$queryRaw<Array<{ fr: number | null; res: number | null }>>`
        SELECT
          AVG(c."timeToFirstInteraction") FILTER (
            WHERE c."firstResponseAt" >= ${from} AND c."firstResponseAt" <= ${to}
          )::float8 AS fr,
          AVG(EXTRACT(EPOCH FROM (c."resolvedAt" - c."firstMessageAt"))) FILTER (
            WHERE c."status" = 'RESOLVED' AND c."resolvedAt" >= ${from} AND c."resolvedAt" <= ${to}
          )::float8 AS res
        ${base}`,
      prisma.$queryRaw<Array<{ avg: number | null; count: number }>>`
        SELECT AVG(r."score")::float8 AS avg, COUNT(r."id")::int AS count
        FROM "omni_csat_responses" r
        JOIN "omni_conversations" c ON c."id" = r."conversationId"
        JOIN "omni_channels" ch ON ch."id" = c."channelId"
        WHERE ch."operationId" = ${operationId}
          AND r."createdAt" >= ${from} AND r."createdAt" <= ${to}`,
      prisma.$queryRaw<
        Array<{ agentId: string; handled: number; resolved: number; fr: number | null }>
      >`
        SELECT c."assignedAgentId" AS "agentId",
          COUNT(*) FILTER (WHERE c."lastMessageAt" >= ${from} AND c."lastMessageAt" <= ${to})::int AS handled,
          COUNT(*) FILTER (
            WHERE c."status" = 'RESOLVED' AND c."resolvedAt" >= ${from} AND c."resolvedAt" <= ${to}
          )::int AS resolved,
          AVG(c."timeToFirstInteraction") FILTER (
            WHERE c."firstResponseAt" >= ${from} AND c."firstResponseAt" <= ${to}
          )::float8 AS fr
        ${base} AND c."assignedAgentId" IS NOT NULL
        GROUP BY c."assignedAgentId"`,
      prisma.$queryRaw<Array<{ agentId: string; avg: number }>>`
        SELECT c."assignedAgentId" AS "agentId", AVG(r."score")::float8 AS avg
        FROM "omni_csat_responses" r
        JOIN "omni_conversations" c ON c."id" = r."conversationId"
        JOIN "omni_channels" ch ON ch."id" = c."channelId"
        WHERE ch."operationId" = ${operationId}
          AND c."assignedAgentId" IS NOT NULL
          AND r."createdAt" >= ${from} AND r."createdAt" <= ${to}
        GROUP BY c."assignedAgentId"`,
      prisma.$queryRaw<Array<{ queueId: string; open: number; pending: number }>>`
        SELECT c."queueId" AS "queueId",
          COUNT(*) FILTER (WHERE c."status" = 'OPEN')::int AS open,
          COUNT(*) FILTER (WHERE c."status" = 'PENDING')::int AS pending
        ${base} AND c."queueId" IS NOT NULL
        GROUP BY c."queueId"`,
      prisma.$queryRaw<Array<{ date: string; inbound: number; outbound: number }>>`
        SELECT to_char(date_trunc('day', m."sentAt" AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS date,
          COUNT(*) FILTER (WHERE m."direction" = 'INBOUND')::int AS inbound,
          COUNT(*) FILTER (WHERE m."direction" = 'OUTBOUND')::int AS outbound
        FROM "omni_messages" m
        JOIN "omni_conversations" c ON c."id" = m."conversationId"
        JOIN "omni_channels" ch ON ch."id" = c."channelId"
        WHERE ch."operationId" = ${operationId}
          AND m."sentAt" >= ${from} AND m."sentAt" <= ${to}
        GROUP BY 1
        ORDER BY 1`,
      prisma.agent.findMany({
        where: { operationId },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
    ]);

  const queues = await prisma.queue.findMany({
    where: { operationId },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const t = totalsRows[0];
  const agentStats = new Map(agentRows.map((r) => [r.agentId, r]));
  const agentCsat = new Map(agentCsatRows.map((r) => [r.agentId, r.avg]));
  const queueStats = new Map(queueRows.map((r) => [r.queueId, r]));

  return {
    totals: {
      open: t?.open ?? 0,
      pending: t?.pending ?? 0,
      resolved: t?.resolved ?? 0,
      unassigned: t?.unassigned ?? 0,
    },
    firstResponseAvgSeconds: num(general[0]?.fr),
    resolutionAvgSeconds: num(general[0]?.res),
    csat: { avg: num(csatRows[0]?.avg), count: csatRows[0]?.count ?? 0 },
    byAgent: agents.map((a) => {
      const s = agentStats.get(a.id);
      return {
        agentId: a.id,
        name: a.name,
        handled: s?.handled ?? 0,
        resolved: s?.resolved ?? 0,
        firstResponseAvgSeconds: num(s?.fr),
        csatAvg: num(agentCsat.get(a.id)),
      };
    }),
    byQueue: queues.map((q) => ({
      queueId: q.id,
      name: q.name,
      open: queueStats.get(q.id)?.open ?? 0,
      pending: queueStats.get(q.id)?.pending ?? 0,
    })),
    volumeByDay: volumeRows,
  };
}
