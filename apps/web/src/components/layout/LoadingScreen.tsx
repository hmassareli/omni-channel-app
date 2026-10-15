import { Spinner } from "../ui";

export function LoadingScreen({ label = "Carregando..." }: { label?: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas">
      <div className="flex flex-col items-center gap-4">
        <span className="flex size-12 items-center justify-center rounded-xl bg-accent-600 text-sm font-bold text-white shadow-sm">
          CRM
        </span>
        <div className="flex items-center gap-2 text-sm text-fg-muted">
          <Spinner size="sm" />
          <span>{label}</span>
        </div>
      </div>
    </div>
  );
}
