import type { ChannelType } from "@prisma/client";
import type { ChannelAdapter } from "./types";

const adapters = new Map<ChannelType, ChannelAdapter>();

export function registerChannelAdapter(adapter: ChannelAdapter) {
  adapters.set(adapter.type, adapter);
}

export function getChannelAdapter(type: ChannelType): ChannelAdapter {
  const adapter = adapters.get(type);
  if (!adapter) {
    throw new Error(`Nenhum adaptador registrado para o canal ${type}`);
  }
  return adapter;
}
