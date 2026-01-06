// Cliente HTTP para a API do backend
import type { Operation, Agent, Channel, ChannelStatus } from '@omni/api/types';

// Re-export types para facilitar uso nos componentes
export type { Operation, Agent, Channel, ChannelStatus };

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3333';

interface ApiError {
  error: string;
  details?: unknown;
}

async function apiRequest<T>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown
): Promise<T> {
  const url = `${API_BASE_URL}${path}`;
  
  const headers: Record<string, string> = {};
  
  // Só adiciona Content-Type se tiver body...
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  
  const response = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const data = await response.json();

  if (!response.ok) {
    const error = data as ApiError;
    throw new Error(error.error || 'Erro na requisição');
  }

  return data as T;
}

// ============================================================================
// Operations
// ============================================================================

interface CreateOperationResponse {
  operation: Operation;
}

interface GetOperationsResponse {
  operations: Operation[];
}

export async function createOperation(name: string): Promise<Operation> {
  const response = await apiRequest<CreateOperationResponse>('POST', '/operations', { name });
  return response.operation;
}

export async function getOperations(): Promise<Operation[]> {
  const response = await apiRequest<GetOperationsResponse>('GET', '/operations');
  return response.operations;
}

// ============================================================================
// Agents
// ============================================================================

interface CreateAgentResponse {
  agent: Agent;
}

interface GetAgentsResponse {
  agents: (Agent & {
    channels: Array<{
      id: string;
      name: string;
      type: string;
      status: string;
    }>;
  })[];
}

export type AgentWithChannels = GetAgentsResponse['agents'][number];

export async function createAgent(data: {
  name: string;
  operationId: string;
}): Promise<Agent> {
  const response = await apiRequest<CreateAgentResponse>('POST', '/agents', data);
  return response.agent;
}

export async function getAgentsByOperation(operationId: string): Promise<AgentWithChannels[]> {
  const response = await apiRequest<GetAgentsResponse>('GET', `/agents?operationId=${operationId}`);
  return response.agents;
}

// ============================================================================
// Channels (WhatsApp)
// ============================================================================

// Tipo extendido com detalhes do WhatsApp (não vem do Prisma direto)
export interface ChannelWithDetails extends Channel {
  whatsappDetails?: {
    sessionName: string;
  };
}

export interface CreateWhatsAppChannelResponse {
  channel: ChannelWithDetails;
  wahaSession?: {
    name: string;
    status: string;
  };
}

export async function createWhatsAppChannel(data: {
  name: string;
  operationId: string;
  agentId?: string;
  webhookUrl?: string;
}): Promise<CreateWhatsAppChannelResponse> {
  return apiRequest<CreateWhatsAppChannelResponse>('POST', '/channels/whatsapp', data);
}

export interface QRCodeResponse {
  channelId: string;
  qrCode?: string; // Base64 da imagem
  qrValue?: string;
}

export async function getChannelQRCode(channelId: string): Promise<QRCodeResponse> {
  return apiRequest<QRCodeResponse>('GET', `/channels/${channelId}/qr`);
}

export interface ChannelStatusResponse {
  channelId: string;
  type: string;
  status: ChannelStatus;
  wahaStatus?: string;
  phoneNumber?: string;
  pushName?: string;
  error?: string;
}

export async function getChannelStatus(channelId: string): Promise<ChannelStatusResponse> {
  return apiRequest<ChannelStatusResponse>('GET', `/channels/${channelId}/status`);
}

export async function reconnectChannel(channelId: string): Promise<void> {
  await apiRequest<void>('POST', `/channels/${channelId}/reconnect`);
}

export async function deleteChannel(channelId: string): Promise<void> {
  await apiRequest<void>('DELETE', `/channels/${channelId}`);
}
