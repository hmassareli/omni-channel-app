import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "../../lib/api";
import { operationKeys } from "../operations/hooks";

export const teamKeys = { users: ["team-users"] as const };

export function useTeamUsers() {
  return useQuery({ queryKey: teamKeys.users, queryFn: api.getTeamUsers });
}

function useTeamMutation<TVars, TData>(fn: (vars: TVars) => Promise<TData>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: teamKeys.users });
      qc.invalidateQueries({ queryKey: operationKeys.agents });
    },
  });
}

export const useInviteUser = () => useTeamMutation(api.inviteUser);
export const useResetPassword = () => useTeamMutation(api.resetUserPassword);
export const useRemoveUser = () => useTeamMutation(api.removeUser);
export const useLinkAgent = () =>
  useTeamMutation((v: { agentId: string; userId: string }) => api.linkAgentToUser(v.agentId, v.userId));
