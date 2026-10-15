import { MessageSquare } from "lucide-react";
import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { EmptyState, ErrorState, Skeleton } from "../../../components/ui";
import { cn } from "../../../lib/cn";
import { ContextPanel } from "../components/ContextPanel";
import { Composer } from "../components/Composer";
import { ConversationHeader } from "../components/ConversationHeader";
import { ConversationList } from "../components/ConversationList";
import { MessageThread } from "../components/MessageThread";
import { useConversation, useMarkRead } from "../hooks";

function ConversationView({ id, onBack }: { id: string; onBack: () => void }) {
  const query = useConversation(id);
  const { mutate: markRead } = useMarkRead();
  const unread = query.data?.unreadCount ?? 0;

  // Marca como lida ao abrir e sempre que chegar mensagem nova com a conversa aberta
  useEffect(() => {
    if (unread > 0) markRead(id);
  }, [id, unread, markRead]);

  if (query.isPending) {
    return (
      <div className="space-y-4 p-6" role="status" aria-label="Carregando conversa">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (query.isError) {
    return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  }
  const conversation = query.data;
  return (
    <>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <ConversationHeader conversation={conversation} onBack={onBack} />
        <MessageThread conversationId={id} />
        <Composer conversationId={id} />
      </div>
      <aside
        aria-label="Contexto"
        className="hidden w-80 shrink-0 border-l border-line xl:block"
      >
        <ContextPanel conversation={conversation} />
      </aside>
    </>
  );
}

/** Mesa de atendimento: lista | conversa | contexto. Um painel por vez em telas estreitas. */
export default function InboxPage() {
  const [params, setParams] = useSearchParams();
  const selectedId = params.get("conversation");

  const select = (id: string | null) =>
    setParams(id ? { conversation: id } : {}, { replace: false });

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <section
        aria-label="Conversas"
        className={cn(
          "w-full shrink-0 border-r border-line lg:block lg:w-80 xl:w-96",
          selectedId ? "hidden" : "block",
        )}
      >
        <ConversationList selectedId={selectedId} onSelect={select} />
      </section>
      <section
        aria-label="Conversa"
        className={cn("min-w-0 flex-1 bg-canvas lg:flex", selectedId ? "flex" : "hidden")}
      >
        {selectedId ? (
          <ConversationView key={selectedId} id={selectedId} onBack={() => select(null)} />
        ) : (
          <EmptyState
            className="w-full"
            icon={MessageSquare}
            title="Selecione uma conversa"
            description="Escolha uma conversa na lista para ver as mensagens."
          />
        )}
      </section>
    </div>
  );
}
