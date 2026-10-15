import type { KeyboardEvent } from "react";
import { cn } from "../../lib/cn";

export interface TabItem<T extends string = string> {
  id: T;
  label: string;
  count?: number;
}

export interface TabsProps<T extends string = string> {
  tabs: TabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  className?: string;
  /** Prefixo dos ids; o painel pode usar `${idPrefix}-panel-${id}`. */
  idPrefix?: string;
}

export function Tabs<T extends string = string>({
  tabs,
  value,
  onChange,
  className,
  idPrefix = "tabs",
}: TabsProps<T>) {
  const handleKey = (event: KeyboardEvent, index: number) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const delta = event.key === "ArrowRight" ? 1 : -1;
    onChange(tabs[(index + delta + tabs.length) % tabs.length].id);
  };

  return (
    <div
      role="tablist"
      className={cn("flex gap-1 border-b border-line", className)}
    >
      {tabs.map((tab, index) => {
        const active = tab.id === value;
        return (
          <button
            key={tab.id}
            role="tab"
            id={`${idPrefix}-tab-${tab.id}`}
            aria-selected={active}
            aria-controls={`${idPrefix}-panel-${tab.id}`}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(e) => handleKey(e, index)}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "border-accent-600 text-fg"
                : "border-transparent text-fg-muted hover:text-fg",
            )}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span className="ml-1.5 text-xs text-fg-faint">{tab.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
