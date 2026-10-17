/**
 * Tipos compartilhados entre backend e frontend.
 *
 * REGRA: Todo tipo de resposta de API deve ser definido aqui usando Prisma.XGetPayload
 * para garantir que backend e frontend nunca fiquem desalinhados.
 *
 * Para extensões (ex: _count, relações aninhadas), use Prisma.XGetPayload<{ include: ... }>.
 * Evite interfaces manuais — derive sempre do Prisma.
 */

import type { Prisma } from "@prisma/client";

// Re-export de todos os tipos base do Prisma
export * from "@prisma/client";

// ============================================================================
// Helpers
// ============================================================================

/** Paginação padrão retornada pela API */
export interface Pagination {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

// ============================================================================
// Auth
// ============================================================================

/** Usuário retornado nas rotas de auth (select reduzido) */
export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "MANAGER" | "AGENT";
  operationId: string | null;
  mustChangePassword: boolean;
};

export interface AuthTokens {
  accessToken: string;
  /** Validade do access token, em segundos. */
  expiresIn: number;
  refreshToken: string;
}

export interface LoginResponse extends AuthTokens {
  user: AuthUser;
}

export interface ResetPasswordResponse {
  temporaryPassword: string;
}

export interface GetMeResponse {
  user: AuthUser;
}

// ============================================================================
// Operations
// ============================================================================

export type OperationWithCounts = Prisma.OperationGetPayload<{
  include: {
    _count: {
      select: {
        channels: true;
        users: true;
        agents: true;
        tags: true;
        stages: true;
      };
    };
  };
}>;

export type OperationWithRelations = Prisma.OperationGetPayload<{
  include: {
    channels: { select: { id: true; name: true; type: true; status: true } };
    users: { select: { id: true; name: true; email: true; role: true } };
    agents: { select: { id: true; name: true } };
    tags: { select: { id: true; name: true; color: true } };
    stages: { select: { id: true; name: true; order: true } };
  };
}>;

export interface GetOperationResponse {
  operation: OperationWithCounts | null;
}

export interface GetOperationDetailResponse {
  operation: OperationWithRelations;
}

export interface CreateOperationResponse {
  operation: Prisma.OperationGetPayload<{}>;
}

export interface UpdateOperationResponse {
  operation: Prisma.OperationGetPayload<{}>;
}

// ============================================================================
// Agents
// ============================================================================

export type AgentWithRelations = Prisma.AgentGetPayload<{
  include: {
    operation: { select: { id: true; name: true } };
    user: { select: { id: true; name: true; email: true } };
    channels: {
      select: { id: true; name: true; type: true; status: true };
    };
  };
}>;

export type AgentWithChannels = Prisma.AgentGetPayload<{
  include: {
    channels: {
      select: { id: true; name: true; type: true; status: true };
    };
  };
}>;

export type AgentDetail = Prisma.AgentGetPayload<{
  include: {
    operation: { select: { id: true; name: true } };
    user: { select: { id: true; name: true; email: true; role: true } };
    channels: {
      include: {
        whatsappDetails: true;
        _count: { select: { conversations: true } };
      };
    };
  };
}>;

export interface GetAgentsResponse {
  agents: AgentWithRelations[];
}

export interface GetAgentResponse {
  agent: AgentDetail;
}

export interface CreateAgentResponse {
  agent: Prisma.AgentGetPayload<{
    include: {
      operation: { select: { id: true; name: true } };
      user: { select: { id: true; name: true; email: true } };
    };
  }>;
}

// ============================================================================
// Channels
// ============================================================================

export type ChannelWithDetails = Prisma.ChannelGetPayload<{
  include: {
    whatsappDetails: true;
    operation: { select: { id: true; name: true } };
    agent: { select: { id: true; name: true } };
  };
}>;

/** Item de GET /channels (datas chegam como string ISO no JSON). */
export type ChannelListItem = ChannelWithDetails & {
  _count: { conversations: number };
  /** Canais antigos do mesmo número cujo histórico foi absorvido por este. */
  predecessors: { id: string; name: string; replacedAt: Date | string | null }[];
  /** Última mensagem INBOUND recebida no canal. */
  lastInboundAt: Date | string | null;
};

/** DELETE /channels/:id com conversas: o canal é arquivado (204 quando é apagado). */
export interface DeleteChannelResponse {
  archived: true;
  conversations: number;
}

export interface GetChannelsResponse {
  channels: ChannelListItem[];
}

/** GET /channels/:id/health – consulta ao vivo no WAHA. */
export interface ChannelHealthResponse {
  channelId: string;
  type: Prisma.ChannelGetPayload<{}>["type"];
  /** Status gravado após a checagem. */
  status: Prisma.ChannelGetPayload<{}>["status"];
  /** Status ao vivo no WAHA; "NOT_FOUND" = sessão não existe; null = WAHA inacessível/não se aplica. */
  wahaStatus: "STOPPED" | "STARTING" | "SCAN_QR_CODE" | "WORKING" | "FAILED" | "NOT_FOUND" | null;
  /** Número conectado. */
  me: { phoneNumber: string; pushName: string | null } | null;
  lastInboundAt: string | null;
  /** Webhook da sessão aponta para o app (ausente = não foi possível avaliar). */
  webhookOk?: boolean;
  webhookRepaired?: boolean;
  checkedAt: string;
  error?: string;
  /** Diagnóstico da última tentativa de conexão que falhou (status FAILED). */
  failure?: ChannelConnectFailure;
}

export interface ChannelConnectFailure {
  /** SESSION_FAILED: credencial salva não conectou; WAHA_CANNOT_CONNECT: nem sessão nova gera QR. */
  code: "SESSION_FAILED" | "WAHA_CANNOT_CONNECT";
  error: string;
  at: string;
}

export interface ReconnectChannelResponse {
  channelId: string;
  status: Prisma.ChannelGetPayload<{}>["status"];
  wahaStatus: string;
  /** A sessão não existia no WAHA e foi recriada (precisa escanear o QR). */
  recreated: boolean;
  webhookConfigured: boolean;
  /** Presente quando a sessão terminou em FAILED. */
  failure?: ChannelConnectFailure;
}

export interface CreateWhatsAppChannelResponse {
  channel: Prisma.ChannelGetPayload<{
    include: { whatsappDetails: true };
  }>;
  wahaSession: { name: string; status: string };
}

export interface QRCodeResponse {
  channelId: string;
  qrCode?: string;
  qrValue?: string;
}

export interface ChannelStatusResponse {
  channelId: string;
  type: string;
  status: string;
  wahaStatus?: string;
  phoneNumber?: string;
  pushName?: string;
  error?: string;
}

// ============================================================================
// Companies
// ============================================================================

export type CompanyWithCounts = Prisma.CompanyGetPayload<{
  include: {
    _count: { select: { contacts: true; opportunities: true } };
  };
}>;

export type CompanyWithRelations = Prisma.CompanyGetPayload<{
  include: {
    contacts: {
      include: {
        identities: { select: { type: true; value: true } };
      };
    };
    opportunities: {
      include: {
        stage: { select: { id: true; name: true; color: true } };
        agent: { select: { id: true; name: true } };
      };
    };
  };
}>;

export interface GetCompaniesResponse {
  companies: CompanyWithCounts[];
  pagination: Pagination;
}

export interface GetCompanyResponse {
  company: CompanyWithRelations;
}

export interface CreateCompanyResponse {
  company: Prisma.CompanyGetPayload<{}>;
}

export interface LookupCNPJResponse {
  company: Partial<Prisma.CompanyGetPayload<{}>>;
  source: "database" | "api";
  exists: boolean;
}

// ============================================================================
// Company Timeline
// ============================================================================

export type CompanyTimelineEvent = Prisma.TimelineEventGetPayload<{
  include: {
    contact: { select: { id: true; name: true } };
    conversation: {
      select: {
        id: true;
        channel: { select: { id: true; name: true; type: true } };
      };
    };
  };
}>;

export interface GetCompanyTimelineResponse {
  events: CompanyTimelineEvent[];
  contacts: Array<{ id: string; name: string | null }>;
  pagination: Pagination;
}

// ============================================================================
// Contacts
// ============================================================================

export type ContactWithIdentities = Prisma.ContactGetPayload<{
  include: {
    identities: { select: { id: true; type: true; value: true } };
    tags: {
      include: {
        tag: { select: { id: true; name: true; color: true } };
      };
    };
    company: { select: { id: true; name: true; alias: true; taxId: true } };
    _count: { select: { conversations: true; messages: true } };
  };
}>;

export type ContactDetail = Prisma.ContactGetPayload<{
  include: {
    identities: true;
    tags: { include: { tag: true } };
    company: true;
    insights: { include: { definition: true } };
    conversations: {
      include: {
        channel: { select: { id: true; name: true; type: true } };
        _count: { select: { messages: true } };
      };
    };
  };
}>;

export type ContactCreated = Prisma.ContactGetPayload<{
  include: {
    identities: true;
    company: true;
  };
}>;

export interface GetContactsResponse {
  contacts: ContactWithIdentities[];
  pagination: Pagination;
}

export interface GetContactResponse {
  contact: ContactDetail;
}

export interface CreateContactResponse {
  contact: ContactCreated;
}

export interface LinkContactToCompanyResponse {
  contact: ContactCreated;
}

export interface LinkWhatsAppChatResponse {
  contact: ContactCreated;
  conversation: Prisma.ConversationGetPayload<{}>;
  created: boolean;
}

// ============================================================================
// Contact Timeline
// ============================================================================

export type ContactTimelineEvent = Prisma.TimelineEventGetPayload<{
  include: {
    conversation: {
      select: {
        id: true;
        channel: { select: { id: true; name: true; type: true } };
      };
    };
  };
}>;

export interface GetContactTimelineResponse {
  events: ContactTimelineEvent[];
  pagination: Pagination;
}

// ============================================================================
// Conversations
// ============================================================================

/** Item da lista da mesa (GET /conversations). */
export interface ConversationListItem {
  id: string;
  status: Prisma.ConversationGetPayload<{}>["status"];
  lastMessageAt: string;
  contact: {
    id: string;
    name: string | null;
    avatarUrl: string | null;
    company: { id: string; name: string } | null;
  };
  channel: {
    id: string;
    name: string;
    type: Prisma.ChannelGetPayload<{}>["type"];
  };
  assignedAgent: { id: string; name: string; avatarUrl: string | null } | null;
  queue: { id: string; name: string } | null;
  lastMessage: {
    content: string | null;
    direction: Prisma.MessageGetPayload<{}>["direction"];
    sentAt: string;
    /** Tipo da mídia da última mensagem (prévia "Foto", "Áudio"...). */
    mediaKind: DeskMediaKind | null;
  } | null;
  unreadCount: number;
}

/** Detalhe (GET /conversations/:id): item da lista + campos extras. */
export interface ConversationDetail extends ConversationListItem {
  summary: string | null;
  firstResponseAt: string | null;
  resolvedAt: string | null;
  csat: { score: number; comment: string | null } | null;
}

export interface GetConversationsResponse {
  conversations: ConversationListItem[];
  nextCursor: string | null;
}

export interface GetConversationResponse {
  conversation: ConversationDetail;
}

export interface SendMessageResponse {
  message: Prisma.MessageGetPayload<{}>;
}

export interface ConversationActionResponse {
  conversation: ConversationDetail;
}

export interface CreateNoteResponse {
  event: Prisma.TimelineEventGetPayload<{}>;
}

// ============================================================================
// Filas
// ============================================================================

export interface DeskQueue {
  id: string;
  name: string;
  members: Array<{ id: string; name: string; avatarUrl: string | null }>;
}

export interface GetQueuesResponse {
  queues: DeskQueue[];
}

export interface QueueResponse {
  queue: DeskQueue;
}

// ============================================================================
// Métricas da mesa
// ============================================================================

export interface DeskMetricsResponse {
  totals: { open: number; pending: number; resolved: number; unassigned: number };
  firstResponseAvgSeconds: number | null;
  resolutionAvgSeconds: number | null;
  csat: { avg: number | null; count: number };
  byAgent: Array<{
    agentId: string;
    name: string;
    handled: number;
    resolved: number;
    firstResponseAvgSeconds: number | null;
    csatAvg: number | null;
  }>;
  byQueue: Array<{ queueId: string; name: string; open: number; pending: number }>;
  volumeByDay: Array<{ date: string; inbound: number; outbound: number }>;
}

export type DeskMediaKind =
  | "image"
  | "sticker"
  | "video"
  | "audio"
  | "voice"
  | "document"
  | "location"
  | "contact";

export type DeskDeliveryAck = "pending" | "sent" | "delivered" | "read";

export interface DeskMessageMedia {
  kind: DeskMediaKind;
  mimetype: string | null;
  filename: string | null;
  caption: string | null;
  /** Caminho assinado e de curta duração (relativo à API: `/media/:id?exp=&sig=`). Null = indisponível. */
  url: string | null;
  available: boolean;
  /** Download ainda em andamento (mostrar "carregando", não "indisponível"). */
  pending: boolean;
  size: number | null;
}

/** Mensagem da conversa (GET /conversations/:id/messages). Sem o payload cru do provedor. */
export interface DeskThreadMessage
  extends Omit<Prisma.MessageGetPayload<{}>, "payload" | "metadata"> {
  media: DeskMessageMedia | null;
  /** Resposta a outra mensagem: `id` = mensagem citada nesta conversa (se encontrada). */
  replyTo: { id: string | null; text: string | null } | null;
  location: { lat: number; lng: number; name: string | null } | null;
  contactCard: { name: string | null; phone: string | null } | null;
  /** Status de entrega (só mensagens enviadas). */
  ack: DeskDeliveryAck | null;
}

export interface GetMessagesResponse {
  messages: DeskThreadMessage[];
  hasMore: boolean;
}

// ============================================================================
// Opportunities
// ============================================================================

export type OpportunityListItem = Prisma.OpportunityGetPayload<{
  include: {
    company: { select: { id: true; name: true; alias: true; taxId: true } };
    stage: { select: { id: true; name: true; color: true; order: true } };
    agent: { select: { id: true; name: true; avatarUrl: true } };
  };
}>;

export type OpportunityDetail = Prisma.OpportunityGetPayload<{
  include: {
    company: true;
    stage: true;
    agent: { select: { id: true; name: true; avatarUrl: true } };
  };
}>;

export interface GetOpportunitiesResponse {
  opportunities: OpportunityListItem[];
  pagination: Pagination;
}

export interface GetOpportunityResponse {
  opportunity: OpportunityListItem;
}

export interface GetOpportunityDetailResponse {
  opportunity: OpportunityDetail;
}

export interface KanbanColumn {
  stage: { id: string; name: string; color: string | null; order: number };
  opportunities: Array<
    Prisma.OpportunityGetPayload<{
      include: {
        company: {
          select: { id: true; name: true; alias: true; taxId: true };
        };
        agent: { select: { id: true; name: true; avatarUrl: true } };
      };
    }>
  >;
  count: number;
}

export interface GetOpportunitiesKanbanResponse {
  columns: KanbanColumn[];
}

// ============================================================================
// Opportunity Timeline
// ============================================================================

export type OpportunityTimelineEvent = Prisma.TimelineEventGetPayload<{
  include: {
    contact: { select: { id: true; name: true } };
    conversation: {
      select: {
        id: true;
        channel: { select: { id: true; name: true; type: true } };
      };
    };
  };
}>;

export interface GetOpportunityTimelineResponse {
  events: OpportunityTimelineEvent[];
  contacts: Array<{ id: string; name: string | null }>;
  company: { id: string; name: string };
  pagination: Pagination;
}

// ============================================================================
// Stages
// ============================================================================

export type StageWithRelations = Prisma.StageGetPayload<{
  include: {
    operation: { select: { id: true; name: true } };
    _count: { select: { opportunities: true } };
  };
}>;

export interface GetStagesResponse {
  stages: StageWithRelations[];
}

export interface GetStageResponse {
  stage: StageWithRelations;
}

export interface CreateStageResponse {
  stage: Prisma.StageGetPayload<{
    include: { operation: { select: { id: true; name: true } } };
  }>;
}

export interface ReorderStagesResponse {
  stages: Prisma.StageGetPayload<{}>[];
}

// ============================================================================
// Tags
// ============================================================================

export type TagWithRelations = Prisma.TagGetPayload<{
  include: {
    operation: { select: { id: true; name: true } };
    _count: { select: { contacts: true } };
  };
}>;

export interface GetTagsResponse {
  tags: TagWithRelations[];
}

export interface GetTagResponse {
  tag: TagWithRelations;
}

export interface CreateTagResponse {
  tag: Prisma.TagGetPayload<{
    include: { operation: { select: { id: true; name: true } } };
  }>;
}

// ============================================================================
// Users
// ============================================================================

export type UserWithRelations = Prisma.UserGetPayload<{
  include: {
    operation: { select: { id: true; name: true } };
    agent: { select: { id: true; name: true } };
  };
}>;

export type UserDetail = Prisma.UserGetPayload<{
  include: {
    operation: { select: { id: true; name: true } };
    agent: {
      include: {
        channels: {
          select: { id: true; name: true; type: true; status: true };
        };
      };
    };
  };
}>;

export interface GetUsersResponse {
  users: UserWithRelations[];
}

export interface GetUserResponse {
  user: UserDetail;
}

export interface CreateUserResponse {
  user: Omit<
    Prisma.UserGetPayload<{
      include: { operation: { select: { id: true; name: true } } };
    }>,
    "passwordHash"
  >;
  /** Mostrada uma única vez; troca obrigatória no primeiro acesso. */
  temporaryPassword: string;
}

// ============================================================================
// WhatsApp Chats (dados do WAHA, não do Prisma)
// ============================================================================

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

export interface WhatsAppChatsPagination {
  offset: number;
  limit: number;
  hasMore: boolean;
  totalFetched: number;
}

export interface GetWhatsAppChatsResponse {
  chats: WhatsAppChat[];
  pagination: WhatsAppChatsPagination;
}

// ============================================================================
// Company Insights
// ============================================================================

export type CompanyInsight = Prisma.ContactInsightGetPayload<{
  include: {
    definition: { select: { id: true; name: true; slug: true } };
    contact: { select: { id: true; name: true } };
  };
}>;

export interface GetCompanyInsightsResponse {
  insights: CompanyInsight[];
}
