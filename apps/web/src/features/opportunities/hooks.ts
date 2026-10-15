import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "../../lib/api";
import { companyKeys } from "../companies/hooks";

export const opportunityKeys = {
  all: ["opportunities"] as const,
  kanban: ["opportunities", "kanban"] as const,
  detail: (id: string) => ["opportunities", "detail", id] as const,
  timeline: (id: string) => ["opportunities", "timeline", id] as const,
};

export const stageKeys = {
  all: ["stages"] as const,
};

export function useKanban() {
  return useQuery({
    queryKey: opportunityKeys.kanban,
    queryFn: api.getOpportunitiesKanban,
  });
}

export function useOpportunity(id: string | undefined) {
  return useQuery({
    queryKey: opportunityKeys.detail(id ?? ""),
    queryFn: () => api.getOpportunity(id!),
    enabled: !!id,
  });
}

export function useOpportunityTimeline(id: string | undefined) {
  return useQuery({
    queryKey: opportunityKeys.timeline(id ?? ""),
    queryFn: () => api.getOpportunityTimeline(id!, { limit: 100 }),
    enabled: !!id,
  });
}

export function useStages() {
  return useQuery({
    queryKey: stageKeys.all,
    queryFn: api.getStages,
  });
}

/** Invalida tudo que depende de oportunidades/estágios (aguarda o refetch). */
function useInvalidatePipeline() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: opportunityKeys.all }),
      queryClient.invalidateQueries({ queryKey: stageKeys.all }),
      queryClient.invalidateQueries({ queryKey: companyKeys.all }),
    ]);
}

export function useCreateOpportunity() {
  const invalidate = useInvalidatePipeline();
  return useMutation({
    mutationFn: api.createOpportunity,
    onSuccess: invalidate,
  });
}

export function useMoveOpportunity() {
  const invalidate = useInvalidatePipeline();
  return useMutation({
    mutationFn: ({ id, stageId }: { id: string; stageId: string }) =>
      api.moveOpportunity(id, stageId),
    onSuccess: invalidate,
  });
}

/** Move a oportunidade via PUT (usado pelo kanban). */
export function useUpdateOpportunityStage() {
  const invalidate = useInvalidatePipeline();
  return useMutation({
    mutationFn: ({ id, stageId }: { id: string; stageId: string }) =>
      api.updateOpportunity(id, { stageId }),
    onSuccess: invalidate,
  });
}

export function useCreateStage() {
  const invalidate = useInvalidatePipeline();
  return useMutation({ mutationFn: api.createStage, onSuccess: invalidate });
}

export function useUpdateStage() {
  const invalidate = useInvalidatePipeline();
  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: Parameters<typeof api.updateStage>[1];
    }) => api.updateStage(id, data),
    onSuccess: invalidate,
  });
}

export function useDeleteStage() {
  const invalidate = useInvalidatePipeline();
  return useMutation({ mutationFn: api.deleteStage, onSuccess: invalidate });
}

export function useReorderStages() {
  const invalidate = useInvalidatePipeline();
  return useMutation({
    mutationFn: ({
      operationId,
      stageIds,
    }: {
      operationId: string;
      stageIds: string[];
    }) => api.reorderStages(operationId, stageIds),
    onSuccess: invalidate,
  });
}
