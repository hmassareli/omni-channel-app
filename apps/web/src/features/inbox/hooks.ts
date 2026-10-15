import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useEffect } from "react";
import * as api from "../../lib/api";
import type { ConversationFilters, DeskNote } from "../../lib/api";
import { subscribeToEvents } from "../../lib/events";

export const inboxKeys = {
  all: ["conversations"] as const,
  list: (filters: ConversationFilters) => ["conversations", "list", filters] as const,
  detail: (id: string) => ["conversations", "detail", id] as const,
  messages: (id: string) => ["conversations", "messages", id] as const,
  notes: (id: string) => ["conversations", "notes", id] as const,
  queues: ["queues"] as const,
  metrics: ["metrics", "desk"] as const,
};

const LIST_PAGE = 30;
const MESSAGES_PAGE = 50;

export function useConversationList(filters: ConversationFilters) {
  return useInfiniteQuery({
    queryKey: inboxKeys.list(filters),
    queryFn: ({ pageParam }) =>
      api.getConversations({ ...filters, cursor: pageParam, limit: LIST_PAGE }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    placeholderData: keepPreviousData,
  });
}

export function useConversation(id: string | undefined) {
  return useQuery({
    queryKey: inboxKeys.detail(id ?? ""),
    queryFn: () => api.getConversation(id!),
    enabled: !!id,
  });
}

/** Mensagens em ordem cronológica; `fetchNextPage` carrega as mais antigas. */
export function useConversationMessages(id: string | undefined) {
  return useInfiniteQuery({
    queryKey: inboxKeys.messages(id ?? ""),
    queryFn: ({ pageParam }) =>
      api.getConversationMessages(id!, { before: pageParam, limit: MESSAGES_PAGE }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) =>
      last.hasMore && last.messages.length > 0
        ? last.messages[0].sentAt
        : undefined,
    enabled: !!id,
    select: (data) => ({
      messages: [...data.pages].reverse().flatMap((p) => p.messages),
    }),
  });
}

/** Notas internas. Se a API ainda não expõe a listagem, mantém só as criadas nesta sessão. */
export function useConversationNotes(id: string | undefined) {
  return useQuery({
    queryKey: inboxKeys.notes(id ?? ""),
    queryFn: () => api.getConversationNotes(id!),
    enabled: !!id,
    retry: false,
  });
}

export function useQueues() {
  return useQuery({ queryKey: inboxKeys.queues, queryFn: api.getQueues });
}

export function useSendMessage(conversationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (text: string) => api.sendConversationMessage(conversationId, text),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: inboxKeys.messages(conversationId) });
      void qc.invalidateQueries({ queryKey: inboxKeys.all });
    },
  });
}

export function useAddNote(conversationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (text: string) => api.addConversationNote(conversationId, text),
    onSuccess: (note) => {
      qc.setQueryData<DeskNote[]>(inboxKeys.notes(conversationId), (old) => [
        ...(old ?? []),
        note,
      ]);
    },
  });
}

function useConversationAction<TVars>(
  conversationId: string,
  fn: (vars: TVars) => Promise<api.ConversationDetail>,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (conversation) => {
      qc.setQueryData(inboxKeys.detail(conversationId), conversation);
      void qc.invalidateQueries({ queryKey: ["conversations", "list"] });
      void qc.invalidateQueries({ queryKey: inboxKeys.metrics });
    },
  });
}

export function useAssignConversation(id: string) {
  return useConversationAction(
    id,
    (data: { agentId?: string | null; queueId?: string | null }) =>
      api.assignConversation(id, data),
  );
}

export function useSetStatus(id: string) {
  return useConversationAction(id, (status: api.ConversationStatusValue) =>
    api.setConversationStatus(id, status),
  );
}

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.markConversationRead,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["conversations", "list"] }),
  });
}

/** Assina o SSE e invalida as queries afetadas. Montar uma vez (AppShell). */
export function useDeskEvents(enabled = true) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!enabled) return;
    return subscribeToEvents((event) => {
      void qc.invalidateQueries({ queryKey: ["conversations", "list"] });
      void qc.invalidateQueries({
        queryKey: inboxKeys.detail(event.conversationId),
      });
      void qc.invalidateQueries({ queryKey: inboxKeys.metrics });
      void qc.invalidateQueries({ queryKey: inboxKeys.notes(event.conversationId) });
      if (event.type === "message.created") {
        void qc.invalidateQueries({
          queryKey: inboxKeys.messages(event.conversationId),
        });
      }
    });
  }, [qc, enabled]);
}
