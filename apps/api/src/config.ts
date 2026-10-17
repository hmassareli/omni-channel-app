import dotenv from "dotenv";
import path from "path";

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
  /** Onde os arquivos de mídia baixados ficam (em produção: volume em /app/data). */
  get mediaDir(): string {
    return path.resolve(process.env.MEDIA_DIR?.trim() || path.join(process.cwd(), "data", "media"));
  },
  /** Tamanho máximo de um arquivo de mídia (padrão 50 MB). */
  get mediaMaxBytes(): number {
    const configured = Number(process.env.MEDIA_MAX_BYTES);
    return Number.isFinite(configured) && configured > 0 ? configured : 50 * 1024 * 1024;
  },
};
