import { Navigate, Outlet, useLocation } from "react-router-dom";
import { LoadingScreen } from "../../components/layout/LoadingScreen";
import { useNeedsOnboarding } from "../onboarding/hooks";
import { ChangePasswordPage } from "./pages/ChangePasswordPage";
import { LoginPage } from "./pages/LoginPage";
import { useSession } from "./authContext";

/**
 * Exige sessão; sem sessão, exibe a tela de login na própria URL.
 * Com senha provisória, exige a troca antes de liberar o app.
 */
export function RequireAuth() {
  const { user, loading, isAuthenticated } = useSession();
  if (loading) return <LoadingScreen />;
  if (!isAuthenticated || !user) return <LoginPage />;
  if (user.mustChangePassword) return <ChangePasswordPage />;
  return <Outlet />;
}

/** Redireciona para /onboarding enquanto a operação não estiver configurada. */
export function RequireOnboarding() {
  const { user } = useSession();
  const { data: needsOnboarding, isPending } = useNeedsOnboarding(user);
  const location = useLocation();

  if (isPending) return <LoadingScreen />;
  if (needsOnboarding) {
    return <Navigate to="/onboarding" replace state={{ from: location }} />;
  }
  return <Outlet />;
}
