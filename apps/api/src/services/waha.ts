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
    "[WAHA] WAHA_API_URL não configurada - funcionalidades WhatsApp desabilitadas"
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

export interface WAHASession {
  name: string;
  status: WAHASessionStatus;
  config: {
    proxy?: string;
    webhooks?: Array<{
      url: string;
      events: string[];
    }>;
  };
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
    webhooks?: Array<{
      url: string;
      events: string[];
      hmac?: { key: string };
    }>;
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
  body?: unknown
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

  const data = await response.body.json();

  if (response.statusCode >= 400) {
    const error = data as WAHAError;
    throw new Error(
      `WAHA Error: ${error.message || error.error || "Unknown error"}`
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
  options: WAHASessionCreate
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
 * @param format "image" retorna base64, "raw" retorna string do QR
 */
export async function getQRCode(
  sessionName: string,
  format: "image" | "raw" = "image"
): Promise<WAHAQRCode> {
  return wahaRequest<WAHAQRCode>(
    "GET",
    `/api/${sessionName}/auth/qr?format=${format}`
  );
}

/**
 * Solicita código de pareamento (alternativa ao QR code)
 */
export async function requestPairingCode(
  sessionName: string,
  phoneNumber: string
): Promise<{ code: string }> {
  return wahaRequest<{ code: string }>(
    "POST",
    `/api/${sessionName}/auth/request-code`,
    { phoneNumber }
  );
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
  pollIntervalMs = 2000
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
    `Timeout aguardando status ${targetStatus} para sessão ${sessionName}`
  );
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
  events: string[] = ["message", "session.status"]
): Promise<void> {
  await wahaRequest("PUT", `/api/sessions/${sessionName}`, {
    config: {
      webhooks: [
        {
          url: webhookUrl,
          events,
        },
      ],
    },
  });
}

// ============================================================================
// Messaging (básico - expandir conforme necessário)
// ============================================================================

export interface SendMessageOptions {
  chatId: string; // formato: 5511999999999@c.us
  text: string;
  session: string;
}

/**
 * Envia uma mensagem de texto
 */
export async function sendTextMessage(
  options: SendMessageOptions
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
  labelId: string
): Promise<void> {
  await wahaRequest("PUT", `/api/${sessionName}/labels/chat/${chatId}`, {
    labels: [{ id: labelId }],
  });
}
