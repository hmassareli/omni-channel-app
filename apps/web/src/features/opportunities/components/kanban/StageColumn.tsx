import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, PenLine, Trash2 } from "lucide-react";
import { cn } from "../../../../lib/cn";
import { SortableOpportunityCard } from "./OpportunityCard";
import { StageEditor } from "./StageEditor";
import {
  DEFAULT_STAGE_COLOR,
  getColumnCountLabel,
  getOpportunitySortableId,
  getStageDropId,
  getStageSortableId,
  type KanbanColumn,
  type KanbanOpportunity,
  type StageEditorState,
} from "./kanbanUtils";

export interface StageColumnProps {
  column: KanbanColumn;
  isOver: boolean;
  savingOpportunityId: string | null;
  isReordering: boolean;
  savingStageId: string | null;
  stageEditor: StageEditorState | null;
  onOpportunityClick: (opportunity: KanbanOpportunity) => void;
  onEditStage: (stage: KanbanColumn["stage"]) => void;
  onDeleteStage: (stage: KanbanColumn["stage"]) => void;
  onStageEditorNameChange: (value: string) => void;
  onStageEditorColorChange: (value: string) => void;
  onSubmitStageEditor: () => void;
  onCancelStageEditor: () => void;
}

function IconButton({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={cn(
        "rounded-md p-1.5 text-fg-faint transition-colors hover:bg-subtle disabled:opacity-50",
        danger ? "hover:text-danger-600" : "hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}

function ColumnBody({
  column,
  isOver,
  isDragging,
  dragHandleProps,
  ...props
}: StageColumnProps & {
  isDragging: boolean;
  dragHandleProps: Record<string, unknown>;
}) {
  const { stage } = column;
  const { setNodeRef } = useDroppable({
    id: getStageDropId(stage.id),
    data: { type: "stage-drop", stageId: stage.id },
  });

  const color = stage.color || DEFAULT_STAGE_COLOR;
  const isEditing =
    props.stageEditor?.mode === "edit" && props.stageEditor.stageId === stage.id;
  const isBusy = props.savingStageId === stage.id || props.isReordering;

  return (
    <div
      className={cn(
        "flex h-full min-h-0 w-72 shrink-0 flex-col rounded-xl bg-subtle p-2 transition-opacity",
        isDragging && "opacity-60",
      )}
    >
      {isEditing && props.stageEditor ? (
        <StageEditor
          title="Editar coluna"
          subtitle="Atualize o nome e a cor da etapa sem sair do board."
          name={props.stageEditor.name}
          color={props.stageEditor.color}
          loading={isBusy}
          submitLabel="Salvar coluna"
          onNameChange={props.onStageEditorNameChange}
          onColorChange={props.onStageEditorColorChange}
          onSubmit={props.onSubmitStageEditor}
          onCancel={props.onCancelStageEditor}
        />
      ) : (
        <>
          <div className="mb-2 flex items-center justify-between gap-2 px-1 py-1">
            <div className="flex min-w-0 items-center gap-1">
              <button
                type="button"
                className="cursor-grab rounded-md p-1 text-fg-faint hover:text-fg"
                aria-label={`Arrastar coluna ${stage.name}`}
                {...dragHandleProps}
              >
                <GripVertical className="size-4" />
              </button>
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: color }}
              />
              <h3 className="truncate text-sm font-semibold text-fg">
                {stage.name}
              </h3>
              <span className="ml-1 text-xs text-fg-muted">
                {getColumnCountLabel(column.count)}
              </span>
            </div>
            <div className="flex items-center">
              <IconButton
                label={`Editar coluna ${stage.name}`}
                disabled={isBusy}
                onClick={() => props.onEditStage(stage)}
              >
                <PenLine className="size-4" />
              </IconButton>
              <IconButton
                label={`Excluir coluna ${stage.name}`}
                disabled={isBusy}
                danger
                onClick={() => props.onDeleteStage(stage)}
              >
                <Trash2 className="size-4" />
              </IconButton>
            </div>
          </div>

          <div
            ref={setNodeRef}
            className={cn(
              "flex min-h-56 flex-1 flex-col overflow-y-auto rounded-lg border p-1.5 transition-colors",
              isOver
                ? "border-accent-300 bg-accent-50"
                : "border-transparent",
            )}
          >
            <SortableContext
              items={column.opportunities.map((o) =>
                getOpportunitySortableId(o.id),
              )}
              strategy={verticalListSortingStrategy}
            >
              {column.opportunities.map((opportunity) => (
                <SortableOpportunityCard
                  key={opportunity.id}
                  opportunity={opportunity}
                  stageId={stage.id}
                  stageColor={color}
                  isSaving={props.savingOpportunityId === opportunity.id}
                  onClick={() => props.onOpportunityClick(opportunity)}
                />
              ))}
            </SortableContext>

            {column.opportunities.length === 0 && (
              <div className="flex min-h-32 items-center justify-center rounded-lg border border-dashed border-line-strong px-4 text-center text-xs text-fg-faint">
                Solte uma oportunidade aqui
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/** Coluna do kanban: arrastável (reordena etapas) e área de soltar cards. */
export function StageColumn(props: StageColumnProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({
      id: getStageSortableId(props.column.stage.id),
      data: { type: "stage", stageId: props.column.stage.id },
    });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className="touch-none"
    >
      <ColumnBody
        {...props}
        isDragging={isDragging}
        dragHandleProps={{ ...attributes, ...listeners }}
      />
    </div>
  );
}
