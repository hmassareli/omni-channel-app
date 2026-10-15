import { ChevronDown, MessageSquare } from "lucide-react";
import { useMemo, useState } from "react";
import { EmptyState } from "../../../components/ui";
import { cn } from "../../../lib/cn";
import {
  getSystemEventKind,
  groupTimelineEventsByDate,
  type TimelineEventLike,
} from "../groupEvents";
import { InteractionBlockView } from "./InteractionBlockView";
import { TimelineSystemEvent } from "./TimelineItems";

interface TimelineViewProps<E extends TimelineEventLike> {
  events: E[];
  emptyTitle?: string;
  emptyDescription?: string;
}

/**
 * Timeline agrupada por dia → interações (contato + conversa).
 * Compartilhada por empresa e oportunidade.
 */
export function TimelineView<E extends TimelineEventLike>({
  events,
  emptyTitle = "Nenhum evento na timeline",
  emptyDescription,
}: TimelineViewProps<E>) {
  const groups = useMemo(() => groupTimelineEventsByDate(events), [events]);
  // Só guardamos o que o usuário alterou; o padrão é abrir o 1º dia e a 1ª interação.
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});

  const isOpen = (key: string, defaultOpen: boolean) =>
    overrides[key] ?? defaultOpen;
  const toggle = (key: string, defaultOpen: boolean) =>
    setOverrides((cur) => ({ ...cur, [key]: !(cur[key] ?? defaultOpen) }));

  if (groups.length === 0) {
    return (
      <EmptyState
        icon={MessageSquare}
        title={emptyTitle}
        description={emptyDescription}
      />
    );
  }

  return (
    <div className="space-y-3">
      {groups.map((group, groupIndex) => {
        const groupKey = `group:${group.key}`;
        const groupOpen = isOpen(groupKey, groupIndex === 0);

        return (
          <section
            key={group.key}
            className="rounded-lg border border-line bg-surface"
          >
            <button
              type="button"
              onClick={() => toggle(groupKey, groupIndex === 0)}
              aria-expanded={groupOpen}
              className="flex w-full items-center justify-between px-4 py-3 text-left"
            >
              <div>
                <p className="text-sm font-semibold text-fg">{group.label}</p>
                <p className="text-xs text-fg-muted">
                  {group.interactions.length}{" "}
                  {group.interactions.length === 1 ? "interação" : "interações"}{" "}
                  · {group.eventsCount}{" "}
                  {group.eventsCount === 1 ? "evento" : "eventos"}
                </p>
              </div>
              <ChevronDown
                className={cn(
                  "size-4 text-fg-faint transition-transform",
                  !groupOpen && "-rotate-90",
                )}
              />
            </button>

            {groupOpen && (
              <div className="space-y-4 border-t border-line bg-canvas px-4 py-4">
                {group.standaloneEvents.length > 0 && (
                  <div>
                    {group.standaloneEvents.map((event) => (
                      <TimelineSystemEvent
                        key={event.id}
                        time={event.occurredAt}
                        title={event.content ?? ""}
                        kind={getSystemEventKind(event.type)}
                      />
                    ))}
                  </div>
                )}

                {group.interactions.map((interaction, index) => {
                  const key = `interaction:${interaction.key}`;
                  return (
                    <InteractionBlockView
                      key={interaction.key}
                      interaction={interaction}
                      expanded={isOpen(key, index === 0)}
                      onToggle={() => toggle(key, index === 0)}
                    />
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
