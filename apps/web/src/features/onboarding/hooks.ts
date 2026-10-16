import { useQuery } from "@tanstack/react-query";
import * as api from "../../lib/api";

export const onboardingKeys = {
  status: (userId: string | undefined) => ["onboarding-status", userId] as const,
};

/** Informa se a operação do usuário ainda precisa concluir o onboarding. */
export function useNeedsOnboarding(user: { id: string } | null) {
  return useQuery({
    queryKey: onboardingKeys.status(user?.id),
    enabled: !!user,
    staleTime: Infinity,
    retry: false,
    queryFn: async () => {
      try {
        const operation = await api.getUserOperation();
        return !operation?.onboardingCompleted;
      } catch (error) {
        console.error("[Onboarding] Erro ao buscar operation:", error);
        return true;
      }
    },
  });
}
