import { cn } from "../../../lib/cn";

/** Barra de etapas somente leitura (usada na página de contato de exemplo). */
export function PipelineStepsPreview({
  stages,
  currentIndex,
}: {
  stages: string[];
  currentIndex: number;
}) {
  return (
    <div className="flex w-full border-b border-line bg-surface">
      {stages.map((step, index) => (
        <div
          key={step}
          className={cn(
            "flex-1 border-r border-line px-2 py-3 text-center text-sm font-medium last:border-r-0",
            index === currentIndex
              ? "bg-accent-600 text-white"
              : index < currentIndex
                ? "bg-accent-50 text-accent-700"
                : "bg-surface text-fg-muted",
          )}
        >
          {step}
        </div>
      ))}
    </div>
  );
}
