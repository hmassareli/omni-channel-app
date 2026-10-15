import { useQuery } from "@tanstack/react-query";
import { BarChart3, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "../../../components/layout/PageHeader";
import {
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  ErrorState,
  Skeleton,
  Tabs,
} from "../../../components/ui";
import * as api from "../../../lib/api";
import { formatDuration } from "../../../lib/format";
import { inboxKeys } from "../../inbox/hooks";
import { useMe } from "../../operations/hooks";
import { VolumeChart } from "../components/VolumeChart";

type Period = "today" | "7d" | "30d";

const PERIODS: Array<{ id: Period; label: string }> = [
  { id: "today", label: "Hoje" },
  { id: "7d", label: "7 dias" },
  { id: "30d", label: "30 dias" },
];

function periodRange(period: Period): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  if (period === "7d") from.setDate(from.getDate() - 6);
  if (period === "30d") from.setDate(from.getDate() - 29);
  return { from: from.toISOString(), to: to.toISOString() };
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-medium text-fg-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight text-fg">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-fg-faint">{hint}</p>}
    </Card>
  );
}

function csatText(v: number | null | undefined) {
  return v === null || v === undefined ? "—" : v.toFixed(1).replace(".", ",");
}

function Th({ children, right }: { children: string; right?: boolean }) {
  return (
    <th className={`px-4 py-2 text-xs font-medium text-fg-muted ${right ? "text-right" : "text-left"}`}>
      {children}
    </th>
  );
}

function Content({ data }: { data: api.DeskMetricsResponse }) {
  const { totals } = data;
  const hasVolume = data.volumeByDay.some((d) => d.inbound + d.outbound > 0);
  return (
    <div className="space-y-6 p-8">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Abertas" value={String(totals.open)} />
        <Kpi label="Pendentes" value={String(totals.pending)} />
        <Kpi label="Sem responsável" value={String(totals.unassigned)} />
        <Kpi label="1ª resposta média" value={formatDuration(data.firstResponseAvgSeconds)} />
        <Kpi label="Resolução média" value={formatDuration(data.resolutionAvgSeconds)} />
        <Kpi
          label="CSAT médio"
          value={csatText(data.csat.avg)}
          hint={`${data.csat.count} ${data.csat.count === 1 ? "avaliação" : "avaliações"}`}
        />
      </div>

      <Card>
        <CardHeader title="Volume de mensagens por dia" />
        <CardBody>
          {hasVolume ? (
            <VolumeChart data={data.volumeByDay} />
          ) : (
            <EmptyState icon={BarChart3} title="Sem mensagens no período" className="py-10" />
          )}
        </CardBody>
      </Card>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Produtividade por atendente" />
          {data.byAgent.length === 0 ? (
            <EmptyState title="Sem atendimentos no período" className="py-10" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-line">
                  <tr>
                    <Th>Atendente</Th>
                    <Th right>Atendidas</Th>
                    <Th right>Resolvidas</Th>
                    <Th right>1ª resposta</Th>
                    <Th right>CSAT</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.byAgent.map((a) => (
                    <tr key={a.agentId} className="border-b border-line last:border-b-0">
                      <td className="px-4 py-2 font-medium text-fg">{a.name}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{a.handled}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{a.resolved}</td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {formatDuration(a.firstResponseAvgSeconds)}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">{csatText(a.csatAvg)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="Por fila" />
          {data.byQueue.length === 0 ? (
            <EmptyState title="Nenhuma fila criada" className="py-10" />
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-line">
                <tr>
                  <Th>Fila</Th>
                  <Th right>Abertas</Th>
                  <Th right>Pendentes</Th>
                </tr>
              </thead>
              <tbody>
                {data.byQueue.map((q) => (
                  <tr key={q.queueId} className="border-b border-line last:border-b-0">
                    <td className="px-4 py-2 font-medium text-fg">{q.name}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{q.open}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{q.pending}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6 p-8" role="status" aria-label="Carregando métricas">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-72" />
      <Skeleton className="h-48" />
    </div>
  );
}

export default function DashboardPage() {
  const me = useMe();
  const [period, setPeriod] = useState<Period>("7d");
  const allowed = me.data?.role === "ADMIN" || me.data?.role === "MANAGER";

  const metrics = useQuery({
    queryKey: [...inboxKeys.metrics, period],
    queryFn: () => {
      const { from, to } = periodRange(period);
      return api.getDeskMetrics(from, to);
    },
    enabled: allowed,
  });

  const header = (
    <PageHeader
      title="Dashboard"
      description="Desempenho da mesa de atendimento"
      actions={
        allowed ? (
          <Tabs<Period> tabs={PERIODS} value={period} onChange={setPeriod} idPrefix="period" className="border-b-0" />
        ) : undefined
      }
    />
  );

  if (me.isPending) return <>{header}<DashboardSkeleton /></>;
  if (me.isError) {
    return <>{header}<ErrorState error={me.error} onRetry={() => me.refetch()} /></>;
  }
  if (!allowed) {
    return (
      <>
        {header}
        <EmptyState
          icon={ShieldAlert}
          title="Acesso restrito"
          description="O dashboard está disponível apenas para administradores e gerentes."
        />
      </>
    );
  }
  return (
    <>
      {header}
      {metrics.isPending ? (
        <DashboardSkeleton />
      ) : metrics.isError ? (
        <ErrorState error={metrics.error} onRetry={() => metrics.refetch()} />
      ) : (
        <Content data={metrics.data} />
      )}
    </>
  );
}
