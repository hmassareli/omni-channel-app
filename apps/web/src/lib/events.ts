// Cliente SSE (fetch + ReadableStream) com header Authorization e reconexão.
// EventSource nativo não permite enviar headers, por isso o parser é manual.
import { API_BASE_URL } from "./api";
import { supabase } from "./supabase";

export interface SseMessage {
  event: string;
  data: string;
}

/** Parser incremental do formato text/event-stream. */
export function createSseParser(onMessage: (msg: SseMessage) => void) {
  let buffer = "";
  let event = "message";
  let data: string[] = [];

  const flush = () => {
    if (data.length > 0) onMessage({ event, data: data.join("\n") });
    event = "message";
    data = [];
  };

  return (chunk: string) => {
    buffer += chunk;
    const lines = buffer.split(/\r\n|\n|\r/);
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line === "") flush();
      else if (line.startsWith(":")) continue; // comentário / heartbeat
      else {
        const idx = line.indexOf(":");
        const field = idx === -1 ? line : line.slice(0, idx);
        let value = idx === -1 ? "" : line.slice(idx + 1);
        if (value.startsWith(" ")) value = value.slice(1);
        if (field === "event") event = value;
        else if (field === "data") data.push(value);
      }
    }
  };
}

export type DeskEvent =
  | { type: "message.created"; conversationId: string; messageId: string }
  | { type: "conversation.updated"; conversationId: string };

/**
 * Abre o stream /events e reconecta com backoff exponencial (1s até 30s).
 * Retorna função que encerra a conexão.
 */
export function subscribeToEvents(
  onEvent: (event: DeskEvent) => void,
  onStatus?: (connected: boolean) => void,
): () => void {
  const controller = new AbortController();
  let attempt = 0;

  const run = async () => {
    while (!controller.signal.aborted) {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const response = await fetch(`${API_BASE_URL}/events`, {
          headers: {
            Accept: "text/event-stream",
            ...(session?.access_token
              ? { Authorization: `Bearer ${session.access_token}` }
              : {}),
          },
          signal: controller.signal,
        });
        if (!response.ok || !response.body) {
          throw new Error(`SSE HTTP ${response.status}`);
        }
        attempt = 0;
        onStatus?.(true);
        const parse = createSseParser((msg) => {
          if (msg.event !== "message.created" && msg.event !== "conversation.updated") return;
          try {
            const payload = JSON.parse(msg.data) as Record<string, string>;
            onEvent({ type: msg.event, ...payload } as DeskEvent);
          } catch {
            /* payload inválido: ignora */
          }
        });
        const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          parse(value);
        }
      } catch {
        if (controller.signal.aborted) return;
      }
      onStatus?.(false);
      const delay = Math.min(30_000, 1000 * 2 ** attempt++);
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, delay);
        controller.signal.addEventListener("abort", () => {
          clearTimeout(t);
          resolve();
        });
      });
    }
  };

  void run();
  return () => controller.abort();
}
