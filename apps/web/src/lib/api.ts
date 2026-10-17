// Cliente HTTP para a API do backend
// Tipos compartilhados derivados do Prisma (fonte única de verdade)
import type {
  Agent,
  AgentWithRelations,
  AuthUser,
  Channel,
  ChannelHealthResponse,
  ChannelListItem as ApiChannelListItem,
  ChannelStatus,
  ChannelStatusResponse,
  ChannelWithDetails,
  Company,
  CompanyWithCounts,
  ContactWithIdentities,
  CreateContactResponse,
  CreateStageResponse,
  CreateWhatsAppChannelResponse,
  GetCompaniesResponse,
  GetCompanyTimelineResponse,
  GetContactsResponse,
  GetOpportunitiesKanbanResponse,
  GetOpportunitiesResponse,
  GetOpportunityTimelineResponse,
  GetStageResponse,
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
  ReconnectChannelResponse,
  ChannelConnectFailure,
  ReorderStagesResponse,
  Stage,
  StageWithRelations,
  WhatsAppChat,
} from "@omni/api/types";
import type {
  ContactDetail,
  ConversationActionResponse,
  ConversationDetail,
  ConversationListItem,
  CreateNoteResponse,
  DeskDeliveryAck,
  DeskMediaKind,
  DeskMetricsResponse,
  DeskQueue,
  GetContactResponse,
  GetConversationResponse,
  GetConversationsResponse,
  GetMessagesResponse,
  GetQueuesResponse,
  QueueResponse,
  SendMessageResponse,
  GetCompanyResponse,
} from "@omni/api/api-types";
import { API_BASE_URL, getAccessToken, logout, refreshSession } from "./auth";

// Re-export types para facilitar uso nos componentes
export type {
  ContactDetail,
  DeskDeliveryAck,
  DeskMediaKind,
  ConversationDetail,
  ConversationListItem,
  DeskMetricsResponse,
  DeskQueue,
  Agent,
  AgentWithRelations,
  Channel,
  ChannelHealthResponse,
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
  ReconnectChannelResponse,
  ChannelConnectFailure,
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

export { API_BASE_URL };

interface ApiError {
  error: string;
  details?: unknown;
}

export async function apiRequest<T>(
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
): Promise<T> {
  const send = (token: string | null) =>
    fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

  let response = await send(await getAccessToken());

  // Token expirado/revogado: renova uma vez e repete; sem sessão válida, sai.
  if (response.status === 401) {
    const renewed = await refreshSession();
    if (renewed) response = await send(renewed);
    if (response.status === 401) await logout();
  }

  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => ({}));

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

/** Canal da listagem como chega no JSON (datas em string ISO). */
export type ChannelListItem = Serialized<ApiChannelListItem>;

export async function getChannels(): Promise<ChannelListItem[]> {
  const response = await apiRequest<{ channels: ChannelListItem[] }>(
    "GET",
    "/channels",
  );
  return response.channels;
}

/** Consulta o WhatsApp ao vivo (status, número, webhook, última mensagem). */
export async function getChannelHealth(
  channelId: string,
): Promise<ChannelHealthResponse> {
  return apiRequest<ChannelHealthResponse>("GET", `/channels/${channelId}/health`);
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

/**
 * Reinicia a sessão; se ela não existir mais no WAHA, é recriada (novo QR).
 * fresh=true descarta a credencial salva e recomeça do zero.
 */
export async function reconnectChannel(
  channelId: string,
  options: { fresh?: boolean } = {},
): Promise<ReconnectChannelResponse> {
  return apiRequest<ReconnectChannelResponse>("POST", `/channels/${channelId}/reconnect`, options);
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
  sector?: string;
  annualRevenue?: string;
  employeeCount?: number;
  creditLimit?: number;
  billingAddress?: string;
  shippingAddress?: string;
  apparentWealthSigns?: string[];
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
  data: Partial<
    Pick<
      Company,
      | "name"
      | "alias"
      | "sector"
      | "annualRevenue"
      | "employeeCount"
      | "creditLimit"
      | "billingAddress"
      | "shippingAddress"
      | "apparentWealthSigns"
    >
  >,
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

export async function createStage(data: {
  name: string;
  operationId: string;
  slug?: string;
  order?: number;
  color?: string;
  promptCondition?: string;
  autoTransition?: boolean;
}): Promise<Stage> {
  const response = await apiRequest<CreateStageResponse>(
    "POST",
    "/stages",
    data,
  );
  return response.stage;
}

export async function updateStage(
  id: string,
  data: Partial<
    Pick<
      Stage,
      "name" | "order" | "color" | "promptCondition" | "autoTransition"
    >
  >,
): Promise<StageWithRelations> {
  const response = await apiRequest<GetStageResponse>(
    "PUT",
    `/stages/${id}`,
    data,
  );
  return response.stage;
}

export async function reorderStages(
  operationId: string,
  stageIds: string[],
): Promise<Stage[]> {
  const response = await apiRequest<ReorderStagesResponse>(
    "POST",
    "/stages/reorder",
    {
      operationId,
      stageIds,
    },
  );
  return response.stages;
}

export async function deleteStage(id: string): Promise<void> {
  await apiRequest<void>("DELETE", `/stages/${id}`);
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

export async function getContact(id: string): Promise<ContactDetail> {
  const response = await apiRequest<GetContactResponse>("GET", `/contacts/${id}`);
  return response.contact;
}

export async function getCompanyWithRelations(id: string) {
  const response = await apiRequest<GetCompanyResponse>("GET", `/companies/${id}`);
  return response.company;
}

// ============================================================================
// Mesa de atendimento (conversas)
// ============================================================================

export type ConversationStatusValue = ConversationListItem["status"];
/** Tipos do Prisma com Date -> string (como chegam no JSON). */
type Serialized<T> = T extends Date
  ? string
  : T extends object
    ? { [K in keyof T]: Serialized<T[K]> }
    : T;
export type DeskMessage = Serialized<GetMessagesResponse["messages"][number]>;
export type DeskMessageMedia = NonNullable<DeskMessage["media"]>;
export type SentMessage = Serialized<SendMessageResponse["message"]>;

/** URL absoluta de um caminho da API (ex.: URL assinada de mídia `/media/...`). */
export function apiUrl(path: string): string {
  return /^https?:\/\//.test(path) ? path : `${API_BASE_URL}${path}`;
}
export type DeskNote = Serialized<CreateNoteResponse["event"]>;
export type DeskMessagesPage = { messages: DeskMessage[]; hasMore: boolean };

export interface ConversationFilters {
  status?: ConversationStatusValue;
  queueId?: string;
  /** "me" | "unassigned" | id do atendente */
  assignee?: string;
  search?: string;
  contactId?: string;
  cursor?: string;
  limit?: number;
}

export async function getConversations(
  params: ConversationFilters = {},
): Promise<GetConversationsResponse> {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") sp.set(key, String(value));
  }
  return apiRequest<GetConversationsResponse>("GET", `/conversations?${sp}`);
}

export async function getConversation(id: string): Promise<ConversationDetail> {
  const r = await apiRequest<GetConversationResponse>("GET", `/conversations/${id}`);
  return r.conversation;
}

export async function getConversationMessages(
  id: string,
  params?: { before?: string; limit?: number },
): Promise<DeskMessagesPage> {
  const sp = new URLSearchParams();
  if (params?.before) sp.set("before", params.before);
  if (params?.limit) sp.set("limit", String(params.limit));
  return apiRequest<DeskMessagesPage>("GET", `/conversations/${id}/messages?${sp}`);
}

export async function sendConversationMessage(
  id: string,
  text: string,
): Promise<SentMessage> {
  const r = await apiRequest<{ message: SentMessage }>("POST", `/conversations/${id}/messages`, { text });
  return r.message;
}

export async function assignConversation(
  id: string,
  data: { agentId?: string | null; queueId?: string | null },
): Promise<ConversationDetail> {
  const r = await apiRequest<ConversationActionResponse>("POST", `/conversations/${id}/assign`, data);
  return r.conversation;
}

export async function setConversationStatus(
  id: string,
  status: ConversationStatusValue,
): Promise<ConversationDetail> {
  const r = await apiRequest<ConversationActionResponse>("POST", `/conversations/${id}/status`, { status });
  return r.conversation;
}

export async function addConversationNote(id: string, text: string): Promise<DeskNote> {
  const r = await apiRequest<{ event: DeskNote }>("POST", `/conversations/${id}/notes`, { text });
  return r.event;
}

/**
 * Notas internas da conversa. ATENCAO: rota ainda NAO existe no contrato
 * (ver docs/ARCHITECTURE.md, "Pendencias"); falha com 404 ate a API expor.
 */
export async function getConversationNotes(id: string): Promise<DeskNote[]> {
  const r = await apiRequest<{ events: DeskNote[] }>("GET", `/conversations/${id}/notes`);
  return r.events;
}

export async function markConversationRead(id: string): Promise<void> {
  await apiRequest<void>("POST", `/conversations/${id}/read`);
}

// ----------------------------------------------------------------------------
// Filas
// ----------------------------------------------------------------------------

export async function getQueues(): Promise<DeskQueue[]> {
  const r = await apiRequest<GetQueuesResponse>("GET", "/queues");
  return r.queues;
}

export async function createQueue(name: string): Promise<DeskQueue> {
  const r = await apiRequest<QueueResponse>("POST", "/queues", { name });
  return r.queue;
}

export async function renameQueue(id: string, name: string): Promise<DeskQueue> {
  const r = await apiRequest<QueueResponse>("PUT", `/queues/${id}`, { name });
  return r.queue;
}

export async function deleteQueue(id: string): Promise<void> {
  await apiRequest<void>("DELETE", `/queues/${id}`);
}

export async function setQueueMembers(id: string, agentIds: string[]): Promise<DeskQueue> {
  const r = await apiRequest<QueueResponse>("PUT", `/queues/${id}/members`, { agentIds });
  return r.queue;
}

// ----------------------------------------------------------------------------
// Métricas
// ----------------------------------------------------------------------------

export async function getDeskMetrics(from: string, to: string): Promise<DeskMetricsResponse> {
  const sp = new URLSearchParams({ from, to });
  return apiRequest<DeskMetricsResponse>("GET", `/metrics/desk?${sp}`);
}

// ============================================================================
// Equipe (usuários e acesso)
// ============================================================================

export interface TeamUser {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "MANAGER" | "AGENT";
  mustChangePassword: boolean;
  createdAt: string;
  agent: { id: string; name: string } | null;
}

export async function getTeamUsers(): Promise<TeamUser[]> {
  const r = await apiRequest<{ users: TeamUser[] }>("GET", "/users");
  return r.users;
}

/** Convida um usuário; devolve a senha provisória (mostrada uma única vez). */
export async function inviteUser(data: {
  name: string;
  email: string;
  role: TeamUser["role"];
  agentId?: string;
}): Promise<{ user: TeamUser; temporaryPassword: string }> {
  return apiRequest("POST", "/users", data);
}

export async function resetUserPassword(id: string): Promise<{ temporaryPassword: string }> {
  return apiRequest("POST", `/users/${id}/reset-password`);
}

export async function removeUser(id: string): Promise<void> {
  await apiRequest("DELETE", `/users/${id}`);
}

/** Vincula um atendente existente a um usuário (para assumir conversas). */
export async function linkAgentToUser(agentId: string, userId: string): Promise<void> {
  await apiRequest("PUT", `/agents/${agentId}`, { userId });
}
