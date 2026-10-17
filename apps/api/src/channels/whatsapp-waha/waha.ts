import { request } from "undici";

// ============================================================================
// WAHA API Service
// Client para interação com o WAHA (WhatsApp HTTP API)
// Docs: https://waha.devlike.pro/docs/
// ============================================================================

const WAHA_API_URL = process.env.WAHA_API_URL;
const WAHA_API_KEY = process.env.WAHA_API_KEY;

if (!WAHA_API_URL) {
  console.warn(
    "[WAHA] WAHA_API_URL não configurada - funcionalidades WhatsApp desabilitadas",
  );
}

// ============================================================================
// Types
// ============================================================================

export type WAHASessionStatus =
  | "STOPPED"
  | "STARTING"
  | "SCAN_QR_CODE"
  | "WORKING"
  | "FAILED";

export interface WAHAWebhookConfig {
  url: string;
  events: string[];
  hmac?: { key: string } | null;
  customHeaders?: Array<{ name: string; value: string }> | null;
}

export interface WAHASession {
  name: string;
  status: WAHASessionStatus;
  config?: {
    proxy?: string;
    webhooks?: WAHAWebhookConfig[];
  } | null;
  me?: {
    id: string;
    pushName: string;
  };
  engine?: {
    engine: string;
  };
}

export interface WAHASessionCreate {
  name: string;
  start?: boolean;
  config?: {
    proxy?: string;
    webhooks?: WAHAWebhookConfig[];
  };
}

export interface WAHAQRCode {
  value: string; // QR code string para gerar imagem
  mimetype?: string;
  data?: string; // Base64 da imagem se solicitado
}

export interface WAHAError {
  error: string;
  message: string;
}

/** Erro devolvido pelo WAHA (preserva o status HTTP). */
export class WahaRequestError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
    this.name = "WahaRequestError";
  }
}

/** A sessão não existe no WAHA (404 / "Session not found"). */
export function isWahaSessionNotFound(error: unknown): boolean {
  if (error instanceof WahaRequestError && error.statusCode === 404) return true;
  return error instanceof Error && /session .*not found|not found.*session/i.test(error.message);
}

/** Eventos de webhook que o app consome. */
export const WAHA_WEBHOOK_EVENTS = ["message.any", "message.ack", "session.status"];

/** Configuração de webhook (URL + header x-webhook-secret, se houver segredo). */
export function buildWebhookConfig(
  webhookUrl: string,
  events: string[] = WAHA_WEBHOOK_EVENTS,
): WAHAWebhookConfig {
  return {
    url: webhookUrl,
    events,
    ...(process.env.WEBHOOK_SECRET
      ? {
          customHeaders: [
            { name: "x-webhook-secret", value: process.env.WEBHOOK_SECRET },
          ],
        }
      : {}),
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

function getHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (WAHA_API_KEY) {
    headers["X-Api-Key"] = WAHA_API_KEY;
  }
  return headers;
}

async function wahaRequest<T>(
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
): Promise<T> {
  if (!WAHA_API_URL) {
    throw new Error("WAHA_API_URL não configurada");
  }

  const url = `${WAHA_API_URL}${path}`;

  const response = await request(url, {
    method,
    headers: getHeaders(),
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.body.text();
  let data: unknown = undefined;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text };
    }
  }

  if (response.statusCode >= 400) {
    const error = (data ?? {}) as Partial<WAHAError>;
    throw new WahaRequestError(
      `WAHA Error: ${error.message || error.error || `HTTP ${response.statusCode}`}`,
      response.statusCode,
    );
  }

  return data as T;
}

// ============================================================================
// Session Management
// ============================================================================

/**
 * Lista todas as sessões do WAHA
 */
export async function listSessions(): Promise<WAHASession[]> {
  return wahaRequest<WAHASession[]>("GET", "/api/sessions");
}

/**
 * Obtém detalhes de uma sessão específica
 */
export async function getSession(sessionName: string): Promise<WAHASession> {
  return wahaRequest<WAHASession>("GET", `/api/sessions/${sessionName}`);
}

/**
 * Cria uma nova sessão no WAHA
 */
export async function createSession(
  options: WAHASessionCreate,
): Promise<WAHASession> {
  return wahaRequest<WAHASession>("POST", "/api/sessions", options);
}

/**
 * Inicia uma sessão existente
 */
export async function startSession(sessionName: string): Promise<WAHASession> {
  return wahaRequest<WAHASession>("POST", `/api/sessions/${sessionName}/start`);
}

/**
 * Para uma sessão
 */
export async function stopSession(sessionName: string): Promise<void> {
  await wahaRequest<void>("POST", `/api/sessions/${sessionName}/stop`);
}

/**
 * Remove uma sessão completamente
 */
export async function deleteSession(sessionName: string): Promise<void> {
  await wahaRequest<void>("DELETE", `/api/sessions/${sessionName}`);
}

/**
 * Faz logout da sessão (desconecta do WhatsApp mas mantém a sessão)
 */
export async function logoutSession(sessionName: string): Promise<void> {
  await wahaRequest<void>("POST", `/api/sessions/${sessionName}/logout`);
}

// ============================================================================
// QR Code & Authentication
// ============================================================================

/**
 * Obtém o QR code para autenticação
 * @param sessionName Nome da sessão
 * @param format "image" retorna imagem PNG, "raw" retorna JSON com string do QR
 */
export async function getQRCode(
  sessionName: string,
  format: "image" | "raw" = "image",
): Promise<WAHAQRCode> {
  if (!WAHA_API_URL) {
    throw new Error("WAHA_API_URL não configurada");
  }

  const url = `${WAHA_API_URL}/api/${sessionName}/auth/qr?format=${format}`;

  const response = await request(url, {
    method: "GET",
    headers: getHeaders(),
  });

  if (response.statusCode >= 400) {
    // Tenta ler como JSON para pegar a mensagem de erro
    let message = `HTTP ${response.statusCode}`;
    try {
      const error = (await response.body.json()) as Partial<WAHAError>;
      message = error.message || error.error || message;
    } catch {
      // corpo não-JSON: fica o status HTTP
    }
    throw new WahaRequestError(`WAHA Error: ${message}`, response.statusCode);
  }

  if (format === "image") {
    // Quando format=image, WAHA retorna PNG binário
    const buffer = Buffer.from(await response.body.arrayBuffer());
    const base64 = buffer.toString("base64");
    return {
      value: "", // Não temos o valor raw quando pedimos imagem
      mimetype: "image/png",
      data: base64,
    };
  } else {
    // Quando format=raw, retorna JSON
    return (await response.body.json()) as WAHAQRCode;
  }
}

// ============================================================================
// Session Status Helpers
// ============================================================================

/**
 * Verifica se a sessão está conectada e funcionando
 */
export async function isSessionWorking(sessionName: string): Promise<boolean> {
  try {
    const session = await getSession(sessionName);
    return session.status === "WORKING";
  } catch {
    return false;
  }
}

/**
 * Verifica se a sessão está aguardando QR code
 */
export async function isWaitingForQR(sessionName: string): Promise<boolean> {
  try {
    const session = await getSession(sessionName);
    return session.status === "SCAN_QR_CODE";
  } catch {
    return false;
  }
}

/**
 * Aguarda a sessão ficar em um determinado status
 * @param sessionName Nome da sessão
 * @param targetStatus Status desejado
 * @param timeoutMs Timeout em ms (default: 60s)
 * @param pollIntervalMs Intervalo de polling em ms (default: 2s)
 */
export async function waitForStatus(
  sessionName: string,
  targetStatus: WAHASessionStatus,
  timeoutMs = 60000,
  pollIntervalMs = 2000,
): Promise<WAHASession> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const session = await getSession(sessionName);

    if (session.status === targetStatus) {
      return session;
    }

    if (session.status === "FAILED") {
      throw new Error(`Sessão falhou: ${sessionName}`);
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  throw new Error(
    `Timeout aguardando status ${targetStatus} para sessão ${sessionName}`,
  );
}

export interface WAHAServerVersion {
  version: string;
  engine?: string;
  tier?: string;
}

/** Versão do servidor WAHA (usada no diagnóstico de falhas de conexão). */
export async function getServerVersion(): Promise<WAHAServerVersion> {
  return wahaRequest<WAHAServerVersion>("GET", "/api/server/version");
}

// ============================================================================
// Webhook Configuration
// ============================================================================

/**
 * Configura os webhooks de uma sessão
 */
export async function configureWebhooks(
  sessionName: string,
  webhookUrl: string,
  events: string[] = WAHA_WEBHOOK_EVENTS,
): Promise<void> {
  await wahaRequest("PUT", `/api/sessions/${sessionName}`, {
    config: { webhooks: [buildWebhookConfig(webhookUrl, events)] },
  });
}

// ============================================================================
// Messaging (básico - expandir conforme necessário)
// ============================================================================

export interface WAHAChatOverview {
  id: string; // formato: 5511999999999@c.us ou 123456@lid
  name: string | null;
  picture: string | null;
  lastMessage?: {
    id: string;
    timestamp: number;
    from: string;
    fromMe: boolean;
    body: string;
    _data?: {
      Info?: {
        Chat?: string;
        Sender?: string;
        SenderAlt?: string;
        RecipientAlt?: string;
      };
    };
  };
}

export interface GetChatsOptions {
  sessionName: string;
  limit?: number;
  offset?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

/**
 * Lista os chats de uma sessão (overview)
 * Retorna id, name, picture, lastMessage
 */
export async function getChatsOverview(
  options: GetChatsOptions,
): Promise<WAHAChatOverview[]> {
  const {
    sessionName,
    limit,
    offset,
    sortBy = "messageTimestamp",
    sortOrder = "desc",
  } = options;
  const params = new URLSearchParams();
  if (limit !== undefined) params.set("limit", String(limit));
  if (offset !== undefined) params.set("offset", String(offset));
  params.set("sortBy", sortBy);
  params.set("sortOrder", sortOrder);
  const query = params.toString();

  return wahaRequest<WAHAChatOverview[]>(
    "GET",
    `/api/${sessionName}/chats/overview?${query}`,
  );
}

/**
 * Busca mensagens de um chat específico
 */
export async function getChatMessages(
  sessionName: string,
  chatId: string,
  limit: number = 100,
): Promise<unknown[]> {
  const encodedChatId = encodeURIComponent(chatId);
  return wahaRequest<unknown[]>(
    "GET",
    `/api/${sessionName}/chats/${encodedChatId}/messages?limit=${limit}&downloadMedia=false`,
  );
}

export interface SendMessageOptions {
  chatId: string; // formato: 5511999999999@c.us
  text: string;
  session: string;
}

/**
 * Envia uma mensagem de texto
 */
export async function sendTextMessage(
  options: SendMessageOptions,
): Promise<{ id: string }> {
  return wahaRequest<{ id: string }>("POST", `/api/sendText`, {
    chatId: options.chatId,
    text: options.text,
    session: options.session,
  });
}

// ============================================================================
// Labels (para sincronização futura)
// ============================================================================

export interface WAHALabel {
  id: string;
  name: string;
  color: number;
  colorHex: string;
}

/**
 * Lista todas as labels da conta
 */
export async function getLabels(sessionName: string): Promise<WAHALabel[]> {
  return wahaRequest<WAHALabel[]>("GET", `/api/${sessionName}/labels`);
}

/**
 * Associa uma label a um chat
 */
export async function addLabelToChat(
  sessionName: string,
  chatId: string,
  labelId: string,
): Promise<void> {
  await wahaRequest("PUT", `/api/${sessionName}/labels/chat/${chatId}`, {
    labels: [{ id: labelId }],
  });
}
