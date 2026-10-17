import { MessageSquare, StickyNote } from "lucide-react";
import { useLayoutEffect, useMemo, useRef } from "react";
import { Button, EmptyState, ErrorState, Skeleton } from "../../../components/ui";
import type { DeskMessage, DeskNote } from "../../../lib/api";
import { cn } from "../../../lib/cn";
import { formatClock, formatDayLabel } from "../../../lib/format";
import { useConversationMessages, useConversationNotes } from "../hooks";
import { DeliveryTicks, MessageMedia, QuotedMessage } from "./MessageMedia";

type ThreadItem =
  | { kind: "message"; id: string; at: string; message: DeskMessage }
  | { kind: "note"; id: string; at: string; note: DeskNote };

function MessageBubble({
  message,
  at,
  onJump,
}: {
  message: DeskMessage;
  at: string;
  onJump: (id: string) => void;
}) {
  const out = message.direction === "OUTBOUND";
  const { media } = message;
  const text = message.content;
  // Foto/vídeo ocupam o balão inteiro (moldura fina); o resto tem padding normal.
  const framed =
    !!media && (media.kind === "image" || media.kind === "video") && media.available;

  const meta = (
    <span className="flex items-center justify-end gap-1 text-2xs text-fg-muted">
      {formatClock(at)}
      {out && message.ack && <DeliveryTicks ack={message.ack} />}
    </span>
  );

  // Figurinha: sem balão.
  if (media?.kind === "sticker" && !text && !message.replyTo) {
    return (
      <div id={`msg-${message.id}`} className={cn("flex", out ? "justify-end" : "justify-start")}>
        <div className={cn("flex flex-col gap-0.5", out ? "items-end" : "items-start")}>
          <MessageMedia message={message} />
          {meta}
        </div>
      </div>
    );
  }

  return (
    <div id={`msg-${message.id}`} className={cn("flex", out ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[75%] rounded-xl text-sm",
          framed ? "p-1" : "px-3 py-2",
          out
            ? "rounded-br-sm bg-accent-100 text-fg"
            : "rounded-bl-sm border border-line bg-surface text-fg",
        )}
      >
        {message.replyTo && (
          <div className={cn(framed && "px-1 pt-1")}>
            <QuotedMessage replyTo={message.replyTo} outbound={out} onJump={onJump} />
          </div>
        )}
        {media && <MessageMedia message={message} />}
        {!media && message.hasMedia && !text && (
          <p className="italic text-fg-muted">Mídia indisponível</p>
        )}
        {text && (
          <p className={cn("whitespace-pre-wrap break-words", media && "mt-1.5", framed && "px-2")}>
            {text}
          </p>
        )}
        <div className={cn("mt-1", framed && "px-2 pb-1")}>{meta}</div>
      </div>
    </div>
  );
}

function Bubble({ item, onJump }: { item: ThreadItem; onJump: (id: string) => void }) {
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
  return <MessageBubble message={item.message} at={item.at} onJump={onJump} />;
}

/** Rola até a mensagem citada e a destaca por um instante. */
function jumpToMessage(id: string) {
  const el = document.getElementById(`msg-${id}`);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.animate(
    [{ backgroundColor: "var(--color-accent-100)" }, { backgroundColor: "transparent" }],
    { duration: 1200, easing: "ease-out" },
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
            <Bubble item={item} onJump={jumpToMessage} />
          </div>
        );
      })}
    </div>
  );
}
