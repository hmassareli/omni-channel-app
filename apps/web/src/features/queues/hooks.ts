import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as api from "../../lib/api";
import { inboxKeys, useQueues } from "../inbox/hooks";

export { useQueues };

function useQueueMutation<TVars, TData>(fn: (vars: TVars) => Promise<TData>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => qc.invalidateQueries({ queryKey: inboxKeys.queues }),
  });
}

export const useCreateQueue = () => useQueueMutation(api.createQueue);
export const useDeleteQueue = () => useQueueMutation(api.deleteQueue);
export const useRenameQueue = () =>
  useQueueMutation((v: { id: string; name: string }) => api.renameQueue(v.id, v.name));
export const useSetQueueMembers = () =>
  useQueueMutation((v: { id: string; agentIds: string[] }) =>
    api.setQueueMembers(v.id, v.agentIds),
  );
