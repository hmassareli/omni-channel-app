import { cn } from "../../../lib/cn";
import {
  getSystemEventKind,
  isMessageEvent,
  type InteractionBlock,
  type TimelineEventLike,
} from "../groupEvents";
import { TimelineMessage, TimelineSystemEvent } from "./TimelineItems";

const PREVIEW_LIMIT = 15;

/** Bloco de uma conversa (contato + canal) com prévia e "mostrar mais". */
export function InteractionBlockView<E extends TimelineEventLike>({
  interaction,
  expanded,
  onToggle,
}: {
  interaction: InteractionBlock<E>;
  expanded: boolean;
  onToggle: () => void;
}) {
  const total = interaction.events.length;
  const visible = expanded
    ? interaction.events
    : interaction.events.slice(0, PREVIEW_LIMIT);
  const hidden = total - visible.length;

  return (
    <section className="overflow-hidden rounded-lg border border-line bg-surface">
      <div
        className={cn(
          "flex items-center justify-between gap-4 border-b border-line bg-canvas px-4 py-3",
        )}
      >
        <div>
          <p className="text-sm font-semibold text-fg">
            {interaction.contactName}
          </p>
          <p className="text-xs text-fg-muted">
            {interaction.channelName} · {total} {total === 1 ? "item" : "itens"}
          </p>
        </div>
        <p className="text-xs text-fg-faint">
          Início: {new Date(interaction.startedAt).toLocaleString("pt-BR")}
        </p>
      </div>

      <div className="px-4 py-4">
        {visible.map((event) =>
          isMessageEvent(event.type) ? (
            <TimelineMessage
              key={event.id}
              sender={event.contact?.name || "Contato"}
              time={event.occurredAt}
              message={event.content ?? ""}
              isInbound={event.type === "MESSAGE_RECEIVED"}
              channelName={event.conversation?.channel?.name || undefined}
            />
          ) : (
            <TimelineSystemEvent
              key={event.id}
              time={event.occurredAt}
              title={event.content ?? ""}
              kind={getSystemEventKind(event.type)}
            />
          ),
        )}

        {total > PREVIEW_LIMIT && (
          <button
            type="button"
            onClick={onToggle}
            className="mt-1 text-sm font-medium text-accent-600 hover:text-accent-700"
          >
            {expanded
              ? "Recolher interação"
              : `Mostrar mais ${hidden} ${hidden === 1 ? "item" : "itens"}`}
          </button>
        )}
      </div>
    </section>
  );
}
