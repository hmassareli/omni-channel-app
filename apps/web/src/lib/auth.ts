// Sessão de login (autenticação própria da API).
// Access token curto (15 min) + refresh token com rotação, guardados no localStorage.
import type { AuthUser, LoginResponse } from "@omni/api/api-types";

export const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3333";

const STORAGE_KEY = "omni.session";
const REFRESH_MARGIN_MS = 60_000; // renova 1 min antes de expirar

interface StoredSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  user: AuthUser;
}

type Listener = (user: AuthUser | null) => void;
const listeners = new Set<Listener>();

function read(): StoredSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredSession) : null;
  } catch {
    return null;
  }
}

function write(session: StoredSession | null) {
  if (session) localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  else localStorage.removeItem(STORAGE_KEY);
  listeners.forEach((listener) => listener(session?.user ?? null));
}

async function post<T>(path: string, body: unknown, token?: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((data as { error?: string }).error || "Erro na requisição");
  }
  return data as T;
}

/** Usuário da sessão salva (sem chamar a API). */
export function getStoredUser(): AuthUser | null {
  return read()?.user ?? null;
}

/** Assina mudanças de sessão (login, logout, expiração). */
export function onAuthChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function login(email: string, password: string): Promise<AuthUser> {
  const data = await post<LoginResponse>("/auth/login", { email, password });
  write({
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
    expiresAt: Date.now() + data.expiresIn * 1000,
    user: data.user,
  });
  return data.user;
}

export async function logout(): Promise<void> {
  const session = read();
  write(null);
  if (session) {
    await post("/auth/logout", { refreshToken: session.refreshToken }).catch(() => {});
  }
}

/** Atualiza o usuário salvo (ex.: depois de trocar a senha). */
export function updateStoredUser(user: AuthUser) {
  const session = read();
  if (session) write({ ...session, user });
}

let refreshing: Promise<string | null> | null = null;

/** Troca o refresh token. Um só pedido por vez, mesmo com várias chamadas simultâneas. */
export function refreshSession(): Promise<string | null> {
  if (!refreshing) {
    refreshing = (async () => {
      const session = read();
      if (!session) return null;
      try {
        const data = await post<Omit<LoginResponse, "user">>("/auth/refresh", {
          refreshToken: session.refreshToken,
        });
        write({
          ...session,
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          expiresAt: Date.now() + data.expiresIn * 1000,
        });
        return data.accessToken;
      } catch {
        write(null); // sessão expirada ou revogada
        return null;
      }
    })().finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
}

/** Access token válido (renova se estiver perto de expirar), ou null sem sessão. */
export async function getAccessToken(): Promise<string | null> {
  const session = read();
  if (!session) return null;
  if (session.expiresAt - Date.now() > REFRESH_MARGIN_MS) return session.accessToken;
  return refreshSession();
}

export async function changePassword(currentPassword: string, newPassword: string) {
  const session = read();
  const token = await getAccessToken();
  await post(
    "/auth/change-password",
    { currentPassword, newPassword, refreshToken: session?.refreshToken },
    token ?? undefined,
  );
}
