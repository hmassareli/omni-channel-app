import { describe, expect, it } from "vitest";
import { describeWahaPayload, mapWahaAck } from "../../src/channels/whatsapp-waha/extract";
import { parseWahaWebhook } from "../../src/channels/whatsapp-waha/parse";
import type { ChannelEvent } from "../../src/channels/types";

const BUSINESS = "5511900000000";

function body(payload: Record<string, unknown>) {
  return {
    event: "message.any",
    session: "sessao-1",
    me: { id: `${BUSINESS}@c.us` },
    payload: {
      id: "false_5511988887777@c.us_ABC",
      timestamp: 1_760_000_000,
      from: "5511988887777@c.us",
      to: `${BUSINESS}@c.us`,
      fromMe: false,
      body: "",
      hasMedia: false,
      ...payload,
    },
  };
}

function parseMessage(payload: Record<string, unknown>) {
  const [event] = parseWahaWebhook(body(payload));
  if (event?.kind !== "message") throw new Error(`esperava message, veio ${JSON.stringify(event)}`);
  return event.message;
}

const fileUrl = (name: string) => `http://localhost:80/api/files/sessao-1/${name}`;

describe("extração de mídia do WAHA", () => {
  it("foto com legenda: texto = legenda, mídia image com sourceUrl", () => {
    const message = parseMessage({
      hasMedia: true,
      body: "Olha isso",
      media: { url: fileUrl("a.jpeg"), mimetype: "image/jpeg" },
    });
    expect(message.text).toBe("Olha isso");
    expect(message.hasMedia).toBe(true);
    expect(message.media).toMatchObject({
      kind: "image",
      mimetype: "image/jpeg",
      caption: "Olha isso",
      sourceUrl: fileUrl("a.jpeg"),
    });
  });

  it("mídia sem legenda: texto null (nunca '<media>')", () => {
    const message = parseMessage({
      hasMedia: true,
      body: "",
      media: { url: fileUrl("b.jpeg"), mimetype: "image/jpeg" },
    });
    expect(message.text).toBeNull();
    expect(message.media?.caption).toBeNull();
  });

  it("figurinha: image/webp", () => {
    const message = parseMessage({
      hasMedia: true,
      media: { url: fileUrl("s.webp"), mimetype: "image/webp" },
    });
    expect(message.media?.kind).toBe("sticker");
    expect(message.text).toBeNull();
  });

  it("figurinha pela indicação em _data (sem mimetype)", () => {
    const message = parseMessage({
      hasMedia: true,
      media: { url: fileUrl("s2") },
      _data: { Message: { stickerMessage: { isAnimated: false } } },
    });
    expect(message.media?.kind).toBe("sticker");
  });

  it("vídeo", () => {
    const message = parseMessage({
      hasMedia: true,
      media: { url: fileUrl("v.mp4"), mimetype: "video/mp4" },
    });
    expect(message.media?.kind).toBe("video");
  });

  it("áudio de voz: audio/ogg; codecs=opus", () => {
    const message = parseMessage({
      hasMedia: true,
      media: { url: fileUrl("v.oga"), mimetype: "audio/ogg; codecs=opus" },
    });
    expect(message.media).toMatchObject({ kind: "voice", mimetype: "audio/ogg; codecs=opus" });
  });

  it("áudio comum (mp3)", () => {
    const message = parseMessage({
      hasMedia: true,
      media: { url: fileUrl("m.mp3"), mimetype: "audio/mpeg" },
    });
    expect(message.media?.kind).toBe("audio");
  });

  it("documento com nome do arquivo", () => {
    const message = parseMessage({
      hasMedia: true,
      body: "segue o boleto",
      media: { url: fileUrl("d.pdf"), mimetype: "application/pdf", filename: "boleto.pdf" },
    });
    expect(message.media).toMatchObject({
      kind: "document",
      filename: "boleto.pdf",
      caption: "segue o boleto",
    });
  });

  it("documento: nome vindo de _data.Message.documentMessage", () => {
    const message = parseMessage({
      hasMedia: true,
      media: {
        url: fileUrl("d.docx"),
        mimetype: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      },
      _data: { Message: { documentMessage: { fileName: "contrato.docx" } } },
    });
    expect(message.media).toMatchObject({ kind: "document", filename: "contrato.docx" });
  });

  it("localização (sem body e hasMedia=false) não é descartada", () => {
    const message = parseMessage({
      location: { latitude: -23.55, longitude: "-46.63", description: "Escritório" },
    });
    expect(message.text).toBeNull();
    expect(message.media).toMatchObject({
      kind: "location",
      location: { lat: -23.55, lng: -46.63, name: "Escritório" },
    });
    expect(message.media?.sourceUrl).toBeUndefined();
  });

  it("contato (vCard)", () => {
    const message = parseMessage({
      vCards: ["BEGIN:VCARD\nVERSION:3.0\nFN:Maria Souza\nTEL;type=CELL;waid=5511977776666:+55 11 97777-6666\nEND:VCARD"],
    });
    expect(message.media).toMatchObject({
      kind: "contact",
      contact: { name: "Maria Souza", phone: "5511977776666" },
    });
  });

  it("vCards vazio não vira contato; texto puro sem mídia", () => {
    const message = parseMessage({ body: "oi", vCards: [] });
    expect(message.media).toBeNull();
    expect(message.text).toBe("oi");
  });

  it("resposta: replyTo vira replyToExternalId + quotedText", () => {
    const message = parseMessage({
      body: "sim",
      replyTo: { id: "3EB0QUOTED", participant: "5511900000000@c.us", body: "Pode amanhã?" },
    });
    expect(message.replyToExternalId).toBe("3EB0QUOTED");
    expect(message.quotedText).toBe("Pode amanhã?");
  });

  it("mensagem enviada (fromMe) carrega o ack", () => {
    const message = parseMessage({
      id: "true_5511988887777@c.us_XYZ",
      fromMe: true,
      body: "ok",
      to: "5511988887777@c.us",
      from: `${BUSINESS}@c.us`,
      ack: 2,
      ackName: "DEVICE",
    });
    expect(message.direction).toBe("OUTBOUND");
    expect(message.ack).toBe("delivered");
  });

  it("message.ack vira evento ack", () => {
    const events = parseWahaWebhook({
      event: "message.ack",
      session: "sessao-1",
      me: { id: `${BUSINESS}@c.us` },
      payload: { id: "true_5511988887777@c.us_XYZ", ack: 3, ackName: "READ", fromMe: true },
    });
    expect(events).toEqual<ChannelEvent[]>([
      {
        kind: "ack",
        sessionKey: "sessao-1",
        externalIdentifier: BUSINESS,
        externalMessageId: "true_5511988887777@c.us_XYZ",
        ack: "read",
      },
    ]);
  });

  it("mapWahaAck: ERROR/desconhecido = null; PLAYED = read", () => {
    expect(mapWahaAck(-1, "ERROR")).toBeNull();
    expect(mapWahaAck(4)).toBe("read");
    expect(mapWahaAck(0)).toBe("pending");
    expect(mapWahaAck(1)).toBe("sent");
  });

  it("describeWahaPayload em payload antigo gravado", () => {
    const description = describeWahaPayload({
      fromMe: true,
      hasMedia: true,
      media: { url: fileUrl("x.webp"), mimetype: "image/webp" },
      ack: 3,
    });
    expect(description.media?.kind).toBe("sticker");
    expect(description.ack).toBe("read");
  });
});
