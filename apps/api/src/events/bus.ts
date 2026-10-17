import { EventEmitter } from "events";

export type DeskEvent =
  | { type: "message.created"; operationId: string; conversationId: string; messageId: string }
  | { type: "conversation.updated"; operationId: string; conversationId: string }
  /** Status/conexão de um canal mudou (webhook session.status, health, reconectar...). */
  | { type: "channel.updated"; operationId: string; channelId: string };

const emitter = new EventEmitter();
emitter.setMaxListeners(0);

/** Publica um evento para os assinantes (SSE, métricas, ...). */
export function emitDeskEvent(event: DeskEvent) {
  emitter.emit("event", event);
}

/** Assina eventos; devolve a função para cancelar a assinatura. */
export function onDeskEvent(listener: (event: DeskEvent) => void): () => void {
  emitter.on("event", listener);
  return () => emitter.off("event", listener);
}
