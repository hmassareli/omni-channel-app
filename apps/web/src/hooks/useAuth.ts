import { useCallback, useEffect, useState } from "react";
import type { AuthUser } from "@omni/api/api-types";
import * as auth from "../lib/auth";
import { getCurrentUser } from "../lib/api";

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  error: Error | null;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>(() => ({
    user: auth.getStoredUser(),
    loading: auth.getStoredUser() !== null, // confirma a sessão salva na API
    error: null,
  }));

  useEffect(() => {
    const unsubscribe = auth.onAuthChange((user) =>
      setState((prev) => ({ ...prev, user, loading: false })),
    );

    // Revalida a sessão salva (pega papel/operação atualizados ou detecta expiração)
    if (auth.getStoredUser()) {
      getCurrentUser()
        .then((user) => auth.updateStoredUser(user))
        .catch(() => setState((prev) => ({ ...prev, loading: false })));
    }

    return unsubscribe;
  }, []);

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      await auth.login(email, password);
      return { success: true as const, error: null };
    } catch (error) {
      const err = error instanceof Error ? error : new Error("Não foi possível entrar");
      setState((prev) => ({ ...prev, loading: false, error: err }));
      return { success: false as const, error: err };
    }
  }, []);

  const signOut = useCallback(async () => {
    await auth.logout();
  }, []);

  /** Troca a senha e atualiza o usuário (libera o app após senha provisória). */
  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    await auth.changePassword(currentPassword, newPassword);
    auth.updateStoredUser(await getCurrentUser());
  }, []);

  return {
    user: state.user,
    loading: state.loading,
    error: state.error,
    isAuthenticated: !!state.user,
    signInWithEmail,
    signOut,
    changePassword,
  };
}
