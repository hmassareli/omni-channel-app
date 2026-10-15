import { useQueryClient } from "@tanstack/react-query";
import { Navigate, useNavigate } from "react-router-dom";
import { LoadingScreen } from "../../components/layout/LoadingScreen";
import { useSession } from "../auth/authContext";
import { useNeedsOnboarding, onboardingKeys } from "./hooks";
import { OnboardingPage } from "./OnboardingPage";

/** Rota /onboarding: bloqueia quem já concluiu e libera o app ao finalizar. */
export function OnboardingRoute() {
  const { user } = useSession();
  const { data: needsOnboarding, isPending } = useNeedsOnboarding(user);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  if (isPending) return <LoadingScreen />;
  if (needsOnboarding === false) return <Navigate to="/" replace />;

  return (
    <OnboardingPage
      onComplete={() => {
        queryClient.setQueryData(onboardingKeys.status(user?.id), false);
        navigate("/", { replace: true });
      }}
    />
  );
}
