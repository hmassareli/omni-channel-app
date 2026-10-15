import { Inbox, Search } from "lucide-react";
import { useMemo, useState } from "react";
import {
  Avatar,
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Input,
  Select,
  Skeleton,
  Tabs,
} from "../../../components/ui";
import type { ConversationListItem, ConversationStatusValue } from "../../../lib/api";
import { cn } from "../../../lib/cn";
import { formatRelativeTime } from "../../../lib/format";
import { useDebouncedValue } from "../../../lib/useDebouncedValue";
import { useConversationList, useQueues } from "../hooks";
import { CHANNEL_LABEL } from "../labels";

type Scope = "me" | "unassigned" | "all";

const SCOPE_TABS: Array<{ id: Scope; label: string }> = [
  { id: "me", label: "Minhas" },
  { id: "unassigned", label: "Não atribuídas" },
  { id: "all", label: "Todas" },
];

function ConversationItem({
  item,
  active,
  onSelect,
}: {
  item: ConversationListItem;
  active: boolean;
  onSelect: () => void;
}) {
  const preview = item.lastMessage
    ? `${item.lastMessage.direction === "OUTBOUND" ? "Você: " : ""}${item.lastMessage.content ?? "[mídia]"}`
    : "Sem mensagens";
  const unread = item.unreadCount > 0;
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-current={active}
        className={cn(
          "flex w-full gap-3 border-b border-line px-4 py-3 text-left transition-colors",
          active ? "bg-accent-50" : "hover:bg-subtle",
        )}
      >
        <Avatar name={item.contact.name} src={item.contact.avatarUrl} size="md" />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span
              className={cn(
                "truncate text-sm text-fg",
                unread ? "font-semibold" : "font-medium",
              )}
            >
              {item.contact.name || "Contato sem nome"}
            </span>
            <span className="shrink-0 text-2xs text-fg-faint">
              {formatRelativeTime(item.lastMessageAt)}
            </span>
          </div>
          {item.contact.company && (
            <p className="truncate text-xs text-fg-muted">{item.contact.company.name}</p>
          )}
          <div className="mt-0.5 flex items-center justify-between gap-2">
            <p
              className={cn(
                "truncate text-xs",
                unread ? "font-medium text-fg" : "text-fg-muted",
              )}
            >
              {preview}
            </p>
            {unread && (
              <span
                aria-label={`${item.unreadCount} não lidas`}
                className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-accent-600 px-1.5 text-2xs font-semibold text-white"
              >
                {item.unreadCount}
              </span>
            )}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1">
            <Badge className="px-1.5 py-0 text-2xs">{CHANNEL_LABEL[item.channel.type]}</Badge>
            {item.queue && (
              <Badge tone="accent" className="px-1.5 py-0 text-2xs">
                {item.queue.name}
              </Badge>
            )}
          </div>
        </div>
      </button>
    </li>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-4 p-4" role="status" aria-label="Carregando conversas">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="flex gap-3">
          <Skeleton className="size-10 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ConversationList({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [scope, setScope] = useState<Scope>("all");
  const [status, setStatus] = useState<ConversationStatusValue | "">("OPEN");
  const [queueId, setQueueId] = useState("");
  const [search, setSearch] = useState("");
  const debounced = useDebouncedValue(search.trim(), 350);
  const queues = useQueues();

  const filters = useMemo(
    () => ({
      status: status || undefined,
      assignee: scope === "all" ? undefined : scope,
      queueId: queueId || undefined,
      search: debounced || undefined,
    }),
    [scope, status, queueId, debounced],
  );

  const query = useConversationList(filters);
  const items = query.data?.pages.flatMap((p) => p.conversations) ?? [];

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface">
      <div className="space-y-3 border-b border-line p-4 pb-0">
        <h1 className="text-base font-semibold text-fg">Inbox</h1>
        <Input
          aria-label="Buscar conversas"
          placeholder="Buscar contato ou empresa"
          icon={<Search />}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="flex gap-2">
          <Select
            aria-label="Status"
            value={status}
            onChange={(e) => setStatus(e.target.value as ConversationStatusValue | "")}
          >
            <option value="OPEN">Abertas</option>
            <option value="PENDING">Pendentes</option>
            <option value="RESOLVED">Resolvidas</option>
            <option value="">Todos os status</option>
          </Select>
          <Select
            aria-label="Fila"
            value={queueId}
            onChange={(e) => setQueueId(e.target.value)}
          >
            <option value="">Todas as filas</option>
            {queues.data?.map((q) => (
              <option key={q.id} value={q.id}>
                {q.name}
              </option>
            ))}
          </Select>
        </div>
        <Tabs<Scope>
          tabs={SCOPE_TABS}
          value={scope}
          onChange={setScope}
          idPrefix="inbox-scope"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {query.isPending ? (
          <ListSkeleton />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
        ) : items.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title="Nenhuma conversa"
            description="Ajuste os filtros ou aguarde novas mensagens."
          />
        ) : (
          <>
            <ul>
              {items.map((item) => (
                <ConversationItem
                  key={item.id}
                  item={item}
                  active={item.id === selectedId}
                  onSelect={() => onSelect(item.id)}
                />
              ))}
            </ul>
            {query.hasNextPage && (
              <div className="p-3 text-center">
                <Button
                  variant="ghost"
                  size="sm"
                  loading={query.isFetchingNextPage}
                  onClick={() => query.fetchNextPage()}
                >
                  Carregar mais
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
