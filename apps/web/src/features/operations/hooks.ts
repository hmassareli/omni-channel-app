import { useQuery } from "@tanstack/react-query";
import * as api from "../../lib/api";

export const operationKeys = {
  operation: ["operation"] as const,
  agents: ["agents"] as const,
  channels: ["channels"] as const,
};

/** Operation (empresa/tenant) do usuário autenticado. */
export function useOperation() {
  return useQuery({
    queryKey: operationKeys.operation,
    queryFn: api.getUserOperation,
  });
}

export function useAgents() {
  return useQuery({
    queryKey: operationKeys.agents,
    queryFn: api.getAgents,
  });
}

export function useChannels() {
  return useQuery({
    queryKey: operationKeys.channels,
    queryFn: api.getChannels,
  });
}
