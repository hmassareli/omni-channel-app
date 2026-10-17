import { ChannelType } from "@prisma/client";
import { prisma } from "../../prisma";
import type { ChannelAdapter } from "../types";
import { describeWahaPayload } from "./extract";
import { fetchWahaMedia } from "./media";
import { parseWahaWebhook } from "./parse";
import * as waha from "./waha";

/** Adaptador do WhatsApp via WAHA. */
export const whatsappWahaAdapter: ChannelAdapter = {
  type: ChannelType.WHATSAPP,

  parseWebhook: parseWahaWebhook,

  fetchMedia: (_channel, sourceUrl) => fetchWahaMedia(sourceUrl),

  describeStoredPayload: describeWahaPayload,

  async send(channel, message) {
    const whatsappChannel = await prisma.whatsAppChannel.findUnique({
      where: { channelId: channel.id },
    });

    if (!whatsappChannel) {
      throw new Error(`Canal ${channel.id} não possui sessão WAHA configurada`);
    }

    const sent = await waha.sendTextMessage({
      session: whatsappChannel.sessionName,
      chatId: `${message.to}@c.us`,
      text: message.text,
    });

    return { externalId: sent.id ?? null };
  },
};
