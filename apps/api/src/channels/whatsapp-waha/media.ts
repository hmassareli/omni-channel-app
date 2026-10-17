// ============================================================================
// Download de mídia do WAHA.
// O WAHA devolve `media.url` com o host interno dele (ex.: http://localhost:80);
// trocamos a base por WAHA_API_URL e autenticamos com X-Api-Key.
// Arquivos do WAHA expiram em minutos: o download roda logo na chegada (job).
// ============================================================================

const FILES_PREFIX = "/api/files/";

export class MediaSourceError extends Error {
  constructor(
    message: string,
    /** false = não adianta tentar de novo. */
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "MediaSourceError";
  }
}

/** Reescreve a URL do WAHA para a base configurada. Só aceita /api/files/. */
export function resolveWahaMediaUrl(sourceUrl: string): string {
  const base = process.env.WAHA_API_URL?.trim().replace(/\/+$/, "");
  if (!base) throw new MediaSourceError("WAHA_API_URL não configurada", false);

  let parsed: URL;
  try {
    parsed = new URL(sourceUrl, "http://waha.local");
  } catch {
    throw new MediaSourceError("URL de mídia inválida", false);
  }

  const path = parsed.pathname;
  if (!path.startsWith(FILES_PREFIX) || path.includes("..")) {
    throw new MediaSourceError("URL de mídia fora de /api/files", false);
  }
  return `${base}${path}${parsed.search}`;
}

export async function fetchWahaMedia(sourceUrl: string): Promise<Response> {
  const url = resolveWahaMediaUrl(sourceUrl);
  const headers: Record<string, string> = {};
  const apiKey = process.env.WAHA_API_KEY?.trim();
  if (apiKey) headers["X-Api-Key"] = apiKey;

  return fetch(url, {
    headers,
    redirect: "error",
    signal: AbortSignal.timeout(120_000),
  });
}
