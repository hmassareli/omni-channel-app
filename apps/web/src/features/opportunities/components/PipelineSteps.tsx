import { cn } from "../../../lib/cn";
import type { Stage } from "../../../lib/api";

/** Barra de etapas do funil; clicar em uma etapa move a oportunidade. */
export function PipelineSteps({
  stages,
  currentStageId,
  disabled,
  onStageClick,
}: {
  stages: Stage[];
  currentStageId: string | null;
  disabled?: boolean;
  onStageClick: (stageId: string) => void;
}) {
  const currentIndex = stages.findIndex((s) => s.id === currentStageId);

  return (
    <div className="flex w-full border-b border-line bg-surface" role="group" aria-label="Etapas do funil">
      {stages.map((stage, index) => (
        <button
          key={stage.id}
          type="button"
          disabled={disabled}
          aria-current={index === currentIndex ? "step" : undefined}
          onClick={() => onStageClick(stage.id)}
          className={cn(
            "flex-1 border-r border-line px-2 py-3 text-center text-sm font-medium transition-colors last:border-r-0",
            index === currentIndex
              ? "bg-accent-600 text-white"
              : index < currentIndex
                ? "bg-accent-50 text-accent-700 hover:bg-accent-100"
                : "bg-surface text-fg-muted hover:bg-subtle",
          )}
        >
          {stage.name}
        </button>
      ))}
    </div>
  );
}
