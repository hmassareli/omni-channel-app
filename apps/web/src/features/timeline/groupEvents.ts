// Agrupamento de eventos de timeline por dia e por interação (contato + conversa)

export interface TimelineEventLike {
  id: string;
  type: string;
  content?: string | null;
  occurredAt: string | Date;
  contact?: { id?: string; name?: string | null } | null;
  conversation?: {
    id?: string;
    channel?: { name?: string | null } | null;
  } | null;
}

export interface InteractionBlock<E extends TimelineEventLike> {
  key: string;
  contactName: string;
  channelName: string;
  startedAt: string | Date;
  latestAt: string | Date;
  events: E[];
}

export interface TimelineGroup<E extends TimelineEventLike> {
  key: string;
  label: string;
  eventsCount: number;
  interactions: InteractionBlock<E>[];
  /** Eventos sem conversa (STAGE_CHANGE, NOTE...) ficam soltos no dia. */
  standaloneEvents: E[];
}

const time = (value: string | Date) => new Date(value).getTime();

function formatGroupLabel(date: Date): string {
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  const dateKey = date.toISOString().slice(0, 10);
  if (dateKey === today.toISOString().slice(0, 10)) return "Hoje";
  if (dateKey === yesterday.toISOString().slice(0, 10)) return "Ontem";

  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

export function groupTimelineEventsByDate<E extends TimelineEventLike>(
  events: E[],
): TimelineGroup<E>[] {
  const sorted = [...events].sort(
    (a, b) => time(a.occurredAt) - time(b.occurredAt),
  );
  const groups = new Map<
    string,
    Omit<TimelineGroup<E>, "interactions"> & {
      interactions: Map<string, InteractionBlock<E>>;
    }
  >();

  for (const event of sorted) {
    const date = new Date(event.occurredAt);
    const key = date.toISOString().slice(0, 10);

    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        label: formatGroupLabel(date),
        eventsCount: 0,
        interactions: new Map(),
        standaloneEvents: [],
      };
      groups.set(key, group);
    }
    group.eventsCount += 1;

    if (!event.conversation?.id) {
      group.standaloneEvents.push(event);
      continue;
    }

    const interactionKey = `${event.contact?.id || "unknown"}:${event.conversation.id}`;
    let interaction = group.interactions.get(interactionKey);
    if (!interaction) {
      interaction = {
        key: interactionKey,
        contactName: event.contact?.name || "Contato",
        channelName: event.conversation.channel?.name || "Desconhecido",
        startedAt: event.occurredAt,
        latestAt: event.occurredAt,
        events: [],
      };
      group.interactions.set(interactionKey, interaction);
    }
    interaction.events.push(event);
    interaction.latestAt = event.occurredAt;
  }

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      interactions: Array.from(group.interactions.values()).sort(
        (a, b) => time(b.latestAt) - time(a.latestAt),
      ),
    }))
    .sort((a, b) => time(b.key) - time(a.key));
}

export function isMessageEvent(type: string): boolean {
  return type === "MESSAGE_SENT" || type === "MESSAGE_RECEIVED";
}

export type SystemEventKind = "create" | "stage_change" | "system";

export function getSystemEventKind(type: string): SystemEventKind {
  if (type === "STAGE_CHANGE") return "stage_change";
  if (type?.includes("CREATE")) return "create";
  return "system";
}
