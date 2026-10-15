import { AlertTriangle } from "lucide-react";
import { Button } from "./Button";
import { EmptyState } from "./EmptyState";

/** Estado de erro padrão com botão "Tentar novamente". */
export function ErrorState({
  error,
  onRetry,
  title = "Algo deu errado",
}: {
  error?: unknown;
  onRetry?: () => void;
  title?: string;
}) {
  const message =
    error instanceof Error ? error.message : "Não foi possível carregar os dados.";
  return (
    <EmptyState
      icon={AlertTriangle}
      title={title}
      description={message}
      action={
        onRetry && (
          <Button variant="secondary" onClick={onRetry}>
            Tentar novamente
          </Button>
        )
      }
    />
  );
}
