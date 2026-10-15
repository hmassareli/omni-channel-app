import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Avatar } from "../../../../components/ui";
import { cn } from "../../../../lib/cn";
import { formatCNPJ, formatCurrency } from "../../../../lib/format";
import { getOpportunitySortableId, type KanbanOpportunity } from "./kanbanUtils";

export function OpportunityCard({
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
      className={cn(
        "cursor-pointer rounded-lg border border-line bg-surface p-3 transition-[transform,box-shadow,border-color,opacity] duration-150",
        isDragOverlay
          ? "rotate-1 border-accent-300 shadow-md"
          : "shadow-xs hover:border-line-strong hover:shadow-sm",
        isDragging ? "opacity-40" : "opacity-100",
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className="size-2 shrink-0 rounded-full"
          style={{ backgroundColor: stageColor }}
        />
        <h4 className="truncate text-sm font-semibold text-fg">
          {opportunity.company.alias || opportunity.company.name}
        </h4>
      </div>
      <p className="mt-1 text-xs text-fg-muted">
        {formatCNPJ(opportunity.company.taxId)}
      </p>

      <div className="mt-3 flex items-end justify-between gap-3">
        <div>
          <p className="text-2xs text-fg-faint">Valor estimado</p>
          <p className="text-sm font-semibold text-fg">
            {opportunity.estimatedValue
              ? formatCurrency(Number(opportunity.estimatedValue), {
                  maximumFractionDigits: 0,
                })
              : "A definir"}
          </p>
        </div>
        {opportunity.agent && (
          <Avatar
            name={opportunity.agent.name}
            src={opportunity.agent.avatarUrl}
            size="xs"
            tone="accent"
          />
        )}
      </div>

      {opportunity.notes && (
        <p className="mt-3 line-clamp-2 rounded-md bg-subtle px-2 py-1.5 text-xs text-fg-muted">
          {opportunity.notes}
        </p>
      )}
    </div>
  );
}

export function SortableOpportunityCard({
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
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({
      id: getOpportunitySortableId(opportunity.id),
      data: { type: "opportunity", opportunityId: opportunity.id, stageId },
    });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("mb-2 touch-none", isSaving && "pointer-events-none")}
      {...attributes}
      {...listeners}
    >
      <OpportunityCard
        opportunity={opportunity}
        stageColor={stageColor}
        onClick={onClick}
        isDragging={isDragging || isSaving}
      />
    </div>
  );
}
