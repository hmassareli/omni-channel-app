import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import * as api from "../../lib/api";
import { companyKeys } from "../companies/hooks";

/** Cria contato manualmente e atualiza empresa/timeline. */
export function useCreateContact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.createContact,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: companyKeys.all }),
  });
}

/** Vincula um chat do WhatsApp a uma empresa. */
export function useLinkWhatsAppChat() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.linkWhatsAppChat,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: companyKeys.all }),
  });
}

/** Chats do WhatsApp (ainda não vinculados) com busca e paginação. */
export function useWhatsAppChats(
  channelId: string | undefined,
  search: string,
  enabled: boolean,
) {
  return useInfiniteQuery({
    queryKey: ["whatsapp-chats", channelId, search],
    enabled: enabled && !!channelId,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const result = await api.getWhatsAppChats(channelId!, {
        search: search || undefined,
        limit: search ? 100 : 50,
        offset: pageParam,
      });
      return {
        ...result,
        chats: result.chats.filter((chat) => !chat.linkedToCompany),
      };
    },
    getNextPageParam: (last) => (last.hasMore ? last.nextOffset : undefined),
  });
}

/** Detalhe do contato (identidades, tags, empresa e conversas). */
export function useContact(id: string | undefined) {
  return useQuery({
    queryKey: ["contacts", "detail", id ?? ""] as const,
    queryFn: () => api.getContact(id!),
    enabled: !!id,
  });
}
