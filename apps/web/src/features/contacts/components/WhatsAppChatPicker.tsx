import { MessageSquare, Search } from "lucide-react";
import { useState } from "react";
import {
  Avatar,
  Button,
  EmptyState,
  Input,
  Spinner,
} from "../../../components/ui";
import type { WhatsAppChat } from "../../../lib/api";
import { useDebouncedValue } from "../../../lib/useDebouncedValue";
import { useWhatsAppChats } from "../hooks";
import { formatChatTime, formatPhone } from "../utils";

interface WhatsAppChatPickerProps {
  channelId: string | undefined;
  onSelect: (chat: WhatsAppChat) => void;
  onCreateManually: () => void;
}

export function WhatsAppChatPicker({
  channelId,
  onSelect,
  onCreateManually,
}: WhatsAppChatPickerProps) {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 400);
  const query = useWhatsAppChats(channelId, debouncedSearch, true);
  const chats = query.data?.pages.flatMap((page) => page.chats) ?? [];

  const manualAction = (
    <Button variant="secondary" size="sm" onClick={onCreateManually}>
      Criar contato manualmente
    </Button>
  );

  if (!channelId) {
    return (
      <EmptyState
        icon={MessageSquare}
        title="Nenhum canal WhatsApp configurado"
        description="Configure um canal primeiro ou crie o contato manualmente."
        action={manualAction}
      />
    );
  }

  return (
    <div>
      <div className="pb-3">
        <Input
          icon={<Search />}
          placeholder="Buscar por nome ou número..."
          aria-label="Buscar chats"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="max-h-80 overflow-y-auto rounded-lg border border-line">
        {query.isPending ? (
          <div className="flex items-center justify-center gap-2 p-8 text-sm text-fg-muted">
            <Spinner size="sm" /> Buscando chats...
          </div>
        ) : query.isError ? (
          <EmptyState
            icon={MessageSquare}
            title="Erro ao carregar chats"
            description="Não foi possível carregar os chats do WhatsApp. Tente novamente ou crie o contato manualmente."
            action={manualAction}
            className="py-8"
          />
        ) : chats.length === 0 ? (
          <EmptyState
            icon={MessageSquare}
            title="Nenhum chat disponível para vincular"
            description="Todos os chats já estão vinculados ou não há conversas."
            action={manualAction}
            className="py-8"
          />
        ) : (
          <ul className="divide-y divide-line">
            {chats.map((chat) => (
              <li key={chat.waId}>
                <button
                  type="button"
                  onClick={() => onSelect(chat)}
                  className="flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-subtle"
                >
                  <Avatar
                    name={chat.name || chat.waId}
                    src={chat.picture}
                    size="md"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium text-fg">
                        {chat.name || formatPhone(chat.waId)}
                      </p>
                      {chat.lastMessage && (
                        <span className="shrink-0 text-xs text-fg-faint">
                          {formatChatTime(chat.lastMessage.timestamp)}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-fg-muted">
                      {formatPhone(chat.waId)}
                    </p>
                    {chat.lastMessage && (
                      <p className="mt-0.5 truncate text-xs text-fg-faint">
                        {chat.lastMessage.fromMe && "Você: "}
                        {chat.lastMessage.body}
                      </p>
                    )}
                  </div>
                </button>
              </li>
            ))}
            {query.hasNextPage && (
              <li className="p-3 text-center">
                <Button
                  variant="ghost"
                  size="sm"
                  loading={query.isFetchingNextPage}
                  onClick={() => query.fetchNextPage()}
                >
                  Carregar mais chats
                </Button>
              </li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
