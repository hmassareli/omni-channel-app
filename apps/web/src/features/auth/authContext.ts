import { createContext, useContext } from "react";
import type { useAuth } from "../../hooks/useAuth";

export type AuthContextValue = ReturnType<typeof useAuth>;

export const AuthContext = createContext<AuthContextValue | null>(null);

/** Acessa a sessão única criada por <AuthProvider>. */
export function useSession(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useSession deve ser usado dentro de <AuthProvider>");
  return ctx;
}
