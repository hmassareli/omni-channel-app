import { closestCorners, DndContext, DragOverlay } from "@dnd-kit/core";
import {
  horizontalListSortingStrategy,
  SortableContext,
} from "@dnd-kit/sortable";
import { GripVertical, Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { OpportunityCard } from "./OpportunityCard";
import { StageColumn } from "./StageColumn";
import { StageEditor } from "./StageEditor";
import {
  DEFAULT_STAGE_COLOR,
  findColumnById,
  getColumnCountLabel,
  getStageSortableId,
  type KanbanColumns,
  type KanbanOpportunity,
} from "./kanbanUtils";
import { useKanbanBoard } from "./useKanbanBoard";
import type { useStageEditor } from "./useStageEditor";

interface KanbanBoardProps {
  serverColumns: KanbanColumns;
  /** Colunas visíveis (após filtro); o board continua usando todas para o DnD. */
  visibleStageId: string;
  operationId: string | null;
  stageEditor: ReturnType<typeof useStageEditor>;
  onError: (message: string) => void;
}

export function KanbanBoard({
  serverColumns,
  visibleStageId,
  operationId,
  stageEditor,
  onError,
}: KanbanBoardProps) {
  const navigate = useNavigate();
  const board = useKanbanBoard({ serverColumns, operationId, onError });

  const visibleColumns = visibleStageId
    ? board.columns.filter((c) => c.stage.id === visibleStageId)
    : board.columns;

  const openOpportunity = (opportunity: KanbanOpportunity) =>
    navigate(`/opportunities/${opportunity.id}`);

  return (
    <DndContext
      sensors={board.sensors}
      collisionDetection={closestCorners}
      onDragStart={board.onDragStart}
      onDragOver={board.onDragOver}
      onDragCancel={board.onDragCancel}
      onDragEnd={board.onDragEnd}
    >
      <div className="flex min-h-0 flex-1 overflow-x-auto overflow-y-hidden pb-2">
        <SortableContext
          items={visibleColumns.map((c) => getStageSortableId(c.stage.id))}
          strategy={horizontalListSortingStrategy}
        >
          <div className="flex h-full items-stretch gap-3 pr-4">
            {visibleColumns.map((column) => (
              <StageColumn
                key={column.stage.id}
                column={column}
                isOver={board.overStageId === column.stage.id}
                savingOpportunityId={board.savingOpportunityId}
                isReordering={board.isReordering}
                savingStageId={stageEditor.savingStageId}
                stageEditor={stageEditor.editor}
                onOpportunityClick={openOpportunity}
                onEditStage={stageEditor.openEdit}
                onDeleteStage={stageEditor.remove}
                onStageEditorNameChange={stageEditor.setName}
                onStageEditorColorChange={stageEditor.setColor}
                onSubmitStageEditor={stageEditor.submit}
                onCancelStageEditor={stageEditor.cancel}
              />
            ))}

            <div className="w-72 shrink-0">
              {stageEditor.editor?.mode === "create" ? (
                <StageEditor
                  title="Nova coluna"
                  subtitle="Crie uma etapa adicional para o seu pipeline."
                  name={stageEditor.editor.name}
                  color={stageEditor.editor.color}
                  loading={stageEditor.isCreating}
                  submitLabel="Adicionar coluna"
                  onNameChange={stageEditor.setName}
                  onColorChange={stageEditor.setColor}
                  onSubmit={stageEditor.submit}
                  onCancel={stageEditor.cancel}
                />
              ) : (
                <button
                  type="button"
                  onClick={stageEditor.openCreate}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong text-sm font-medium text-fg-muted transition-colors hover:border-accent-300 hover:text-accent-600"
                >
                  <Plus className="size-4" />
                  Adicionar coluna
                </button>
              )}
            </div>
          </div>
        </SortableContext>
      </div>

      <DragOverlay>
        {board.activeOpportunity && (
          <div className="w-72 cursor-grabbing">
            <OpportunityCard
              opportunity={board.activeOpportunity}
              stageColor={
                findColumnById(board.columns, board.activeOpportunity.stageId)
                  ?.stage.color || DEFAULT_STAGE_COLOR
              }
              onClick={() => {}}
              isDragOverlay
            />
          </div>
        )}
        {!board.activeOpportunity && board.activeStage && (
          <div className="w-72 cursor-grabbing rounded-xl bg-subtle p-3 shadow-md">
            <div className="flex items-center gap-2 text-fg">
              <GripVertical className="size-4 text-fg-faint" />
              <span
                className="size-2 rounded-full"
                style={{
                  backgroundColor:
                    board.activeStage.stage.color || DEFAULT_STAGE_COLOR,
                }}
              />
              <p className="text-sm font-semibold">
                {board.activeStage.stage.name}
              </p>
              <span className="text-xs text-fg-muted">
                {getColumnCountLabel(board.activeStage.count)}
              </span>
            </div>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
