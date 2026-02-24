// Cliente HTTP para a API do backend
import type {
  Agent,
  Channel,
  ChannelStatus,
  Company,
  Operation,
  Opportunity,
  Stage,
} from "@omni/api/types";
import { supabase } from "./supabase";

// Re-export types para facilitar uso nos componentes
export type {
  Agent,
  Channel,
  ChannelStatus,
  Company,
  Operation,
  Opportunity,
  Stage,
};

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3333";

interface ApiError {
  error: string;
  details?: unknown;
}

async function apiRequest<T>(
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
): Promise<T> {
  const url = `${API_BASE_URL}${path}`;

  const headers: Record<string, string> = {};

  // Adiciona token de autenticação do Supabase
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session?.access_token) {
    headers["Authorization"] = `Bearer ${session.access_token}`;
  }

  // Só adiciona Content-Type se tiver body
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const data = await response.json();

  if (!response.ok) {
    const error = data as ApiError;
    throw new Error(error.error || "Erro na requisição");
  }

  return data as T;
}

// ============================================================================
// Auth
// ============================================================================

export interface User {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "MANAGER" | "AGENT";
  operationId: string | null;
}

interface SignupResponse {
  user: User;
}

/**
 * Cria um usuário no banco após signup no Supabase
 * IMPORTANTE: Chamar logo após o usuário fazer signup
 */
export async function signupUser(email: string, name: string): Promise<User> {
  const response = await apiRequest<SignupResponse>("POST", "/auth/signup", {
    email,
    name,
  });
  return response.user;
}

interface GetMeResponse {
  user: User;
}

/**
 * Retorna informações do usuário autenticado
 */
export async function getCurrentUser(): Promise<User> {
  const response = await apiRequest<GetMeResponse>("GET", "/auth/me");
  return response.user;
}

// ============================================================================
// Operations
// ============================================================================

interface GetOperationResponse {
  operation: Operation | null;
}

interface CreateOperationResponse {
  operation: Operation;
}
interface UpdateOperationResponse {
  operation: Operation;
}

export async function createOperation(name: string): Promise<Operation> {
  const response = await apiRequest<CreateOperationResponse>(
    "POST",
    "/operations",
    { name },
  );
  return response.operation;
}

/**
 * Retorna a operation do usuário autenticado
 */
export async function getUserOperation(): Promise<Operation | null> {
  const response = await apiRequest<GetOperationResponse>("GET", "/operations");
  return response.operation;
}
export async function updateOperation(
  id: string,
  data: { name?: string; onboardingCompleted?: boolean },
): Promise<Operation> {
  const response = await apiRequest<UpdateOperationResponse>(
    "PUT",
    `/operations/${id}`,
    data,
  );
  return response.operation;
}

export async function getOperations(): Promise<Operation[]> {
  const response = await apiRequest<GetOperationResponse>("GET", "/operations");
  return response.operation ? [response.operation] : [];
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

export type AgentWithChannels = GetAgentsResponse["agents"][number];

export async function createAgent(data: {
  name: string;
  operationId: string;
}): Promise<Agent> {
  const response = await apiRequest<CreateAgentResponse>(
    "POST",
    "/agents",
    data,
  );
  return response.agent;
}

export async function getAgentsByOperation(
  operationId: string,
): Promise<AgentWithChannels[]> {
  const response = await apiRequest<GetAgentsResponse>(
    "GET",
    `/agents?operationId=${operationId}`,
  );
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

export async function getChannels(): Promise<ChannelWithDetails[]> {
  const response = await apiRequest<{ channels: ChannelWithDetails[] }>(
    "GET",
    "/channels",
  );
  return response.channels;
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
  return apiRequest<CreateWhatsAppChannelResponse>(
    "POST",
    "/channels/whatsapp",
    data,
  );
}

export interface QRCodeResponse {
  channelId: string;
  qrCode?: string; // Base64 da imagem
  qrValue?: string;
}

export async function getChannelQRCode(
  channelId: string,
): Promise<QRCodeResponse> {
  return apiRequest<QRCodeResponse>("GET", `/channels/${channelId}/qr`);
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

export async function getChannelStatus(
  channelId: string,
): Promise<ChannelStatusResponse> {
  return apiRequest<ChannelStatusResponse>(
    "GET",
    `/channels/${channelId}/status`,
  );
}

export async function reconnectChannel(channelId: string): Promise<void> {
  await apiRequest<void>("POST", `/channels/${channelId}/reconnect`);
}

export async function deleteChannel(channelId: string): Promise<void> {
  await apiRequest<void>("DELETE", `/channels/${channelId}`);
}

// ============================================================================
// Companies
// ============================================================================

interface GetCompaniesParams {
  search?: string;
  limit?: number;
  offset?: number;
}

interface GetCompaniesResponse {
  companies: Company[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

interface GetCompanyResponse {
  company: Company;
}

interface CompanyTimelineResponse {
  timeline: Array<{
    id: string;
    type: string;
    createdAt: string;
    data: unknown;
  }>;
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

export async function getCompanies(
  params?: GetCompaniesParams,
): Promise<GetCompaniesResponse> {
  const searchParams = new URLSearchParams();
  if (params?.search) searchParams.set("search", params.search);
  if (params?.limit) searchParams.set("limit", params.limit.toString());
  if (params?.offset) searchParams.set("offset", params.offset.toString());

  return apiRequest<GetCompaniesResponse>("GET", `/companies?${searchParams}`);
}

export async function createCompany(data: {
  cnpj: string;
  name?: string;
  alias?: string;
}): Promise<Company> {
  const response = await apiRequest<GetCompanyResponse>(
    "POST",
    "/companies",
    data,
  );
  return response.company;
}

export interface LookupCNPJResponse {
  company: Partial<Company>;
  source: "database" | "api";
  exists: boolean;
}

export async function lookupCNPJ(cnpj: string): Promise<LookupCNPJResponse> {
  const cleanCnpj = cnpj.replace(/\D/g, "");
  return apiRequest<LookupCNPJResponse>(
    "GET",
    `/companies/lookup/${cleanCnpj}`,
  );
}

export async function getCompany(id: string): Promise<Company> {
  const response = await apiRequest<GetCompanyResponse>(
    "GET",
    `/companies/${id}`,
  );
  return response.company;
}

export async function updateCompany(
  id: string,
  data: Partial<Pick<Company, "name" | "alias">>,
): Promise<Company> {
  const response = await apiRequest<GetCompanyResponse>(
    "PUT",
    `/companies/${id}`,
    data,
  );
  return response.company;
}

export async function getCompanyTimeline(
  companyId: string,
  params?: { limit?: number; offset?: number },
): Promise<CompanyTimelineResponse> {
  const searchParams = new URLSearchParams();
  if (params?.limit) searchParams.set("limit", params.limit.toString());
  if (params?.offset) searchParams.set("offset", params.offset.toString());

  return apiRequest<CompanyTimelineResponse>(
    "GET",
    `/companies/${companyId}/timeline?${searchParams}`,
  );
}

// ============================================================================
// Opportunities
// ============================================================================

interface GetOpportunitiesParams {
  stageId?: string;
  agentId?: string;
  companyId?: string;
  limit?: number;
  offset?: number;
}

interface GetOpportunitiesResponse {
  opportunities: Opportunity[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

interface GetOpportunityResponse {
  opportunity: Opportunity;
}

interface KanbanColumn {
  stage: Stage;
  opportunities: Opportunity[];
}

interface GetOpportunitiesKanbanResponse {
  columns: KanbanColumn[];
}

export async function getOpportunities(
  params?: GetOpportunitiesParams,
): Promise<GetOpportunitiesResponse> {
  const searchParams = new URLSearchParams();
  if (params?.stageId) searchParams.set("stageId", params.stageId);
  if (params?.agentId) searchParams.set("agentId", params.agentId);
  if (params?.companyId) searchParams.set("companyId", params.companyId);
  if (params?.limit) searchParams.set("limit", params.limit.toString());
  if (params?.offset) searchParams.set("offset", params.offset.toString());

  return apiRequest<GetOpportunitiesResponse>(
    "GET",
    `/opportunities?${searchParams}`,
  );
}

export async function getOpportunitiesKanban(): Promise<GetOpportunitiesKanbanResponse> {
  return apiRequest<GetOpportunitiesKanbanResponse>(
    "GET",
    "/opportunities/kanban",
  );
}

export async function createOpportunity(data: {
  companyId: string;
  stageId: string;
  agentId?: string;
  estimatedValue?: number;
  notes?: string;
}): Promise<Opportunity> {
  const response = await apiRequest<GetOpportunityResponse>(
    "POST",
    "/opportunities",
    data,
  );
  return response.opportunity;
}

export async function updateOpportunity(
  id: string,
  data: Partial<
    Pick<Opportunity, "stageId" | "agentId" | "estimatedValue" | "notes">
  >,
): Promise<Opportunity> {
  const response = await apiRequest<GetOpportunityResponse>(
    "PUT",
    `/opportunities/${id}`,
    data,
  );
  return response.opportunity;
}

export async function moveOpportunity(
  id: string,
  stageId: string,
): Promise<Opportunity> {
  const response = await apiRequest<GetOpportunityResponse>(
    "PUT",
    `/opportunities/${id}/move`,
    { stageId },
  );
  return response.opportunity;
}

export async function deleteOpportunity(id: string): Promise<void> {
  await apiRequest<void>("DELETE", `/opportunities/${id}`);
}

// ============================================================================
// Stages
// ============================================================================

interface GetStagesResponse {
  stages: Stage[];
}

export async function getStages(): Promise<Stage[]> {
  const response = await apiRequest<GetStagesResponse>("GET", "/stages");
  return response.stages;
}

// ============================================================================
// Contacts
// ============================================================================

interface ContactWithIdentities {
  id: string;
  name: string | null;
  identities: Array<{ id: string; type: string; value: string }>;
  company: { id: string; name: string; alias: string | null } | null;
  _count: { conversations: number; messages: number };
}

interface GetContactsParams {
  search?: string;
  unlinked?: boolean;
  limit?: number;
  offset?: number;
}

interface GetContactsResponse {
  contacts: ContactWithIdentities[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

export async function getContacts(
  params?: GetContactsParams,
): Promise<GetContactsResponse> {
  const searchParams = new URLSearchParams();
  if (params?.search) searchParams.set("search", params.search);
  if (params?.unlinked) searchParams.set("unlinked", "true");
  if (params?.limit) searchParams.set("limit", params.limit.toString());
  if (params?.offset) searchParams.set("offset", params.offset.toString());

  return apiRequest<GetContactsResponse>("GET", `/contacts?${searchParams}`);
}

export async function linkContactToCompany(
  contactId: string,
  companyId: string,
): Promise<ContactWithIdentities> {
  const response = await apiRequest<{ contact: ContactWithIdentities }>(
    "PUT",
    `/contacts/${contactId}/link-company`,
    { companyId },
  );
  return response.contact;
}

interface CreateContactData {
  name?: string;
  phone?: string;
  email?: string;
  companyId?: string;
  role?: string;
}

interface CreateContactResponse {
  contact: {
    id: string;
    name: string | null;
    identities: Array<{ type: string; value: string }>;
  };
}

export async function createContact(
  data: CreateContactData,
): Promise<CreateContactResponse["contact"]> {
  const response = await apiRequest<CreateContactResponse>(
    "POST",
    "/contacts",
    data,
  );
  return response.contact;
}

// Chats do WhatsApp (via WAHA)
export interface WhatsAppChat {
  waId: string;
  chatId: string;
  name: string | null;
  picture: string | null;
  lastMessage: {
    body: string;
    timestamp: number;
    fromMe: boolean;
  } | null;
  linked: boolean;
  linkedToCompany: boolean;
  contact: {
    id: string;
    name: string | null;
    company: { id: string; name: string; alias: string | null } | null;
  } | null;
}

interface WhatsAppChatsPagination {
  offset: number;
  limit: number;
  hasMore: boolean;
  totalFetched: number;
}

interface GetWhatsAppChatsResponse {
  chats: WhatsAppChat[];
  pagination: WhatsAppChatsPagination;
}

export interface GetWhatsAppChatsResult {
  chats: WhatsAppChat[];
  hasMore: boolean;
  nextOffset: number;
}

export async function getWhatsAppChats(
  channelId: string,
  params?: { search?: string; limit?: number; offset?: number },
): Promise<GetWhatsAppChatsResult> {
  const searchParams = new URLSearchParams();
  if (params?.search) searchParams.set("search", params.search);
  if (params?.limit) searchParams.set("limit", params.limit.toString());
  if (params?.offset) searchParams.set("offset", params.offset.toString());

  const response = await apiRequest<GetWhatsAppChatsResponse>(
    "GET",
    `/channels/${channelId}/chats?${searchParams}`,
  );
  return {
    chats: response.chats,
    hasMore: response.pagination.hasMore,
    nextOffset: response.pagination.offset + response.pagination.totalFetched,
  };
}

interface LinkWhatsAppChatData {
  waId: string;
  companyId: string;
  channelId: string;
  name?: string;
  role?: string;
}

interface LinkWhatsAppChatResponse {
  contact: ContactWithIdentities;
  conversation: { id: string };
  created: boolean;
}

export async function linkWhatsAppChat(
  data: LinkWhatsAppChatData,
): Promise<LinkWhatsAppChatResponse> {
  return apiRequest<LinkWhatsAppChatResponse>(
    "POST",
    "/contacts/link-whatsapp",
    data,
  );
}
