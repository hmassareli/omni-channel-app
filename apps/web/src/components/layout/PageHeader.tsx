import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** Ícone/avatar exibido antes do título. */
  leading?: ReactNode;
  /** Se informado, mostra botão de voltar para este caminho. */
  backTo?: string;
}

/** Cabeçalho de página: título, descrição e ações à direita. */
export function PageHeader({
  title,
  description,
  actions,
  leading,
  backTo,
}: PageHeaderProps) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-line bg-surface px-8 py-5">
      <div className="flex min-w-0 items-center gap-4">
        {backTo && (
          <Link
            to={backTo}
            aria-label="Voltar"
            className="rounded-md p-1.5 text-fg-muted transition-colors hover:bg-subtle hover:text-fg"
          >
            <ArrowLeft className="size-4" />
          </Link>
        )}
        {leading}
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold tracking-tight text-fg">
            {title}
          </h1>
          {description && (
            <p className="mt-0.5 text-sm text-fg-muted">{description}</p>
          )}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
