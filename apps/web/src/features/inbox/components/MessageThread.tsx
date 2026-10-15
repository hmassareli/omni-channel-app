import { MessageSquare, StickyNote } from "lucide-react";
import { useLayoutEffect, useMemo, useRef } from "react";
import { Button, EmptyState, ErrorState, Skeleton } from "../../../components/ui";
import type { DeskMessage, DeskNote } from "../../../lib/api";
import { cn } from "../../../lib/cn";
import { formatClock, formatDayLabel } from "../../../lib/format";
import { useConversationMessages, useConversationNotes } from "../hooks";

type ThreadItem =
  | { kind: "message"; id: string; at: string; message: DeskMessage }
  | { kind: "note"; id: string; at: string; note: DeskNote };

function Bubble({ item }: { item: ThreadItem }) {
  if (item.kind === "note") {
    return (
      <div className="flex justify-center">
        <div className="max-w-[80%] rounded-lg border border-warning-100 bg-warning-50 px-3 py-2 text-sm text-fg">
          <p className="mb-0.5 flex items-center gap-1 text-2xs font-semibold uppercase tracking-wide text-warning-700">
            <StickyNote className="size-3" /> Nota interna
          </p>
          <p className="whitespace-pre-wrap break-words">{item.note.content}</p>
          <p className="mt-1 text-right text-2xs text-fg-faint">{formatClock(item.at)}</p>
        </div>
      </div>
    );
  }
  const out = item.message.direction === "OUTBOUND";
  return (
    <div className={cn("flex", out ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[75%] rounded-xl px-3 py-2 text-sm",
          out
            ? "rounded-br-sm bg-accent-100 text-fg"
            : "rounded-bl-sm border border-line bg-surface text-fg",
        )}
      >
        <p className="whitespace-pre-wrap break-words">
          {item.message.content ?? (item.message.hasMedia ? "[mídia]" : "")}
        </p>
        <p className="mt-1 text-right text-2xs text-fg-muted">{formatClock(item.at)}</p>
      </div>
    </div>
  );
}

export function MessageThread({ conversationId }: { conversationId: string }) {
  const messagesQuery = useConversationMessages(conversationId);
  const notesQuery = useConversationNotes(conversationId);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const prevHeight = useRef<number | null>(null);

  const items = useMemo<ThreadItem[]>(() => {
    const msgs: ThreadItem[] = (messagesQuery.data?.messages ?? []).map((m) => ({
      kind: "message",
      id: m.id,
      at: m.sentAt,
      message: m,
    }));
    const notes: ThreadItem[] = (notesQuery.data ?? []).map((n) => ({
      kind: "note",
      id: n.id,
      at: n.occurredAt,
      note: n,
    }));
    return [...msgs, ...notes].sort(
      (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime(),
    );
  }, [messagesQuery.data, notesQuery.data]);

  const lastId = items.at(-1)?.id;
  const firstId = items[0]?.id;

  // Rola para o fim em mensagens novas (se o usuário estava no fim);
  // ao carregar mensagens antigas, mantém a posição visual.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (prevHeight.current !== null) {
      el.scrollTop = el.scrollHeight - prevHeight.current;
      prevHeight.current = null;
    } else if (stickToBottom.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [lastId, firstId]);

  if (messagesQuery.isPending) {
    return (
      <div className="flex-1 space-y-4 p-6" role="status" aria-label="Carregando mensagens">
        <Skeleton className="h-12 w-1/2" />
        <Skeleton className="ml-auto h-12 w-1/3" />
        <Skeleton className="h-12 w-2/5" />
      </div>
    );
  }
  if (messagesQuery.isError) {
    return (
      <div className="flex-1">
        <ErrorState error={messagesQuery.error} onRetry={() => messagesQuery.refetch()} />
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <EmptyState
        className="flex-1"
        icon={MessageSquare}
        title="Sem mensagens"
        description="Envie a primeira mensagem abaixo."
      />
    );
  }

  const dayStarts = new Set<string>();
  let prevDay = "";
  for (const item of items) {
    const day = new Date(item.at).toDateString();
    if (day !== prevDay) dayStarts.add(`${item.kind}-${item.id}`);
    prevDay = day;
  }
  return (
    <div
      ref={scrollRef}
      onScroll={(e) => {
        const el = e.currentTarget;
        stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
      }}
      className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-canvas p-4"
    >
      {messagesQuery.hasNextPage && (
        <div className="text-center">
          <Button
            variant="ghost"
            size="sm"
            loading={messagesQuery.isFetchingNextPage}
            onClick={() => {
              prevHeight.current = scrollRef.current?.scrollHeight ?? null;
              void messagesQuery.fetchNextPage();
            }}
          >
            Carregar mensagens anteriores
          </Button>
        </div>
      )}
      {items.map((item) => {
        const key = `${item.kind}-${item.id}`;
        return (
          <div key={key} className="space-y-3">
            {dayStarts.has(key) && (
              <div className="flex justify-center">
                <span className="rounded-full bg-subtle px-3 py-0.5 text-2xs font-medium text-fg-muted">
                  {formatDayLabel(item.at)}
                </span>
              </div>
            )}
            <Bubble item={item} />
          </div>
        );
      })}
    </div>
  );
}
