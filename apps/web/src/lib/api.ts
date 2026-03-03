// Cliente HTTP para a API do backend
// Tipos compartilhados derivados do Prisma (fonte única de verdade)
import type {
  Agent,
  AgentWithRelations,
  AuthUser,
  Channel,
  ChannelStatus,
  ChannelStatusResponse,
  ChannelWithDetails,
  Company,
  CompanyWithCounts,
  ContactWithIdentities,
  CreateContactResponse,
  CreateWhatsAppChannelResponse,
  GetCompaniesResponse,
  GetCompanyTimelineResponse,
  GetContactsResponse,
  GetOpportunitiesKanbanResponse,
  GetOpportunitiesResponse,
  GetOpportunityTimelineResponse,
  GetStagesResponse,
  GetWhatsAppChatsResponse,
  LinkContactToCompanyResponse,
  LinkWhatsAppChatResponse,
  LookupCNPJResponse,
  Operation,
  Opportunity,
  OpportunityDetail,
  OpportunityListItem,
  Pagination,
  QRCodeResponse,
  Stage,
  StageWithRelations,
  WhatsAppChat,
} from "@omni/api/types";
import { supabase } from "./supabase";

// Re-export types para facilitar uso nos componentes
export type {
  Agent,
  AgentWithRelations,
  Channel,
  ChannelStatus,
  ChannelStatusResponse,
  ChannelWithDetails,
  Company,
  CompanyWithCounts,
  ContactWithIdentities,
  CreateWhatsAppChannelResponse,
  LookupCNPJResponse,
  Operation,
  Opportunity,
  OpportunityDetail,
  OpportunityListItem,
  Pagination,
  QRCodeResponse,
  Stage,
  StageWithRelations,
  WhatsAppChat,
};

// Aliases de compatibilidade
export type User = AuthUser;
export type AgentWithChannels = AgentWithRelations;
export type OpportunityTimelineResponse = GetOpportunityTimelineResponse;
export type OpportunityTimelineEvent =
  GetOpportunityTimelineResponse["events"][number];

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3333";

interface ApiError {
  error: string;
  details?: unknown;
}

async function apiRequest<T>(
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
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

/**
 * Cria um usuário no banco após signup no Supabase
 * IMPORTANTE: Chamar logo após o usuário fazer signup
 */
export async function signupUser(
  email: string,
  name: string,
): Promise<AuthUser> {
  const response = await apiRequest<{ user: AuthUser }>(
    "POST",
    "/auth/signup",
    {
      email,
      name,
    },
  );
  return response.user;
}

/**
 * Retorna informações do usuário autenticado
 */
export async function getCurrentUser(): Promise<AuthUser> {
  const response = await apiRequest<{ user: AuthUser }>("GET", "/auth/me");
  return response.user;
}

// ============================================================================
// Operations
// ============================================================================

export async function createOperation(name: string): Promise<Operation> {
  const response = await apiRequest<{ operation: Operation }>(
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
  const response = await apiRequest<{ operation: Operation | null }>(
    "GET",
    "/operations",
  );
  return response.operation;
}
export async function updateOperation(
  id: string,
  data: { name?: string; onboardingCompleted?: boolean },
): Promise<Operation> {
  const response = await apiRequest<{ operation: Operation }>(
    "PUT",
    `/operations/${id}`,
    data,
  );
  return response.operation;
}

export async function getOperations(): Promise<Operation[]> {
  const response = await apiRequest<{ operation: Operation | null }>(
    "GET",
    "/operations",
  );
  return response.operation ? [response.operation] : [];
}

// ============================================================================
// Agents
// ============================================================================

export async function createAgent(data: {
  name: string;
  operationId: string;
}): Promise<Agent> {
  const response = await apiRequest<{ agent: Agent }>("POST", "/agents", data);
  return response.agent;
}

export async function getAgentsByOperation(
  operationId: string,
): Promise<AgentWithRelations[]> {
  const response = await apiRequest<{ agents: AgentWithRelations[] }>(
    "GET",
    `/agents?operationId=${operationId}`,
  );
  return response.agents;
}

export async function getAgents(): Promise<AgentWithRelations[]> {
  const response = await apiRequest<{ agents: AgentWithRelations[] }>(
    "GET",
    "/agents",
  );
  return response.agents;
}

// ============================================================================
// Channels (WhatsApp)
// ============================================================================

export async function getChannels(): Promise<ChannelWithDetails[]> {
  const response = await apiRequest<{ channels: ChannelWithDetails[] }>(
    "GET",
    "/channels",
  );
  return response.channels;
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

export async function getChannelQRCode(
  channelId: string,
): Promise<QRCodeResponse> {
  return apiRequest<QRCodeResponse>("GET", `/channels/${channelId}/qr`);
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
  const response = await apiRequest<{ company: Company }>(
    "POST",
    "/companies",
    data,
  );
  return response.company;
}

export async function lookupCNPJ(cnpj: string): Promise<LookupCNPJResponse> {
  const cleanCnpj = cnpj.replace(/\D/g, "");
  return apiRequest<LookupCNPJResponse>(
    "GET",
    `/companies/lookup/${cleanCnpj}`,
  );
}

export async function getCompany(id: string): Promise<Company> {
  const response = await apiRequest<{ company: Company }>(
    "GET",
    `/companies/${id}`,
  );
  return response.company;
}

export async function updateCompany(
  id: string,
  data: Partial<Pick<Company, "name" | "alias">>,
): Promise<Company> {
  const response = await apiRequest<{ company: Company }>(
    "PUT",
    `/companies/${id}`,
    data,
  );
  return response.company;
}

export async function getCompanyTimeline(
  companyId: string,
  params?: { limit?: number; offset?: number },
): Promise<GetCompanyTimelineResponse> {
  const searchParams = new URLSearchParams();
  if (params?.limit) searchParams.set("limit", params.limit.toString());
  if (params?.offset) searchParams.set("offset", params.offset.toString());

  return apiRequest<GetCompanyTimelineResponse>(
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
}): Promise<OpportunityListItem> {
  const response = await apiRequest<{ opportunity: OpportunityListItem }>(
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
): Promise<OpportunityListItem> {
  const response = await apiRequest<{ opportunity: OpportunityListItem }>(
    "PUT",
    `/opportunities/${id}`,
    data,
  );
  return response.opportunity;
}

export async function moveOpportunity(
  id: string,
  stageId: string,
): Promise<OpportunityListItem> {
  const response = await apiRequest<{ opportunity: OpportunityListItem }>(
    "PUT",
    `/opportunities/${id}/move`,
    { stageId },
  );
  return response.opportunity;
}

export async function deleteOpportunity(id: string): Promise<void> {
  await apiRequest<void>("DELETE", `/opportunities/${id}`);
}

export async function getOpportunity(id: string): Promise<OpportunityDetail> {
  const response = await apiRequest<{ opportunity: OpportunityDetail }>(
    "GET",
    `/opportunities/${id}`,
  );
  return response.opportunity;
}

export async function getOpportunityTimeline(
  opportunityId: string,
  params?: { limit?: number; offset?: number },
): Promise<GetOpportunityTimelineResponse> {
  const searchParams = new URLSearchParams();
  if (params?.limit) searchParams.set("limit", params.limit.toString());
  if (params?.offset) searchParams.set("offset", params.offset.toString());

  return apiRequest<GetOpportunityTimelineResponse>(
    "GET",
    `/opportunities/${opportunityId}/timeline?${searchParams}`,
  );
}

// ============================================================================
// Stages
// ============================================================================

export async function getStages(): Promise<StageWithRelations[]> {
  const response = await apiRequest<GetStagesResponse>("GET", "/stages");
  return response.stages;
}

// ============================================================================
// Contacts
// ============================================================================

interface GetContactsParams {
  search?: string;
  unlinked?: boolean;
  limit?: number;
  offset?: number;
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
): Promise<LinkContactToCompanyResponse["contact"]> {
  const response = await apiRequest<LinkContactToCompanyResponse>(
    "PATCH",
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

// ============================================================================
// WhatsApp Chats (via WAHA)
// ============================================================================

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

export async function linkWhatsAppChat(
  data: LinkWhatsAppChatData,
): Promise<LinkWhatsAppChatResponse> {
  return apiRequest<LinkWhatsAppChatResponse>(
    "POST",
    "/contacts/link-whatsapp",
    data,
  );
}
