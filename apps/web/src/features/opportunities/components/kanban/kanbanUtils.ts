import type { DragEndEvent, DragOverEvent, DragStartEvent } from "@dnd-kit/core";
import type * as api from "../../../../lib/api";

export type KanbanColumns = Awaited<
  ReturnType<typeof api.getOpportunitiesKanban>
>["columns"];
export type KanbanColumn = KanbanColumns[number];
export type KanbanOpportunity = KanbanColumn["opportunities"][number];

export type StageEditorState = {
  mode: "create" | "edit";
  stageId?: string;
  name: string;
  color: string;
};

export type FeedbackState = { type: "error" | "success"; text: string } | null;

const OPPORTUNITY_PREFIX = "opportunity:";
const STAGE_PREFIX = "stage:";
const STAGE_DROP_PREFIX = "stage-drop:";

// Cores de etapa são dados do usuário (salvas no banco como hex), não estilo da UI.
export const DEFAULT_STAGE_COLOR = "#4f46e5";
export const STAGE_COLOR_PRESETS = [
  "#4f46e5",
  "#0f766e",
  "#7c3aed",
  "#db2777",
  "#d97706",
  "#dc2626",
  "#2563eb",
  "#475569",
];

export const getOpportunitySortableId = (id: string) =>
  `${OPPORTUNITY_PREFIX}${id}`;
export const getStageSortableId = (id: string) => `${STAGE_PREFIX}${id}`;
export const getStageDropId = (id: string) => `${STAGE_DROP_PREFIX}${id}`;

export const getColumnCountLabel = (count: number) =>
  `${count} ${count === 1 ? "card" : "cards"}`;

export function getDragType(
  event: DragStartEvent | DragOverEvent | DragEndEvent,
) {
  return event.active.data.current?.type as "opportunity" | "stage" | undefined;
}

export function findOpportunityById(
  columns: KanbanColumns,
  opportunityId: string,
): KanbanOpportunity | null {
  for (const column of columns) {
    const found = column.opportunities.find((item) => item.id === opportunityId);
    if (found) return found;
  }
  return null;
}

export function findColumnById(
  columns: KanbanColumns,
  stageId: string,
): KanbanColumn | null {
  return columns.find((column) => column.stage.id === stageId) ?? null;
}

export function findStageIdForOpportunity(
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

export function moveOpportunityAcrossColumns(
  columns: KanbanColumns,
  opportunityId: string,
  fromStageId: string,
  toStageId: string,
  overOpportunityId: string | null,
): KanbanColumns {
  if (fromStageId === toStageId) return columns;

  const moved = findOpportunityById(columns, opportunityId);
  if (!moved) return columns;

  return columns.map((column) => {
    if (column.stage.id === fromStageId) {
      const opportunities = column.opportunities.filter(
        (item) => item.id !== opportunityId,
      );
      return { ...column, opportunities, count: opportunities.length };
    }

    if (column.stage.id === toStageId) {
      const opportunities = [...column.opportunities];
      const index = overOpportunityId
        ? opportunities.findIndex((item) => item.id === overOpportunityId)
        : -1;
      opportunities.splice(index >= 0 ? index : opportunities.length, 0, moved);
      return { ...column, opportunities, count: opportunities.length };
    }

    return column;
  });
}
