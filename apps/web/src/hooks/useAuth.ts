import { useEffect, useState, useCallback } from "react";
import type { User, Session, AuthError, AuthChangeEvent } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  error: AuthError | null;
}

export function useAuth() {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    session: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    // Busca a sessão atual ao carregar
    const getInitialSession = async () => {
      try {
        const {
          data: { session },
          error,
        } = await supabase.auth.getSession();

        if (error) {
          setAuthState((prev) => ({ ...prev, error, loading: false }));
          return;
        }

        setAuthState({
          user: session?.user ?? null,
          session: session,
          loading: false,
          error: null,
        });
      } catch {
        setAuthState((prev) => ({ ...prev, loading: false }));
      }
    };

    getInitialSession();

    // Escuta mudanças na autenticação
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => {
      setAuthState({
        user: session?.user ?? null,
        session: session,
        loading: false,
        error: null,
      });
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const signInWithGoogle = useCallback(async () => {
    setAuthState((prev) => ({ ...prev, loading: true, error: null }));

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo:
          import.meta.env.VITE_REDIRECT_AUTH_URL ||
          `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setAuthState((prev) => ({ ...prev, error, loading: false }));
    }
  }, []);

  const signInWithEmail = useCallback(
    async (email: string, password: string) => {
      setAuthState((prev) => ({ ...prev, loading: true, error: null }));

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setAuthState((prev) => ({ ...prev, error, loading: false }));
        return { success: false, error };
      }

      setAuthState({
        user: data.user,
        session: data.session,
        loading: false,
        error: null,
      });

      return { success: true, error: null };
    },
    []
  );

  const signUpWithEmail = useCallback(
    async (email: string, password: string, fullName?: string) => {
      setAuthState((prev) => ({ ...prev, loading: true, error: null }));

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
          },
        },
      });

      if (error) {
        setAuthState((prev) => ({ ...prev, error, loading: false }));
        return { success: false, error };
      }

      // Após signup, o usuário pode precisar confirmar o email
      setAuthState((prev) => ({ ...prev, loading: false }));

      return { success: true, user: data.user, error: null };
    },
    []
  );

  const signOut = useCallback(async () => {
    setAuthState((prev) => ({ ...prev, loading: true }));

    const { error } = await supabase.auth.signOut();

    if (error) {
      setAuthState((prev) => ({ ...prev, error, loading: false }));
      return;
    }

    setAuthState({
      user: null,
      session: null,
      loading: false,
      error: null,
    });
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    });

    return { success: !error, error };
  }, []);

  return {
    user: authState.user,
    session: authState.session,
    loading: authState.loading,
    error: authState.error,
    isAuthenticated: !!authState.user,
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    signOut,
    resetPassword,
  };
}
