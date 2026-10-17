import { ChannelType } from "@prisma/client";
import { prisma } from "../../prisma";
import { applyDeliveryAck } from "../../services/conversations/ack";
import type { ChannelEvent } from "../types";

type AckEvent = Extract<ChannelEvent, { kind: "ack" }>;

/** message.ack do WAHA: acha o canal (sessão, depois número) e atualiza o status de entrega. */
export async function handleWhatsappAck(event: AckEvent): Promise<{ updated: number }> {
  const bySession = event.sessionKey
    ? await prisma.whatsAppChannel.findUnique({
        where: { sessionName: event.sessionKey },
        select: { channelId: true },
      })
    : null;
  const channelId =
    bySession?.channelId ??
    (event.externalIdentifier
      ? (
          await prisma.channel.findFirst({
            where: { type: ChannelType.WHATSAPP, externalIdentifier: event.externalIdentifier },
            select: { id: true },
          })
        )?.id
      : undefined);

  if (!channelId) return { updated: 0 };
  return { updated: await applyDeliveryAck(channelId, event.externalMessageId, event.ack) };
}
