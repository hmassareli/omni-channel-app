import { ChevronDown } from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "../../lib/cn";

/** Seção recolhível usada nas barras laterais de contexto. */
export function SidebarSection({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="border-b border-line py-3 last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left hover:bg-subtle"
      >
        <h3 className="text-2xs font-semibold uppercase tracking-wider text-fg-muted">
          {title}
        </h3>
        <ChevronDown
          className={cn(
            "size-4 text-fg-faint transition-transform",
            !open && "-rotate-90",
          )}
        />
      </button>
      {open && <div className="mt-1 px-2">{children}</div>}
    </section>
  );
}

export function InfoRow({
  label,
  value,
}: {
  label: string;
  value?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 text-sm">
      <span className="shrink-0 text-fg-muted">{label}</span>
      <span className="text-right font-medium text-fg">{value || "—"}</span>
    </div>
  );
}
