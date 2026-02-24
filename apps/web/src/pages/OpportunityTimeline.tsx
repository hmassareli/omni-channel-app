import {
  ArrowLeft,
  Building2,
  CheckCircle,
  ChevronDown,
  Clock,
  DollarSign,
  MessageSquare,
  User,
} from "lucide-react";
import { useEffect, useState } from "react";
import * as api from "../lib/api";

// ============================================================================
// Helpers
// ============================================================================

function getOpportunityIdFromUrl(): string | null {
  const path = window.location.pathname;
  const match = path.match(/\/opportunities\/([^/]+)/);
  return match ? match[1] : null;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);

  if (diffHours < 24) {
    return `Hoje às ${date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
  }
  if (diffHours < 48) {
    return `Ontem às ${date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
  }
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatCurrency(value: number | null | undefined): string {
  if (!value) return "—";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function formatCNPJ(cnpj: string | null | undefined): string {
  if (!cnpj) return "—";
  return cnpj.replace(
    /(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/,
    "$1.$2.$3/$4-$5",
  );
}

// ============================================================================
// Sub-components
// ============================================================================

const OpportunityHeader = ({
  companyName,
  cnpj,
  onBack,
}: {
  companyName: string;
  cnpj: string | null;
  onBack: () => void;
}) => (
  <div className="px-6 py-4 bg-white flex items-center gap-4 border-b border-gray-200">
    <button
      onClick={onBack}
      className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
    >
      <ArrowLeft className="w-5 h-5 text-gray-600" />
    </button>
    <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center">
      <Building2 className="w-6 h-6 text-purple-600" />
    </div>
    <div className="flex-1">
      <h1 className="text-xl font-semibold text-gray-800">{companyName}</h1>
      <span className="text-sm text-gray-500">
        CNPJ: {formatCNPJ(cnpj)}
      </span>
    </div>
  </div>
);

const PipelineSteps = ({
  stages,
  currentStageId,
  onStageClick,
}: {
  stages: api.Stage[];
  currentStageId: string | null;
  onStageClick: (stageId: string) => void;
}) => {
  const currentIndex = stages.findIndex((s) => s.id === currentStageId);

  return (
    <div className="flex w-full bg-white border-b border-gray-200">
      {stages.map((stage, index) => (
        <button
          key={stage.id}
          onClick={() => onStageClick(stage.id)}
          className={`
            flex-1 py-3 text-center text-sm font-medium cursor-pointer transition-colors
            ${
              index === currentIndex
                ? "bg-purple-600 text-white"
                : index < currentIndex
                  ? "bg-purple-100 text-purple-700"
                  : "bg-white text-gray-500 hover:bg-gray-50"
            }
            ${index < stages.length - 1 ? "border-r border-gray-200" : ""}
          `}
        >
          {stage.name}
        </button>
      ))}
    </div>
  );
};

const SidebarSection = ({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  return (
    <div className="mb-4 border-b border-gray-100 pb-4">
      <div
        className="flex justify-between items-center cursor-pointer py-2 hover:bg-gray-50 px-2 rounded"
        onClick={() => setIsOpen(!isOpen)}
      >
        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
          {title}
        </h3>
        <ChevronDown
          className={`h-4 w-4 text-gray-400 transition-transform ${isOpen ? "" : "-rotate-90"}`}
        />
      </div>
      {isOpen && <div className="mt-2 px-2">{children}</div>}
    </div>
  );
};

const InfoRow = ({ label, value }: { label: string; value: string }) => (
  <div className="flex justify-between items-center py-2 text-sm">
    <span className="text-gray-500">{label}</span>
    <span className="text-gray-800 font-medium">{value || "—"}</span>
  </div>
);

const ContactBadge = ({
  name,
  role,
}: {
  name: string | null;
  role?: string;
}) => (
  <div className="flex items-center gap-2 py-2">
    <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">
      <User className="w-4 h-4 text-gray-600" />
    </div>
    <div>
      <p className="text-sm font-medium text-gray-800">
        {name || "Sem nome"}
      </p>
      {role && <p className="text-xs text-gray-500">{role}</p>}
    </div>
  </div>
);

const TimelineMessage = ({
  sender,
  time,
  message,
  isInbound,
  channelName,
}: {
  sender: string;
  time: string;
  message: string;
  isInbound: boolean;
  channelName?: string;
}) => (
  <div className={`flex gap-3 mb-4 ${isInbound ? "" : "flex-row-reverse"}`}>
    <div
      className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
        isInbound ? "bg-gray-200 text-gray-600" : "bg-purple-600 text-white"
      }`}
    >
      <User className="h-4 w-4" />
    </div>
    <div className={`max-w-[70%] ${isInbound ? "" : "text-right"}`}>
      <div
        className={`inline-block p-3 rounded-lg ${
          isInbound
            ? "bg-white border border-gray-200 text-gray-800"
            : "bg-purple-600 text-white"
        }`}
      >
        <p className="text-sm">{message}</p>
      </div>
      <div
        className={`flex items-center gap-1 mt-1 text-xs text-gray-400 ${isInbound ? "" : "justify-end"}`}
      >
        <Clock className="h-3 w-3" />
        <span>{formatDate(time)}</span>
        <span>• {sender}</span>
        {channelName && <span className="text-purple-400">• {channelName}</span>}
      </div>
    </div>
  </div>
);

const TimelineEvent = ({
  time,
  title,
  type,
}: {
  time: string;
  title: string;
  type: "create" | "stage_change" | "system";
}) => (
  <div className="flex items-center gap-3 mb-4 py-2">
    <div
      className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
        type === "create"
          ? "bg-green-100 text-green-600"
          : type === "stage_change"
            ? "bg-purple-100 text-purple-600"
            : "bg-gray-100 text-gray-600"
      }`}
    >
      <CheckCircle className="h-4 w-4" />
    </div>
    <div className="flex-1 flex items-center justify-between">
      <span className="text-sm text-gray-600">{title}</span>
      <span className="text-xs text-gray-400">{formatDate(time)}</span>
    </div>
  </div>
);

// ============================================================================
// Main Component
// ============================================================================

export function OpportunityTimeline() {
  const id = getOpportunityIdFromUrl();
  const [opportunity, setOpportunity] = useState<api.OpportunityDetail | null>(null);
  const [timeline, setTimeline] = useState<api.OpportunityTimelineResponse | null>(null);
  const [stages, setStages] = useState<api.Stage[]>([]);
  const [loading, setLoading] = useState(true);
  const [movingStage, setMovingStage] = useState(false);

  const fetchData = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [oppData, timelineData, stagesData] = await Promise.all([
        api.getOpportunity(id),
        api.getOpportunityTimeline(id, { limit: 100 }),
        api.getStages(),
      ]);
      setOpportunity(oppData);
      setTimeline(timelineData);
      setStages(stagesData);
    } catch (error) {
      console.error("Erro ao buscar dados da oportunidade:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [id]);

  const handleStageClick = async (stageId: string) => {
    if (!opportunity || stageId === opportunity.stageId || movingStage) return;
    setMovingStage(true);
    try {
      await api.moveOpportunity(opportunity.id, stageId);
      // Refetch to get updated stage details
      const updated = await api.getOpportunity(opportunity.id);
      setOpportunity(updated);
    } catch (error) {
      console.error("Erro ao mover oportunidade:", error);
    } finally {
      setMovingStage(false);
    }
  };

  if (!id) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">Oportunidade não encontrada</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <svg
            className="animate-spin h-8 w-8 text-purple-600 mx-auto mb-4"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            ></circle>
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            ></path>
          </svg>
          <p className="text-gray-500">Carregando oportunidade...</p>
        </div>
      </div>
    );
  }

  if (!opportunity) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">Oportunidade não encontrada</p>
          <a
            href="/opportunities"
            className="text-purple-600 hover:text-purple-700 text-sm mt-2 inline-block"
          >
            Voltar para oportunidades
          </a>
        </div>
      </div>
    );
  }

  const company = opportunity.company;
  const contacts = timeline?.contacts || [];

  return (
    <div className="flex-1 flex flex-col">
      {/* Header + Pipeline */}
      <div className="bg-white shadow-sm">
        <OpportunityHeader
          companyName={company.alias || company.name}
          cnpj={company.taxId}
          onBack={() => (window.location.href = "/opportunities")}
        />
        <PipelineSteps
          stages={stages}
          currentStageId={opportunity.stageId}
          onStageClick={handleStageClick}
        />
      </div>

      {/* Conteúdo Principal */}
      <main className="flex-1 w-full px-6 py-6 grid grid-cols-12 gap-6 overflow-auto">
        {/* Sidebar Esquerda */}
        <aside className="col-span-3 bg-white rounded-lg border border-gray-200 p-4 h-fit shadow-sm">
          <SidebarSection title="Dados da Empresa">
            <InfoRow label="Razão Social" value={company.name} />
            <InfoRow label="Nome Fantasia" value={company.alias || "—"} />
            <InfoRow label="CNPJ" value={formatCNPJ(company.taxId)} />
            {company.status && (
              <InfoRow label="Situação" value={company.status} />
            )}
            {company.addressCity && (
              <InfoRow
                label="Localização"
                value={`${company.addressCity} - ${company.addressState}`}
              />
            )}
            <a
              href={`/companies/${company.id}`}
              className="text-purple-600 hover:text-purple-700 text-xs mt-1 inline-block"
            >
              Ver página da empresa →
            </a>
          </SidebarSection>

          <SidebarSection title="Oportunidade">
            <InfoRow
              label="Estágio"
              value={opportunity.stage?.name || "—"}
            />
            <InfoRow
              label="Valor Estimado"
              value={formatCurrency(Number(opportunity.estimatedValue) || null)}
            />
            <InfoRow
              label="Responsável"
              value={opportunity.agent?.name || "Não atribuído"}
            />
            {opportunity.notes && (
              <div className="mt-2">
                <p className="text-xs text-gray-500 mb-1">Observações</p>
                <p className="text-sm text-gray-700 bg-gray-50 p-2 rounded">
                  {opportunity.notes}
                </p>
              </div>
            )}
          </SidebarSection>

          <SidebarSection title={`Contatos (${contacts.length})`}>
            {contacts.length === 0 ? (
              <p className="text-sm text-gray-500">Nenhum contato vinculado</p>
            ) : (
              contacts.map((contact) => (
                <ContactBadge
                  key={contact.id}
                  name={contact.name}
                />
              ))
            )}
          </SidebarSection>
        </aside>

        {/* Timeline Central */}
        <div className="col-span-9">
          <div className="flex items-center gap-2 mb-4">
            <MessageSquare className="w-5 h-5 text-purple-600" />
            <h2 className="text-lg font-semibold text-gray-800">
              Histórico 360°
            </h2>
            <span className="text-sm text-gray-400">
              • {timeline?.pagination.total || 0} eventos
            </span>
          </div>

          <div className="bg-gray-100 rounded-lg p-4 mb-4 min-h-[400px] max-h-[600px] overflow-y-auto">
            {!timeline || timeline.events.length === 0 ? (
              <div className="flex items-center justify-center h-64 text-gray-500">
                <div className="text-center">
                  <MessageSquare className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                  <p>Nenhum evento na timeline</p>
                  <p className="text-sm text-gray-400 mt-1">
                    Vincule contatos WhatsApp à empresa para ver o histórico
                  </p>
                </div>
              </div>
            ) : (
              timeline.events
                .slice()
                .sort(
                  (a, b) =>
                    new Date(a.occurredAt).getTime() -
                    new Date(b.occurredAt).getTime(),
                )
                .map((event) => {
                  if (
                    event.type === "MESSAGE_SENT" ||
                    event.type === "MESSAGE_RECEIVED"
                  ) {
                    return (
                      <TimelineMessage
                        key={event.id}
                        sender={event.contact.name || "Contato"}
                        time={event.occurredAt}
                        message={event.content}
                        isInbound={event.type === "MESSAGE_RECEIVED"}
                        channelName={
                          event.conversation?.channel.name || undefined
                        }
                      />
                    );
                  }
                  return (
                    <TimelineEvent
                      key={event.id}
                      time={event.occurredAt}
                      title={event.content}
                      type={
                        event.type === "STAGE_CHANGE"
                          ? "stage_change"
                          : event.type.includes("CREATE")
                            ? "create"
                            : "system"
                      }
                    />
                  );
                })
            )}
          </div>

          {/* Resumo rápido */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <MessageSquare className="w-4 h-4 text-purple-600" />
                <span className="text-sm font-medium text-gray-700">
                  Mensagens
                </span>
              </div>
              <p className="text-2xl font-bold text-gray-800">
                {timeline?.events.filter(
                  (e) =>
                    e.type === "MESSAGE_SENT" ||
                    e.type === "MESSAGE_RECEIVED",
                ).length || 0}
              </p>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <User className="w-4 h-4 text-blue-600" />
                <span className="text-sm font-medium text-gray-700">
                  Contatos
                </span>
              </div>
              <p className="text-2xl font-bold text-gray-800">
                {contacts.length}
              </p>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="w-4 h-4 text-green-600" />
                <span className="text-sm font-medium text-gray-700">
                  Valor
                </span>
              </div>
              <p className="text-2xl font-bold text-green-600">
                {formatCurrency(Number(opportunity.estimatedValue) || null)}
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
