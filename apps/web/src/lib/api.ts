// Cliente HTTP para a API do backend
import { supabase } from './supabase';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3333';

async function apiRequest(method, path, body?) {
  const url = `${API_BASE_URL}${path}`;
  
  const headers = {};
  
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`;
  }
  
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
    throw new Error(data.error || 'Erro na requisição');
  }

  return data;
}

// ============================================================================
// Auth
// ============================================================================

export async function signupUser(email, name) {
  const response = await apiRequest('POST', '/auth/signup', { email, name });
  return response.user;
}

export async function getCurrentUser() {
  const response = await apiRequest('GET', '/auth/me');
  return response.user;
}

// ============================================================================
// Operations
// ============================================================================

export async function createOperation(name) {
  const response = await apiRequest('POST', '/operations', { name });
  return response.operation;
}

export async function getUserOperation() {
  const response = await apiRequest('GET', '/operations');
  return response.operation;
}

// ============================================================================
// Agents
// ============================================================================

export async function createAgent(data) {
  const response = await apiRequest('POST', '/agents', data);
  return response.agent;
}

export async function getAgentsByOperation(operationId) {
  const response = await apiRequest('GET', `/agents?operationId=${operationId}`);
  return response.agents;
}

// ============================================================================
// Channels (WhatsApp)
// ============================================================================

export async function createWhatsAppChannel(data) {
  return apiRequest('POST', '/channels/whatsapp', data);
}

export async function getChannelQRCode(channelId) {
  return apiRequest('GET', `/channels/${channelId}/qr`);
}

export async function getChannelStatus(channelId) {
  return apiRequest('GET', `/channels/${channelId}/status`);
}

export async function reconnectChannel(channelId) {
  await apiRequest('POST', `/channels/${channelId}/reconnect`);
}

export async function deleteChannel(channelId) {
  await apiRequest('DELETE', `/channels/${channelId}`);
}

// ============================================================================
// Companies
// ============================================================================

export async function getCompanies(params?) {
  const searchParams = new URLSearchParams();
  if (params?.search) searchParams.set('search', params.search);
  if (params?.limit) searchParams.set('limit', params.limit.toString());
  if (params?.offset) searchParams.set('offset', params.offset.toString());
  
  return apiRequest('GET', `/companies?${searchParams}`);
}

export async function createCompany(data) {
  return apiRequest('POST', '/companies', data);
}

export async function getCompany(id) {
  return apiRequest('GET', `/companies/${id}`);
}

export async function updateCompany(id, data) {
  return apiRequest('PUT', `/companies/${id}`, data);
}

export async function getCompanyTimeline(companyId, params?) {
  const searchParams = new URLSearchParams();
  if (params?.limit) searchParams.set('limit', params.limit.toString());
  if (params?.offset) searchParams.set('offset', params.offset.toString());
  
  return apiRequest('GET', `/companies/${companyId}/timeline?${searchParams}`);
}

// ============================================================================
// Opportunities
// ============================================================================

export async function getOpportunities(params?) {
  const searchParams = new URLSearchParams();
  if (params?.stageId) searchParams.set('stageId', params.stageId);
  if (params?.agentId) searchParams.set('agentId', params.agentId);
  if (params?.companyId) searchParams.set('companyId', params.companyId);
  if (params?.limit) searchParams.set('limit', params.limit.toString());
  if (params?.offset) searchParams.set('offset', params.offset.toString());
  
  return apiRequest('GET', `/opportunities?${searchParams}`);
}

export async function getOpportunitiesKanban() {
  return apiRequest('GET', '/opportunities/kanban');
}

export async function createOpportunity(data) {
  return apiRequest('POST', '/opportunities', data);
}

export async function updateOpportunity(id, data) {
  return apiRequest('PUT', `/opportunities/${id}`, data);
}

export async function moveOpportunity(id, stageId) {
  return apiRequest('PUT', `/opportunities/${id}/move`, { stageId });
}

export async function deleteOpportunity(id) {
  await apiRequest('DELETE', `/opportunities/${id}`);
}

// ============================================================================
// Stages
// ============================================================================

export async function getStages() {
  return apiRequest('GET', '/stages');
}
