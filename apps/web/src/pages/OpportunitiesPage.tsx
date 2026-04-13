import {
  closestCorners,
  DndContext,
  DragOverlay,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Check,
  GripVertical,
  MoreHorizontal,
  PenLine,
  Plus,
  Trash2,
  User,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import * as api from "../lib/api";

type KanbanColumns = Awaited<
  ReturnType<typeof api.getOpportunitiesKanban>
>["columns"];
type KanbanColumn = KanbanColumns[number];
type KanbanOpportunity = KanbanColumn["opportunities"][number];
type StageWithRelations = Awaited<ReturnType<typeof api.getStages>>[number];
type Company = Awaited<ReturnType<typeof api.getCompanies>>["companies"][number];
type StageEditorState = {
  mode: "create" | "edit";
  stageId?: string;
  name: string;
  color: string;
};
type FeedbackState = {
  type: "error" | "success";
  text: string;
} | null;

const OPPORTUNITY_PREFIX = "opportunity:";
const STAGE_PREFIX = "stage:";
const STAGE_DROP_PREFIX = "stage-drop:";
const DEFAULT_STAGE_COLOR = "#2563eb";
const STAGE_COLOR_PRESETS = [
  "#2563eb",
  "#0f766e",
  "#7c3aed",
  "#db2777",
  "#d97706",
  "#dc2626",
  "#4f46e5",
  "#475569",
];

function cloneKanbanColumns(columns: KanbanColumns): KanbanColumns {
  return columns.map((column) => ({
    ...column,
    stage: { ...column.stage },
    opportunities: [...column.opportunities],
  }));
}

function findOpportunityById(
  columns: KanbanColumns,
  opportunityId: string,
): KanbanOpportunity | null {
  for (const column of columns) {
    const opportunity = column.opportunities.find(
      (item) => item.id === opportunityId,
    );
    if (opportunity) {
      return opportunity;
    }
  }

  return null;
}

function findStageById(
  columns: KanbanColumns,
  stageId: string,
): KanbanColumn | null {
  return columns.find((column) => column.stage.id === stageId) ?? null;
}

function findStageIdForOpportunity(
  columns: KanbanColumns,
  opportunityId: string,
): string | null {
  for (const column of columns) {
    if (column.opportunities.some((item) => item.id === opportunityId)) {
      return column.stage.id;
    }
  }

  return null;
}

function moveOpportunityAcrossColumns(
  columns: KanbanColumns,
  opportunityId: string,
  fromStageId: string,
  toStageId: string,
  overOpportunityId: string | null,
): KanbanColumns {
  if (fromStageId === toStageId) {
    return columns;
  }

  let movedOpportunity: KanbanOpportunity | null = null;

  const withoutSourceOpportunity = columns.map((column) => {
    if (column.stage.id !== fromStageId) {
      return column;
    }

    const opportunities = column.opportunities.filter((item) => {
      if (item.id === opportunityId) {
        movedOpportunity = item;
        return false;
      }

      return true;
    });

    if (!movedOpportunity) {
      return column;
    }

    return {
      ...column,
      opportunities,
      count: opportunities.length,
    };
  });

  if (!movedOpportunity) {
    return columns;
  }

  return withoutSourceOpportunity.map((column) => {
    if (column.stage.id !== toStageId) {
      return column;
    }

    const opportunities = [...column.opportunities];
    const insertionIndex = overOpportunityId
      ? opportunities.findIndex((item) => item.id === overOpportunityId)
      : -1;

    opportunities.splice(
      insertionIndex >= 0 ? insertionIndex : opportunities.length,
      0,
      movedOpportunity,
    );

    return {
      ...column,
      opportunities,
      count: opportunities.length,
    };
  });
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatTaxId(value: string) {
  return value.replace(
    /(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/,
    "$1.$2.$3/$4-$5",
  );
}

function getOpportunitySortableId(opportunityId: string) {
  return `${OPPORTUNITY_PREFIX}${opportunityId}`;
}

function getStageSortableId(stageId: string) {
  return `${STAGE_PREFIX}${stageId}`;
}

function getStageDropId(stageId: string) {
  return `${STAGE_DROP_PREFIX}${stageId}`;
}

function getColumnCountLabel(count: number) {
  return `${count} ${count === 1 ? "card" : "cards"}`;
}

function getDragType(event: DragStartEvent | DragOverEvent | DragEndEvent) {
  return event.active.data.current?.type as "opportunity" | "stage" | undefined;
}

function StageEditor({
  title,
  subtitle,
  name,
  color,
  loading,
  submitLabel,
  onNameChange,
  onColorChange,
  onSubmit,
  onCancel,
}: {
  title: string;
  subtitle: string;
  name: string;
  color: string;
  loading: boolean;
  submitLabel: string;
  onNameChange: (value: string) => void;
  onColorChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-gray-800">{title}</p>
          <p className="mt-1 text-xs text-gray-500">{subtitle}</p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
          aria-label="Cancelar edicao da coluna"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
            Nome da coluna
          </span>
          <input
            value={name}
            onChange={(event) => onNameChange(event.target.value)}
            placeholder="Ex.: Negociacao"
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-800 outline-none transition focus:border-purple-500 focus:ring-2 focus:ring-purple-500"
          />
        </label>

        <div>
          <span className="mb-2 block text-xs font-medium uppercase tracking-wide text-gray-500">
            Cor
          </span>
          <div className="mb-3 flex flex-wrap gap-2">
            {STAGE_COLOR_PRESETS.map((preset) => {
              const isActive = preset.toLowerCase() === color.toLowerCase();

              return (
                <button
                  key={preset}
                  type="button"
                  onClick={() => onColorChange(preset)}
                  className={`h-8 w-8 rounded-full ring-offset-2 transition ${
                    isActive
                      ? "scale-105 ring-2 ring-purple-600"
                      : "ring-1 ring-gray-200 hover:scale-105"
                  }`}
                  style={{ backgroundColor: preset }}
                  aria-label={`Selecionar cor ${preset}`}
                />
              );
            })}
          </div>

          <input
            type="color"
            value={color}
            onChange={(event) => onColorChange(event.target.value)}
            className="h-10 w-full cursor-pointer rounded-lg border border-gray-300 bg-white p-1"
          />
        </div>
      </div>

      <div className="mt-4 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-3 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-100"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={loading || !name.trim()}
          className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Check className="h-4 w-4" />
          {loading ? "Salvando..." : submitLabel}
        </button>
      </div>
    </div>
  );
}

function OpportunityCardComponent({
  opportunity,
  stageColor,
  onClick,
  isDragging = false,
  isDragOverlay = false,
}: {
  opportunity: KanbanOpportunity;
  stageColor: string;
  onClick: () => void;
  isDragging?: boolean;
  isDragOverlay?: boolean;
}) {
  return (
    <div
      onClick={onClick}
      className={`cursor-pointer rounded-lg border border-gray-200 bg-white p-4 transition-[transform,box-shadow,border-color,opacity] duration-200 ${
        isDragOverlay
          ? "rotate-1 scale-[1.02] border-purple-300 shadow-xl"
          : "hover:border-purple-300 hover:shadow-md"
      } ${isDragging ? "opacity-45 shadow-sm" : "opacity-100"}`}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: stageColor }}
            />
            <span className="text-xs font-medium text-gray-500">Empresa</span>
          </div>
          <h4 className="text-sm font-semibold text-gray-800">
            {opportunity.company.alias || opportunity.company.name}
          </h4>
        </div>
        <button
          type="button"
          onClick={(event) => event.stopPropagation()}
          className="rounded-full p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
          aria-label="Mais acoes"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </div>

      <p className="mb-3 text-sm text-gray-500">{formatTaxId(opportunity.company.taxId)}</p>

      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-gray-500">
            Valor estimado
          </p>
          <p className="mt-1 text-sm font-semibold text-green-600">
            {opportunity.estimatedValue
              ? formatCurrency(Number(opportunity.estimatedValue))
              : "A definir"}
          </p>
        </div>

        {opportunity.agent ? (
          <div className="flex items-center gap-2 rounded-full bg-purple-50 px-2.5 py-1.5">
            <div className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-purple-100 text-purple-600">
              {opportunity.agent.avatarUrl ? (
                <img
                  src={opportunity.agent.avatarUrl}
                  alt={opportunity.agent.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <User className="h-3.5 w-3.5" />
              )}
            </div>
            <span className="text-xs font-medium text-gray-600">
              {opportunity.agent.name}
            </span>
          </div>
        ) : null}
      </div>

      {opportunity.notes ? (
        <p className="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-xs leading-5 text-gray-500">
          {opportunity.notes}
        </p>
      ) : null}
    </div>
  );
}

function SortableOpportunityCard({
  opportunity,
  stageId,
  stageColor,
  onClick,
  isSaving,
}: {
  opportunity: KanbanOpportunity;
  stageId: string;
  stageColor: string;
  onClick: () => void;
  isSaving: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: getOpportunitySortableId(opportunity.id),
    data: {
      type: "opportunity",
      opportunityId: opportunity.id,
      stageId,
    },
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={`mb-3 touch-none ${isSaving ? "pointer-events-none" : ""}`}
      {...attributes}
      {...listeners}
    >
      <OpportunityCardComponent
        opportunity={opportunity}
        stageColor={stageColor}
        onClick={onClick}
        isDragging={isDragging || isSaving}
      />
    </div>
  );
}

function KanbanStageColumn({
  kanbanStage,
  onOpportunityClick,
  onEditStage,
  onDeleteStage,
  isOver,
  isDragging,
  isSavingOpportunityId,
  isEditing,
  isBusy,
  stageEditor,
  onStageEditorNameChange,
  onStageEditorColorChange,
  onSubmitStageEditor,
  onCancelStageEditor,
  dragHandleProps,
}: {
  kanbanStage: KanbanColumn;
  onOpportunityClick: (opportunity: KanbanOpportunity) => void;
  onEditStage: (stage: KanbanColumn["stage"]) => void;
  onDeleteStage: (stage: KanbanColumn["stage"]) => void;
  isOver: boolean;
  isDragging: boolean;
  isSavingOpportunityId: string | null;
  isEditing: boolean;
  isBusy: boolean;
  stageEditor: StageEditorState | null;
  onStageEditorNameChange: (value: string) => void;
  onStageEditorColorChange: (value: string) => void;
  onSubmitStageEditor: () => void;
  onCancelStageEditor: () => void;
  dragHandleProps: Record<string, unknown>;
}) {
  const { setNodeRef } = useDroppable({
    id: getStageDropId(kanbanStage.stage.id),
    data: {
      type: "stage-drop",
      stageId: kanbanStage.stage.id,
    },
  });

  const headerColor = kanbanStage.stage.color || DEFAULT_STAGE_COLOR;

  return (
    <div
      className={`flex h-full min-h-0 w-80 shrink-0 flex-col rounded-xl border border-gray-200 bg-gray-100 p-3 transition ${
        isDragging ? "opacity-60" : "opacity-100"
      }`}
    >
      {isEditing && stageEditor ? (
        <StageEditor
          title="Editar coluna"
          subtitle="Atualize o nome e a cor da etapa sem sair do board."
          name={stageEditor.name}
          color={stageEditor.color}
          loading={isBusy}
          submitLabel="Salvar coluna"
          onNameChange={onStageEditorNameChange}
          onColorChange={onStageEditorColorChange}
          onSubmit={onSubmitStageEditor}
          onCancel={onCancelStageEditor}
        />
      ) : (
        <>
          <div
            className="mb-3 rounded-lg border border-gray-200 bg-white px-3 py-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="rounded p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
                    aria-label={`Arrastar coluna ${kanbanStage.stage.name}`}
                    {...dragHandleProps}
                  >
                    <GripVertical className="h-4 w-4" />
                  </button>
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: headerColor }}
                  />
                  <h3 className="truncate text-sm font-semibold text-gray-800">
                    {kanbanStage.stage.name}
                  </h3>
                </div>
                <p className="mt-2 text-xs text-gray-500">
                  {getColumnCountLabel(kanbanStage.count)}
                </p>
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => onEditStage(kanbanStage.stage)}
                  disabled={isBusy}
                  className="rounded p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-60"
                  aria-label={`Editar coluna ${kanbanStage.stage.name}`}
                >
                  <PenLine className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onDeleteStage(kanbanStage.stage)}
                  disabled={isBusy}
                  className="rounded p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-60"
                  aria-label={`Excluir coluna ${kanbanStage.stage.name}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          <div
            ref={setNodeRef}
            className={`flex min-h-55 flex-1 flex-col rounded-lg border p-2 transition-all duration-200 ${
              isOver
                ? "border-purple-300 bg-purple-50"
                : "border-transparent bg-gray-100"
            }`}
          >
            <SortableContext
              items={kanbanStage.opportunities.map((opportunity) =>
                getOpportunitySortableId(opportunity.id),
              )}
              strategy={verticalListSortingStrategy}
            >
              {kanbanStage.opportunities.map((opportunity) => (
                <SortableOpportunityCard
                  key={opportunity.id}
                  opportunity={opportunity}
                  stageId={kanbanStage.stage.id}
                  stageColor={headerColor}
                  isSaving={isSavingOpportunityId === opportunity.id}
                  onClick={() => onOpportunityClick(opportunity)}
                />
              ))}
            </SortableContext>

            {kanbanStage.opportunities.length === 0 ? (
              <div className="flex min-h-35 items-center justify-center rounded-lg border border-dashed border-gray-300 bg-white px-4 text-center text-sm text-gray-400">
                Solte uma oportunidade aqui
              </div>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}

function SortableKanbanStageColumn({
  kanbanStage,
  onOpportunityClick,
  onEditStage,
  onDeleteStage,
  isOver,
  isSavingOpportunityId,
  stageEditor,
  savingStageState,
  onStageEditorNameChange,
  onStageEditorColorChange,
  onSubmitStageEditor,
  onCancelStageEditor,
}: {
  kanbanStage: KanbanColumn;
  onOpportunityClick: (opportunity: KanbanOpportunity) => void;
  onEditStage: (stage: KanbanColumn["stage"]) => void;
  onDeleteStage: (stage: KanbanColumn["stage"]) => void;
  isOver: boolean;
  isSavingOpportunityId: string | null;
  stageEditor: StageEditorState | null;
  savingStageState: string | null;
  onStageEditorNameChange: (value: string) => void;
  onStageEditorColorChange: (value: string) => void;
  onSubmitStageEditor: () => void;
  onCancelStageEditor: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: getStageSortableId(kanbanStage.stage.id),
    data: {
      type: "stage",
      stageId: kanbanStage.stage.id,
    },
  });

  const isEditing =
    stageEditor?.mode === "edit" && stageEditor.stageId === kanbanStage.stage.id;
  const isBusy =
    savingStageState === kanbanStage.stage.id || savingStageState === "reorder";

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className="touch-none"
    >
      <KanbanStageColumn
        kanbanStage={kanbanStage}
        onOpportunityClick={onOpportunityClick}
        onEditStage={onEditStage}
        onDeleteStage={onDeleteStage}
        isOver={isOver}
        isDragging={isDragging}
        isSavingOpportunityId={isSavingOpportunityId}
        isEditing={isEditing}
        isBusy={isBusy}
        stageEditor={stageEditor}
        onStageEditorNameChange={onStageEditorNameChange}
        onStageEditorColorChange={onStageEditorColorChange}
        onSubmitStageEditor={onSubmitStageEditor}
        onCancelStageEditor={onCancelStageEditor}
        dragHandleProps={{ ...attributes, ...listeners }}
      />
    </div>
  );
}

const CreateOpportunityModal = ({
  isOpen,
  onClose,
  onCreated,
  companies,
  stages,
  agents,
}: {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => Promise<void> | void;
  companies: Company[];
  stages: StageWithRelations[];
  agents: api.AgentWithChannels[];
}) => {
  const [companyId, setCompanyId] = useState("");
  const [stageId, setStageId] = useState("");
  const [agentId, setAgentId] = useState("");
  const [estimatedValue, setEstimatedValue] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (stages.length > 0 && !stageId) {
      setStageId(stages[0].id);
    }
  }, [stages, stageId]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await api.createOpportunity({
        companyId,
        stageId,
        agentId: agentId || undefined,
        estimatedValue: estimatedValue ? parseFloat(estimatedValue) : undefined,
        notes: notes || undefined,
      });
      await onCreated();
      onClose();
      setCompanyId("");
      setAgentId("");
      setEstimatedValue("");
      setNotes("");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Erro ao criar oportunidade",
      );
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">Nova oportunidade</h2>
            <p className="mt-1 text-sm text-gray-500">
              Adicione um novo card ao pipeline comercial.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          {error ? (
            <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
              {error}
            </div>
          ) : null}

          <div className="mb-4">
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Empresa *
            </label>
            <select
              value={companyId}
              onChange={(event) => setCompanyId(event.target.value)}
              className="w-full rounded-lg border border-gray-300 px-4 py-2 outline-none transition focus:border-purple-500 focus:ring-2 focus:ring-purple-500"
              required
            >
              <option value="">Selecione uma empresa</option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.alias || company.name}
                </option>
              ))}
            </select>
          </div>

          <div className="mb-4">
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Estagio *
            </label>
            <select
              value={stageId}
              onChange={(event) => setStageId(event.target.value)}
              className="w-full rounded-lg border border-gray-300 px-4 py-2 outline-none transition focus:border-purple-500 focus:ring-2 focus:ring-purple-500"
              required
            >
              {stages.map((stage) => (
                <option key={stage.id} value={stage.id}>
                  {stage.name}
                </option>
              ))}
            </select>
          </div>

          <div className="mb-4">
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Responsavel
            </label>
            <select
              value={agentId}
              onChange={(event) => setAgentId(event.target.value)}
              className="w-full rounded-lg border border-gray-300 px-4 py-2 outline-none transition focus:border-purple-500 focus:ring-2 focus:ring-purple-500"
            >
              <option value="">Nenhum</option>
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
            </select>
          </div>

          <div className="mb-4">
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Valor estimado (R$)
            </label>
            <input
              type="number"
              value={estimatedValue}
              onChange={(event) => setEstimatedValue(event.target.value)}
              placeholder="0,00"
              step="0.01"
              min="0"
              className="w-full rounded-lg border border-gray-300 px-4 py-2 outline-none transition focus:border-purple-500 focus:ring-2 focus:ring-purple-500"
            />
          </div>

          <div className="mb-5">
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Observacoes
            </label>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Notas sobre a oportunidade..."
              className="w-full resize-none rounded-lg border border-gray-300 px-4 py-2 outline-none transition focus:border-purple-500 focus:ring-2 focus:ring-purple-500"
              rows={3}
            />
          </div>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              <Plus className="h-4 w-4" />
              {loading ? "Criando..." : "Criar oportunidade"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export function OpportunitiesPage() {
  const [kanbanData, setKanbanData] = useState<KanbanColumns>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [stages, setStages] = useState<StageWithRelations[]>([]);
  const [agents, setAgents] = useState<api.AgentWithChannels[]>([]);
  const [operationId, setOperationId] = useState<string | null>(null);
  const [filterStage, setFilterStage] = useState("");
  const [activeOpportunity, setActiveOpportunity] =
    useState<KanbanOpportunity | null>(null);
  const [activeStage, setActiveStage] = useState<KanbanColumn | null>(null);
  const [dragSnapshot, setDragSnapshot] = useState<KanbanColumns | null>(null);
  const [overStageId, setOverStageId] = useState<string | null>(null);
  const [savingOpportunityId, setSavingOpportunityId] = useState<string | null>(
    null,
  );
  const [savingStageState, setSavingStageState] = useState<string | null>(null);
  const [stageEditor, setStageEditor] = useState<StageEditorState | null>(null);
  const [feedback, setFeedback] = useState<FeedbackState>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6,
      },
    }),
  );

  const fetchData = useCallback(async () => {
    setLoading(true);
    const results = await Promise.allSettled([
      api.getOpportunitiesKanban(),
      api.getCompanies({ limit: 100 }),
      api.getStages(),
      api.getAgents(),
      api.getUserOperation(),
    ]);

    const [kanbanResult, companiesResult, stagesResult, agentsResult, operationResult] =
      results;

    if (kanbanResult.status === "fulfilled") {
      setKanbanData(kanbanResult.value.columns);
    } else {
      console.error("Erro ao buscar kanban:", kanbanResult.reason);
      setFeedback({
        type: "error",
        text: "Nao foi possivel carregar o pipeline de oportunidades.",
      });
    }

    if (companiesResult.status === "fulfilled") {
      setCompanies(companiesResult.value.companies);
    } else {
      console.error("Erro ao buscar empresas:", companiesResult.reason);
    }

    if (stagesResult.status === "fulfilled") {
      setStages(stagesResult.value);
      if (!operationId && stagesResult.value[0]?.operationId) {
        setOperationId(stagesResult.value[0].operationId);
      }
    } else {
      console.error("Erro ao buscar estagios:", stagesResult.reason);
    }

    if (agentsResult.status === "fulfilled") {
      setAgents(agentsResult.value);
    } else {
      console.error("Erro ao buscar agentes:", agentsResult.reason);
    }

    if (operationResult.status === "fulfilled") {
      setOperationId(operationResult.value?.id ?? null);
    } else {
      console.error("Erro ao buscar operation:", operationResult.reason);
    }

    setLoading(false);
  }, [operationId]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const handleOpportunityClick = (opportunity: KanbanOpportunity) => {
    window.location.href = `/opportunities/${opportunity.id}`;
  };

  const resetDragState = () => {
    setActiveOpportunity(null);
    setActiveStage(null);
    setDragSnapshot(null);
    setOverStageId(null);
  };

  const handleDragStart = (event: DragStartEvent) => {
    const dragType = getDragType(event);
    const snapshot = cloneKanbanColumns(kanbanData);
    setDragSnapshot(snapshot);

    if (dragType === "opportunity") {
      const opportunityId = event.active.data.current?.opportunityId as string;
      setActiveOpportunity(findOpportunityById(kanbanData, opportunityId));
      setOverStageId(findStageIdForOpportunity(kanbanData, opportunityId));
      return;
    }

    if (dragType === "stage") {
      const stageId = event.active.data.current?.stageId as string;
      setActiveStage(findStageById(kanbanData, stageId));
      setOverStageId(stageId);
    }
  };

  const handleDragOver = (event: DragOverEvent) => {
    if (getDragType(event) !== "opportunity") {
      return;
    }

    const opportunityId = event.active.data.current?.opportunityId as string;
    const fromStageId = findStageIdForOpportunity(kanbanData, opportunityId);
    const toStageId = (event.over?.data.current?.stageId as string | undefined) ?? null;
    const overOpportunityId =
      event.over?.data.current?.type === "opportunity"
        ? (event.over.data.current.opportunityId as string)
        : null;

    setOverStageId(toStageId);

    if (!fromStageId || !toStageId || fromStageId === toStageId) {
      return;
    }

    setKanbanData((currentColumns) =>
      moveOpportunityAcrossColumns(
        currentColumns,
        opportunityId,
        fromStageId,
        toStageId,
        overOpportunityId,
      ),
    );
  };

  const handleDragCancel = () => {
    if (dragSnapshot) {
      setKanbanData(dragSnapshot);
    }

    resetDragState();
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const dragType = getDragType(event);
    const snapshot = dragSnapshot;

    if (!snapshot) {
      resetDragState();
      return;
    }

    if (dragType === "stage") {
      const activeStageId = event.active.data.current?.stageId as string;
      const targetStageId = (event.over?.data.current?.stageId as string | undefined) ?? null;

      if (!targetStageId || activeStageId === targetStageId || !operationId) {
        setKanbanData(snapshot);
        resetDragState();
        return;
      }

      const oldIndex = kanbanData.findIndex(
        (column) => column.stage.id === activeStageId,
      );
      const newIndex = kanbanData.findIndex(
        (column) => column.stage.id === targetStageId,
      );

      if (oldIndex < 0 || newIndex < 0) {
        setKanbanData(snapshot);
        resetDragState();
        return;
      }

      const reorderedColumns = arrayMove(kanbanData, oldIndex, newIndex).map(
        (column, index) => ({
          ...column,
          stage: {
            ...column.stage,
            order: index,
          },
        }),
      );

      setKanbanData(reorderedColumns);
      setStages((currentStages) => {
        const reorderedIds = reorderedColumns.map((column) => column.stage.id);
        const sorted = [...currentStages].sort(
          (left, right) =>
            reorderedIds.indexOf(left.id) - reorderedIds.indexOf(right.id),
        );

        return sorted.map((stage, index) => ({
          ...stage,
          order: index,
        }));
      });
      setSavingStageState("reorder");

      try {
        await api.reorderStages(
          operationId,
          reorderedColumns.map((column) => column.stage.id),
        );
      } catch (error) {
        console.error("Erro ao reordenar estagios:", error);
        setKanbanData(snapshot);
        setFeedback({
          type: "error",
          text: "Nao foi possivel reordenar as colunas do kanban.",
        });
      } finally {
        setSavingStageState(null);
        resetDragState();
      }

      return;
    }

    const activeId = event.active.data.current?.opportunityId as string;
    const snapshotStageId = findStageIdForOpportunity(snapshot, activeId);
    const targetStageId = (event.over?.data.current?.stageId as string | undefined) ?? null;

    if (!targetStageId || !snapshotStageId) {
      setKanbanData(snapshot);
      resetDragState();
      return;
    }

    if (snapshotStageId === targetStageId) {
      setKanbanData(snapshot);
      resetDragState();
      return;
    }

    setSavingOpportunityId(activeId);

    try {
      await api.updateOpportunity(activeId, { stageId: targetStageId });
    } catch (error) {
      console.error("Erro ao mover oportunidade:", error);
      setKanbanData(snapshot);
      setFeedback({
        type: "error",
        text: "Nao foi possivel mover a oportunidade para a nova coluna.",
      });
    } finally {
      setSavingOpportunityId(null);
      resetDragState();
    }
  };

  const openCreateStageEditor = () => {
    setFeedback(null);
    setStageEditor({
      mode: "create",
      name: "",
      color: DEFAULT_STAGE_COLOR,
    });
  };

  const openEditStageEditor = (stage: KanbanColumn["stage"]) => {
    setFeedback(null);
    setStageEditor({
      mode: "edit",
      stageId: stage.id,
      name: stage.name,
      color: stage.color || DEFAULT_STAGE_COLOR,
    });
  };

  const handleStageEditorNameChange = (value: string) => {
    setStageEditor((current) =>
      current
        ? {
            ...current,
            name: value,
          }
        : current,
    );
  };

  const handleStageEditorColorChange = (value: string) => {
    setStageEditor((current) =>
      current
        ? {
            ...current,
            color: value,
          }
        : current,
    );
  };

  const handleCancelStageEditor = () => {
    setStageEditor(null);
  };

  const handleSubmitStageEditor = async () => {
    if (!stageEditor || !stageEditor.name.trim()) {
      return;
    }

    setFeedback(null);

    if (stageEditor.mode === "create") {
      if (!operationId) {
        setFeedback({
          type: "error",
          text: "Nao foi possivel identificar a operacao para criar a coluna.",
        });
        return;
      }

      setSavingStageState("create");

      try {
        await api.createStage({
          name: stageEditor.name.trim(),
          color: stageEditor.color,
          operationId,
        });
        setStageEditor(null);
        await fetchData();
        setFeedback({
          type: "success",
          text: "Nova coluna adicionada ao pipeline.",
        });
      } catch (error) {
        console.error("Erro ao criar estagio:", error);
        setFeedback({
          type: "error",
          text: "Nao foi possivel criar a nova coluna.",
        });
      } finally {
        setSavingStageState(null);
      }

      return;
    }

    if (!stageEditor.stageId) {
      return;
    }

    setSavingStageState(stageEditor.stageId);

    try {
      const updatedStage = await api.updateStage(stageEditor.stageId, {
        name: stageEditor.name.trim(),
        color: stageEditor.color,
      });

      setKanbanData((currentColumns) =>
        currentColumns.map((column) =>
          column.stage.id === updatedStage.id
            ? {
                ...column,
                stage: {
                  ...column.stage,
                  name: updatedStage.name,
                  color: updatedStage.color,
                  order: updatedStage.order,
                },
              }
            : column,
        ),
      );
      setStages((currentStages) =>
        currentStages.map((stage) =>
          stage.id === updatedStage.id ? { ...stage, ...updatedStage } : stage,
        ),
      );
      setStageEditor(null);
      setFeedback({
        type: "success",
        text: "Coluna atualizada com sucesso.",
      });
    } catch (error) {
      console.error("Erro ao atualizar estagio:", error);
      setFeedback({
        type: "error",
        text: "Nao foi possivel atualizar a coluna selecionada.",
      });
    } finally {
      setSavingStageState(null);
    }
  };

  const handleDeleteStage = async (stage: KanbanColumn["stage"]) => {
    const confirmed = window.confirm(
      `Excluir a coluna "${stage.name}"? Ela precisa estar vazia para ser removida.`,
    );

    if (!confirmed) {
      return;
    }

    setFeedback(null);
    setSavingStageState(stage.id);

    try {
      await api.deleteStage(stage.id);
      if (filterStage === stage.id) {
        setFilterStage("");
      }
      await fetchData();
      setFeedback({
        type: "success",
        text: "Coluna removida do kanban.",
      });
    } catch (error) {
      console.error("Erro ao excluir estagio:", error);
      setFeedback({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Nao foi possivel excluir a coluna selecionada.",
      });
    } finally {
      setSavingStageState(null);
    }
  };

  const filteredKanban = filterStage
    ? kanbanData.filter((column) => column.stage.id === filterStage)
    : kanbanData;

  const totalOpportunities = kanbanData.reduce(
    (total, column) => total + column.count,
    0,
  );
  const totalEstimatedValue = kanbanData.reduce(
    (total, column) =>
      total +
      column.opportunities.reduce(
        (columnTotal, opportunity) =>
          columnTotal + Number(opportunity.estimatedValue ?? 0),
        0,
      ),
    0,
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-800">Oportunidades</h1>
            <p className="text-gray-500 mt-1">
              {totalOpportunities} oportunidades em {kanbanData.length} estagios
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <select
              value={filterStage}
              onChange={(event) => setFilterStage(event.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none"
            >
              <option value="">Todas as colunas</option>
              {stages.map((stage) => (
                <option key={stage.id} value={stage.id}>
                  {stage.name}
                </option>
              ))}
            </select>

            <button
              onClick={openCreateStageEditor}
              className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-gray-700"
            >
              Nova coluna
            </button>

            <button
              onClick={() => setShowModal(true)}
              className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-2"
            >
              <Plus className="h-4 w-4" />
              Nova oportunidade
            </button>
          </div>
        </div>
      </header>

      <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
        <div className="flex flex-wrap gap-3 text-sm">
          <div className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-gray-600">
            <strong className="text-gray-800">{totalOpportunities}</strong> cards ativos
          </div>
          <div className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-gray-600">
            <strong className="text-gray-800">{formatCurrency(totalEstimatedValue)}</strong> em aberto
          </div>
          <div className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-gray-600">
            <strong className="text-gray-800">{filteredKanban.length}</strong> colunas visiveis
          </div>
        </div>
      </div>

      <main className="flex min-h-0 flex-1 flex-col overflow-hidden p-6">
        <div className="flex min-h-0 flex-1 flex-col">
          {feedback ? (
            <div
              className={`mb-4 rounded-lg border px-4 py-3 text-sm ${
                feedback.type === "error"
                  ? "border-red-200 bg-red-50 text-red-600"
                  : "border-green-200 bg-green-50 text-green-700"
              }`}
            >
              {feedback.text}
            </div>
          ) : null}

          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-center">
                <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-purple-600" />
                <p className="text-gray-500">Carregando oportunidades...</p>
              </div>
            </div>
          ) : filteredKanban.length === 0 ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-center">
                <p className="text-lg font-semibold text-gray-800">
                  Nenhuma oportunidade encontrada
                </p>
                <p className="mt-2 text-sm text-gray-500">
                  Ajuste o filtro ou crie uma nova coluna para comecar a montar o pipeline.
                </p>
                <div className="mt-5 flex items-center justify-center gap-3">
                  <button
                    onClick={openCreateStageEditor}
                    className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Criar coluna
                  </button>
                  <button
                    onClick={() => setShowModal(true)}
                    className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                  >
                    Nova oportunidade
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCorners}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragCancel={handleDragCancel}
              onDragEnd={handleDragEnd}
            >
              <div className="flex min-h-0 flex-1 overflow-x-auto overflow-y-hidden pb-2">
                <SortableContext
                  items={filteredKanban.map((column) => getStageSortableId(column.stage.id))}
                  strategy={horizontalListSortingStrategy}
                >
                  <div className="flex h-full items-stretch gap-4 pr-4">
                    {filteredKanban.map((kanbanStage) => (
                      <SortableKanbanStageColumn
                        key={kanbanStage.stage.id}
                        kanbanStage={kanbanStage}
                        isOver={overStageId === kanbanStage.stage.id}
                        isSavingOpportunityId={savingOpportunityId}
                        stageEditor={stageEditor}
                        savingStageState={savingStageState}
                        onOpportunityClick={handleOpportunityClick}
                        onEditStage={openEditStageEditor}
                        onDeleteStage={handleDeleteStage}
                        onStageEditorNameChange={handleStageEditorNameChange}
                        onStageEditorColorChange={handleStageEditorColorChange}
                        onSubmitStageEditor={handleSubmitStageEditor}
                        onCancelStageEditor={handleCancelStageEditor}
                      />
                    ))}

                    <div className="w-80 shrink-0">
                      {stageEditor?.mode === "create" ? (
                        <StageEditor
                          title="Nova coluna"
                          subtitle="Crie uma etapa adicional para o seu pipeline."
                          name={stageEditor.name}
                          color={stageEditor.color}
                          loading={savingStageState === "create"}
                          submitLabel="Adicionar coluna"
                          onNameChange={handleStageEditorNameChange}
                          onColorChange={handleStageEditorColorChange}
                          onSubmit={handleSubmitStageEditor}
                          onCancel={handleCancelStageEditor}
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={openCreateStageEditor}
                          className="flex h-22 w-full items-center justify-center rounded-xl border border-dashed border-gray-300 bg-white px-4 text-sm font-medium text-gray-600 transition hover:border-purple-300 hover:text-purple-600"
                        >
                          <Plus className="mr-2 h-4 w-4" />
                          Adicionar outra coluna
                        </button>
                      )}
                    </div>
                  </div>
                </SortableContext>
              </div>

              <DragOverlay>
                {activeOpportunity ? (
                  <div className="w-80 cursor-grabbing">
                    <OpportunityCardComponent
                      opportunity={activeOpportunity}
                      stageColor={
                        findStageById(kanbanData, activeOpportunity.stageId)?.stage.color ||
                        DEFAULT_STAGE_COLOR
                      }
                      onClick={() => {}}
                      isDragOverlay
                    />
                  </div>
                ) : null}

                {!activeOpportunity && activeStage ? (
                  <div className="w-80 cursor-grabbing rounded-xl border border-gray-200 bg-gray-100 p-3 shadow-xl">
                    <div className="rounded-lg border border-gray-200 bg-white px-3 py-3">
                      <div className="flex items-center gap-2 text-gray-800">
                        <GripVertical className="h-4 w-4 text-gray-400" />
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{
                            backgroundColor:
                              activeStage.stage.color || DEFAULT_STAGE_COLOR,
                          }}
                        />
                        <p className="text-sm font-semibold">{activeStage.stage.name}</p>
                      </div>
                      <p className="mt-2 text-xs text-gray-500">
                        {getColumnCountLabel(activeStage.count)}
                      </p>
                    </div>
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          )}
        </div>
      </main>

      <CreateOpportunityModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onCreated={fetchData}
        companies={companies}
        stages={stages}
        agents={agents}
      />
    </div>
  );
}
