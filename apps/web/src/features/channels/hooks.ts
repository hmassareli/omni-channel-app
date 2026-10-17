import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "../../lib/api";
import { operationKeys } from "../operations/hooks";

export const channelKeys = {
  list: operationKeys.channels,
  /** Fora do prefixo ["channels"]: o evento channel.updated não dispara nova consulta ao WAHA. */
  health: (id: string) => ["channel-health", id] as const,
};

/** Canais da operação; refaz de tempos em tempos (o monitor do servidor atualiza o status). */
export function useChannelList() {
  return useQuery({
    queryKey: channelKeys.list,
    queryFn: api.getChannels,
    refetchInterval: 2 * 60_000,
  });
}

/** Checagem ao vivo no WhatsApp; roda ao abrir a tela e em "Verificar agora". */
export function useChannelHealth(id: string, enabled = true) {
  return useQuery({
    queryKey: channelKeys.health(id),
    queryFn: () => api.getChannelHealth(id),
    enabled,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  });
}

export function useCreateWhatsAppChannel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.createWhatsAppChannel,
    // Mesmo com falha no WAHA o canal é criado (FAILED): atualiza a lista nos dois casos.
    onSettled: () => qc.invalidateQueries({ queryKey: channelKeys.list }),
  });
}

export function useDeleteChannel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.deleteChannel,
    onSuccess: () => qc.invalidateQueries({ queryKey: channelKeys.list }),
  });
}
