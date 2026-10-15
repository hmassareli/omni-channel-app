import {
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { useState } from "react";
import { useReorderStages, useUpdateOpportunityStage } from "../../hooks";
import {
  findColumnById,
  findOpportunityById,
  findStageIdForOpportunity,
  getDragType,
  moveOpportunityAcrossColumns,
  type KanbanColumn,
  type KanbanColumns,
  type KanbanOpportunity,
} from "./kanbanUtils";

/**
 * Estado e handlers de drag-and-drop do kanban.
 * `serverColumns` vem do React Query; durante o arraste mantemos uma cópia
 * local (`localColumns`) que é descartada assim que o servidor confirma.
 */
export function useKanbanBoard({
  serverColumns,
  operationId,
  onError,
}: {
  serverColumns: KanbanColumns;
  operationId: string | null;
  onError: (message: string) => void;
}) {
  const [localColumns, setLocalColumns] = useState<KanbanColumns | null>(null);
  const [activeOpportunity, setActiveOpportunity] =
    useState<KanbanOpportunity | null>(null);
  const [activeStage, setActiveStage] = useState<KanbanColumn | null>(null);
  const [overStageId, setOverStageId] = useState<string | null>(null);
  const [savingOpportunityId, setSavingOpportunityId] = useState<string | null>(
    null,
  );

  const moveOpportunity = useUpdateOpportunityStage();
  const reorder = useReorderStages();

  const columns = localColumns ?? serverColumns;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const resetDragState = () => {
    setActiveOpportunity(null);
    setActiveStage(null);
    setOverStageId(null);
  };

  const revert = () => {
    setLocalColumns(null);
    resetDragState();
  };

  const onDragStart = (event: DragStartEvent) => {
    const type = getDragType(event);
    if (type === "opportunity") {
      const id = event.active.data.current?.opportunityId as string;
      setActiveOpportunity(findOpportunityById(columns, id));
      setOverStageId(findStageIdForOpportunity(columns, id));
    } else if (type === "stage") {
      const stageId = event.active.data.current?.stageId as string;
      setActiveStage(findColumnById(columns, stageId));
      setOverStageId(stageId);
    }
  };

  const onDragOver = (event: DragOverEvent) => {
    if (getDragType(event) !== "opportunity") return;

    const opportunityId = event.active.data.current?.opportunityId as string;
    const fromStageId = findStageIdForOpportunity(columns, opportunityId);
    const toStageId =
      (event.over?.data.current?.stageId as string | undefined) ?? null;
    const overOpportunityId =
      event.over?.data.current?.type === "opportunity"
        ? (event.over.data.current.opportunityId as string)
        : null;

    setOverStageId(toStageId);
    if (!fromStageId || !toStageId || fromStageId === toStageId) return;

    setLocalColumns((current) =>
      moveOpportunityAcrossColumns(
        current ?? serverColumns,
        opportunityId,
        fromStageId,
        toStageId,
        overOpportunityId,
      ),
    );
  };

  const handleStageDrop = async (event: DragEndEvent) => {
    const activeStageId = event.active.data.current?.stageId as string;
    const targetStageId =
      (event.over?.data.current?.stageId as string | undefined) ?? null;
    const oldIndex = serverColumns.findIndex((c) => c.stage.id === activeStageId);
    const newIndex = serverColumns.findIndex((c) => c.stage.id === targetStageId);

    if (!targetStageId || activeStageId === targetStageId || !operationId || oldIndex < 0 || newIndex < 0) {
      revert();
      return;
    }

    const reordered = arrayMove(serverColumns, oldIndex, newIndex).map(
      (column, index) => ({ ...column, stage: { ...column.stage, order: index } }),
    );
    setLocalColumns(reordered);

    try {
      await reorder.mutateAsync({
        operationId,
        stageIds: reordered.map((c) => c.stage.id),
      });
    } catch (error) {
      console.error("Erro ao reordenar estágios:", error);
      onError("Não foi possível reordenar as colunas do kanban.");
    } finally {
      revert();
    }
  };

  const handleOpportunityDrop = async (event: DragEndEvent) => {
    const opportunityId = event.active.data.current?.opportunityId as string;
    const originStageId = findStageIdForOpportunity(serverColumns, opportunityId);
    const targetStageId =
      (event.over?.data.current?.stageId as string | undefined) ?? null;

    if (!targetStageId || !originStageId || originStageId === targetStageId) {
      revert();
      return;
    }

    setSavingOpportunityId(opportunityId);
    try {
      await moveOpportunity.mutateAsync({ id: opportunityId, stageId: targetStageId });
    } catch (error) {
      console.error("Erro ao mover oportunidade:", error);
      onError("Não foi possível mover a oportunidade para a nova coluna.");
    } finally {
      setSavingOpportunityId(null);
      revert();
    }
  };

  const onDragEnd = (event: DragEndEvent) =>
    getDragType(event) === "stage"
      ? handleStageDrop(event)
      : handleOpportunityDrop(event);

  return {
    columns,
    sensors,
    activeOpportunity,
    activeStage,
    overStageId,
    savingOpportunityId,
    isReordering: reorder.isPending,
    onDragStart,
    onDragOver,
    onDragEnd,
    onDragCancel: revert,
  };
}
