import { registerChannelAdapter } from "./registry";
import { whatsappWahaAdapter } from "./whatsapp-waha/adapter";

/** Registra todos os adaptadores de canal disponíveis. Idempotente. */
export function registerAllChannels() {
  registerChannelAdapter(whatsappWahaAdapter);
}
