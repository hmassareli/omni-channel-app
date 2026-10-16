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
};
