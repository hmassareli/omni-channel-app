import { Plus, Target } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "../../../components/layout/PageHeader";
import {
  Button,
  EmptyState,
  ErrorState,
  Select,
  Skeleton,
} from "../../../components/ui";
import { cn } from "../../../lib/cn";
import { formatCurrency } from "../../../lib/format";
import { useOperation } from "../../operations/hooks";
import { CreateOpportunityDialog } from "../components/CreateOpportunityDialog";
import { KanbanBoard } from "../components/kanban/KanbanBoard";
import type { FeedbackState } from "../components/kanban/kanbanUtils";
import { useStageEditor } from "../components/kanban/useStageEditor";
import { useKanban, useStages } from "../hooks";

function Stat({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="rounded-md border border-line bg-surface px-3 py-1.5 text-sm text-fg-muted">
      <strong className="font-semibold text-fg">{value}</strong> {label}
    </div>
  );
}

export function OpportunitiesPage() {
  const kanbanQuery = useKanban();
  const stagesQuery = useStages();
  const operationQuery = useOperation();

  const [showCreate, setShowCreate] = useState(false);
  const [filterStage, setFilterStage] = useState("");
  const [feedback, setFeedback] = useState<FeedbackState>(null);

  const stages = stagesQuery.data ?? [];
  const operationId = operationQuery.data?.id ?? stages[0]?.operationId ?? null;

  const stageEditor = useStageEditor({
    operationId,
    onFeedback: setFeedback,
    onStageDeleted: (stageId) => {
      if (filterStage === stageId) setFilterStage("");
    },
  });

  const columns = kanbanQuery.data?.columns ?? [];
  const totalOpportunities = columns.reduce((sum, c) => sum + c.count, 0);
  const totalValue = columns.reduce(
    (sum, c) =>
      sum +
      c.opportunities.reduce((s, o) => s + Number(o.estimatedValue ?? 0), 0),
    0,
  );
  const visibleCount = filterStage
    ? columns.filter((c) => c.stage.id === filterStage).length
    : columns.length;

  return (
    <>
      <PageHeader
        title="Oportunidades"
        description={
          kanbanQuery.data
            ? `${totalOpportunities} oportunidades em ${columns.length} estágios`
            : undefined
        }
        actions={
          <>
            <Select
              aria-label="Filtrar por coluna"
              value={filterStage}
              onChange={(e) => setFilterStage(e.target.value)}
              className="w-48"
            >
              <option value="">Todas as colunas</option>
              {stages.map((stage) => (
                <option key={stage.id} value={stage.id}>
                  {stage.name}
                </option>
              ))}
            </Select>
            <Button variant="secondary" onClick={stageEditor.openCreate}>
              Nova coluna
            </Button>
            <Button icon={<Plus />} onClick={() => setShowCreate(true)}>
              Nova oportunidade
            </Button>
          </>
        }
      />

      {kanbanQuery.data && (
        <div className="flex flex-wrap gap-2 px-8 pt-4">
          <Stat value={totalOpportunities} label="cards ativos" />
          <Stat value={formatCurrency(totalValue, { maximumFractionDigits: 0 })} label="em aberto" />
          <Stat value={visibleCount} label="colunas visíveis" />
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col p-8 pt-4">
        {feedback && (
          <div
            role="status"
            className={cn(
              "mb-4 rounded-md border px-4 py-2.5 text-sm",
              feedback.type === "error"
                ? "border-danger-100 bg-danger-50 text-danger-700"
                : "border-success-100 bg-success-50 text-success-700",
            )}
          >
            {feedback.text}
          </div>
        )}

        {kanbanQuery.isPending ? (
          <div className="flex gap-3">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-96 w-72 shrink-0" />
            ))}
          </div>
        ) : kanbanQuery.isError ? (
          <ErrorState
            error={kanbanQuery.error}
            onRetry={() => kanbanQuery.refetch()}
            title="Não foi possível carregar o pipeline"
          />
        ) : columns.length === 0 ? (
          <EmptyState
            icon={Target}
            title="Nenhuma oportunidade encontrada"
            description="Crie uma coluna para começar a montar o pipeline."
            action={
              <div className="flex gap-2">
                <Button variant="secondary" onClick={stageEditor.openCreate}>
                  Criar coluna
                </Button>
                <Button onClick={() => setShowCreate(true)}>
                  Nova oportunidade
                </Button>
              </div>
            }
          />
        ) : (
          <KanbanBoard
            serverColumns={columns}
            visibleStageId={filterStage}
            operationId={operationId}
            stageEditor={stageEditor}
            onError={(text) => setFeedback({ type: "error", text })}
          />
        )}
      </div>

      <CreateOpportunityDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
      />
    </>
  );
}
