import { Building2, DollarSign, MessageSquare, User } from "lucide-react";
import type { ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { PageHeader } from "../../../components/layout/PageHeader";
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Skeleton,
} from "../../../components/ui";
import { formatCNPJ, formatCurrency } from "../../../lib/format";
import { TimelineView } from "../../timeline/components/TimelineView";
import { isMessageEvent } from "../../timeline/groupEvents";
import { OpportunitySidebar } from "../components/OpportunitySidebar";
import { PipelineSteps } from "../components/PipelineSteps";
import {
  useMoveOpportunity,
  useOpportunity,
  useOpportunityTimeline,
  useStages,
} from "../hooks";

function StatCard({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
}) {
  return (
    <Card className="p-4">
      <div className="mb-2 flex items-center gap-2 text-xs font-medium text-fg-muted [&_svg]:size-4">
        {icon}
        {label}
      </div>
      <p className="text-2xl font-semibold tracking-tight text-fg">{value}</p>
    </Card>
  );
}

export function OpportunityPage() {
  const { id } = useParams<{ id: string }>();
  const opportunityQuery = useOpportunity(id);
  const timelineQuery = useOpportunityTimeline(id);
  const stagesQuery = useStages();
  const move = useMoveOpportunity();

  if (opportunityQuery.isPending || stagesQuery.isPending) {
    return (
      <div className="space-y-6 p-8">
        <Skeleton className="h-16" />
        <div className="grid grid-cols-12 gap-6">
          <Skeleton className="col-span-3 h-96" />
          <Skeleton className="col-span-9 h-96" />
        </div>
      </div>
    );
  }

  if (opportunityQuery.isError) {
    return (
      <ErrorState
        error={opportunityQuery.error}
        onRetry={() => opportunityQuery.refetch()}
        title="Não foi possível carregar a oportunidade"
      />
    );
  }

  const opportunity = opportunityQuery.data;
  if (!opportunity) {
    return (
      <EmptyState
        icon={Building2}
        title="Oportunidade não encontrada"
        action={
          <Link to="/opportunities">
            <Button variant="secondary">Voltar para oportunidades</Button>
          </Link>
        }
      />
    );
  }

  const company = opportunity.company;
  const timeline = timelineQuery.data;
  const contacts = timeline?.contacts ?? [];
  const events = timeline?.events ?? [];
  const messageCount = events.filter((e) => isMessageEvent(e.type)).length;

  const handleStageClick = (stageId: string) => {
    if (stageId === opportunity.stageId || move.isPending) return;
    move.mutate({ id: opportunity.id, stageId });
  };

  return (
    <>
      <PageHeader
        backTo="/opportunities"
        title={company.alias || company.name}
        description={`CNPJ: ${formatCNPJ(company.taxId)}`}
        leading={
          <span className="flex size-10 items-center justify-center rounded-lg bg-accent-50 text-accent-600">
            <Building2 className="size-5" />
          </span>
        }
      />
      <PipelineSteps
        stages={stagesQuery.data ?? []}
        currentStageId={opportunity.stageId}
        disabled={move.isPending}
        onStageClick={handleStageClick}
      />
      {move.isError && (
        <p className="border-b border-danger-100 bg-danger-50 px-8 py-2 text-sm text-danger-700">
          Não foi possível mover a oportunidade.
        </p>
      )}

      <div className="grid grid-cols-12 gap-6 p-8">
        <aside className="col-span-12 lg:col-span-4 xl:col-span-3">
          <OpportunitySidebar opportunity={opportunity} contacts={contacts} />
        </aside>

        <div className="col-span-12 space-y-6 lg:col-span-8 xl:col-span-9">
          <div>
            <div className="mb-4 flex items-center gap-2">
              <MessageSquare className="size-4 text-accent-600" />
              <h2 className="text-base font-semibold text-fg">Histórico 360°</h2>
              <span className="text-sm text-fg-faint">
                · {timeline?.pagination.total ?? 0} eventos
              </span>
            </div>
            {timelineQuery.isPending ? (
              <Skeleton className="h-64" />
            ) : timelineQuery.isError ? (
              <ErrorState
                error={timelineQuery.error}
                onRetry={() => timelineQuery.refetch()}
                title="Não foi possível carregar o histórico"
              />
            ) : (
              <TimelineView
                events={events}
                emptyDescription="Vincule contatos WhatsApp à empresa para ver o histórico."
              />
            )}
          </div>

          <div className="grid grid-cols-3 gap-4">
            <StatCard
              icon={<MessageSquare />}
              label="Mensagens"
              value={messageCount}
            />
            <StatCard icon={<User />} label="Contatos" value={contacts.length} />
            <StatCard
              icon={<DollarSign />}
              label="Valor"
              value={formatCurrency(Number(opportunity.estimatedValue) || null)}
            />
          </div>
        </div>
      </div>
    </>
  );
}
