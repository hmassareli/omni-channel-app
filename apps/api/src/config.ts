import dotenv from "dotenv";

dotenv.config();

function list(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

/**
 * Configuração lida do ambiente. Leitura tardia (getter) para que os testes
 * possam alterar process.env antes de construir o app.
 */
export const config = {
  get corsOrigins(): string[] {
    const configured = list(process.env.CORS_ORIGINS);
    if (configured.length > 0 || process.env.NODE_ENV === "production") {
      return configured;
    }
    return ["http://localhost:5173"]; // Vite dev server
  },
  /** Segredo compartilhado exigido nos webhooks de canais. */
  get webhookSecret(): string | undefined {
    return process.env.WEBHOOK_SECRET?.trim() || undefined;
  },
  get supabaseUrl(): string | undefined {
    return process.env.SUPABASE_URL?.trim() || undefined;
  },
  get supabaseAnonKey(): string | undefined {
    return process.env.SUPABASE_ANON_KEY?.trim() || undefined;
  },
  /** Segredo HS256 legado do Supabase. Sem ele, usa o JWKS do projeto. */
  get supabaseJwtSecret(): string | undefined {
    return process.env.SUPABASE_JWT_SECRET?.trim() || undefined;
  },
  /** Domínios autorizados a se auto-cadastrar. Vazio = qualquer domínio. */
  get signupAllowedDomains(): string[] {
    return list(process.env.SIGNUP_ALLOWED_DOMAINS).map((d) => d.toLowerCase());
  },
};
