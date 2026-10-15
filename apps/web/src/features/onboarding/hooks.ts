import { useQuery } from "@tanstack/react-query";
import * as api from "../../lib/api";

export const onboardingKeys = {
  status: (userId: string | undefined) => ["onboarding-status", userId] as const,
};

/**
 * Garante que o usuário existe no banco (signup) e informa se ainda precisa
 * concluir o onboarding. Resolve para `true` quando o onboarding é necessário.
 */
export function useNeedsOnboarding(user: {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
} | null) {
  return useQuery({
    queryKey: onboardingKeys.status(user?.id),
    enabled: !!user?.email,
    staleTime: Infinity,
    retry: false,
    queryFn: async () => {
      const meta = user!.user_metadata ?? {};
      const name =
        (meta.full_name as string | undefined) ||
        (meta.name as string | undefined) ||
        user!.email!.split("@")[0];

      try {
        await api.signupUser(name);
      } catch (error) {
        // "já cadastrado" é esperado a partir do segundo acesso
        if (!(error instanceof Error && error.message.includes("já cadastrado"))) {
          console.error("[Onboarding] Erro no signup:", error);
          return true;
        }
      }

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
