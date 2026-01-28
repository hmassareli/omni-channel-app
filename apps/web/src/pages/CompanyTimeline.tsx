import {
  Building2,
  CheckCircle,
  ChevronDown,
  Clock,
  MessageSquare,
  User,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import * as api from "../lib/api";

// ============================================================================
// Components
// ============================================================================

const ContactHeader = ({ companyName, cnpj }) => (
  <div className="px-6 py-4 bg-white flex justify-between items-center border-b border-gray-200">
    <div className="flex items-start gap-4">
      <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center">
        <Building2 className="w-6 h-6 text-purple-600" />
      </div>
      <div>
        <h1 className="text-xl font-semibold text-gray-800">{companyName}</h1>
        <div className="flex items-center gap-2 mt-1 text-gray-500 text-sm">
          <span>CNPJ: {cnpj.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5")}</span>
        </div>
      </div>
    </div>

    <div className="flex gap-2">
      <button className="px-4 py-2 bg-red-500 text-white text-sm font-medium rounded hover:bg-red-600">
        Marcar como Perdido
      </button>
      <button className="px-4 py-2 bg-green-500 text-white text-sm font-medium rounded hover:bg-green-600">
        Marcar como Ganho
      </button>
    </div>
  </div>
);

const SidebarSection = ({ title, children, defaultOpen = true }) => {
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

const InfoRow = ({ label, value }) => (
  <div className="flex justify-between items-center py-2 text-sm">
    <span className="text-gray-500">{label}</span>
    <span className="text-gray-800 font-medium">{value || "—"}</span>
  </div>
);

const ContactBadge = ({ name, phone }) => (
  <div className="flex items-center justify-between py-2">
    <div className="flex items-center gap-2">
      <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">
        <User className="w-4 h-4 text-gray-600" />
      </div>
      <div>
        <p className="text-sm font-medium text-gray-800">{name || "Sem nome"}</p>
        <p className="text-xs text-gray-500">{phone}</p>
      </div>
    </div>
  </div>
);

const TimelineMessage = ({ sender, time, message, isInbound, channelName }) => (
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
        <span>{new Date(time).toLocaleString("pt-BR")}</span>
        <span>• {sender}</span>
        <span>• {channelName}</span>
      </div>
    </div>
  </div>
);

const TimelineEvent = ({ time, title, type }) => (
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
      <span className="text-xs text-gray-400">
        {new Date(time).toLocaleString("pt-BR")}
      </span>
    </div>
  </div>
);

// ============================================================================
// Main Component
// ============================================================================

export function CompanyTimeline() {
  const { id } = useParams();
  const [company, setCompany] = useState(null);
  const [timeline, setTimeline] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("timeline");

  useEffect(() => {
    const fetchData = async () => {
      if (!id) return;
      setLoading(true);

      try {
        const [companyData, timelineData] = await Promise.all([
          api.getCompany(id),
          api.getCompanyTimeline(id),
        ]);
        setCompany(companyData.company);
        setTimeline(timelineData);
      } catch (error) {
        console.error("Erro ao buscar dados:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [id]);

  const formatCurrency = (value) => {
    if (!value) return "—";
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

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
          <p className="text-gray-500">Carregando dados da empresa...</p>
        </div>
      </div>
    );
  }

  if (!company) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">Empresa não encontrada</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col">
      <ContactHeader companyName={company.alias || company.name} cnpj={company.taxId} />

      <main className="flex-1 w-full px-6 py-6 grid grid-cols-12 gap-6 overflow-auto">
        <aside className="col-span-3 bg-white rounded-lg border border-gray-200 p-4 h-fit shadow-sm">
          <SidebarSection title="Dados da Empresa">
            <InfoRow label="Razão Social" value={company.name} />
            <InfoRow label="Status" value={company.status} />
            <InfoRow label="Porte" value={company.sizeText} />
            <InfoRow label="Atividade Principal" value={company.mainActivityText} />
            <InfoRow label="Cidade" value={`${company.addressCity} - ${company.addressState}`} />
          </SidebarSection>

          <SidebarSection title="Contatos">
            {company.contacts.map((contact) => {
              const phone = contact.identities.find((i) => i.type === "WHATSAPP")?.value;
              return (
                <ContactBadge
                  key={contact.id}
                  name={contact.name}
                  phone={phone || "Sem telefone"}
                />
              );
            })}
            {company.contacts.length === 0 && (
              <p className="text-sm text-gray-500">Nenhum contato vinculado</p>
            )}
          </SidebarSection>

          <SidebarSection title="Oportunidades">
            {company.opportunities.map((opp) => (
              <div key={opp.id} className="py-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">{opp.stage?.name || "Sem estágio"}</span>
                  <span className="font-medium">{formatCurrency(opp.estimatedValue)}</span>
                </div>
                {opp.agent && (
                  <p className="text-xs text-gray-500">{opp.agent.name}</p>
                )}
              </div>
            ))}
            {company.opportunities.length === 0 && (
              <p className="text-sm text-gray-500">Nenhuma oportunidade</p>
            )}
          </SidebarSection>

          {company.wealthSigns && (
            <SidebarSection title="Insights (WealthSigns)">
              <pre className="text-xs bg-gray-50 p-2 rounded overflow-auto">
                {JSON.stringify(company.wealthSigns, null, 2)}
              </pre>
            </SidebarSection>
          )}
        </aside>

        <div className="col-span-9">
          <div className="flex gap-2 mb-4 border-b border-gray-200">
            <button
              onClick={() => setActiveTab("timeline")}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "timeline"
                  ? "border-purple-600 text-purple-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              Timeline
            </button>
            <button
              onClick={() => setActiveTab("contacts")}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "contacts"
                  ? "border-purple-600 text-purple-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              Contatos ({company.contacts.length})
            </button>
            <button
              onClick={() => setActiveTab("opportunities")}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "opportunities"
                  ? "border-purple-600 text-purple-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              Oportunidades ({company.opportunities.length})
            </button>
          </div>

          {activeTab === "timeline" && timeline && (
            <>
              <div className="flex items-center gap-2 mb-4">
                <MessageSquare className="w-5 h-5 text-purple-600" />
                <h2 className="text-lg font-semibold text-gray-800">Timeline</h2>
                <span className="text-sm text-gray-400">• Todos os contatos</span>
              </div>

              <div className="bg-gray-100 rounded-lg p-4 mb-4 min-h-[400px] max-h-[500px] overflow-y-auto">
                {timeline.events.length === 0 ? (
                  <div className="flex items-center justify-center h-64 text-gray-500">
                    Nenhum evento na timeline
                  </div>
                ) : (
                  <>
                    {timeline.events.map((event) => {
                      if (event.type === "MESSAGE_SENT" || event.type === "MESSAGE_RECEIVED") {
                        return (
                          <TimelineMessage
                            key={event.id}
                            sender={event.contact.name || "Contato"}
                            time={event.occurredAt}
                            message={event.content}
                            isInbound={event.type === "MESSAGE_RECEIVED"}
                            channelName={event.conversation?.channel.name || "Desconhecido"}
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
                    })}
                  </>
                )}
              </div>
            </>
          )}

          {activeTab === "contacts" && (
            <div className="bg-white rounded-lg border border-gray-200">
              {company.contacts.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  Nenhum contato vinculado a esta empresa
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {company.contacts.map((contact) => (
                    <div key={contact.id} className="p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center">
                          <User className="w-5 h-5 text-gray-600" />
                        </div>
                        <div>
                          <p className="font-medium text-gray-800">
                            {contact.name || "Sem nome"}
                          </p>
                          <p className="text-sm text-gray-500">
                            {contact.identities.map((i) => i.value).join(", ")}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === "opportunities" && (
            <div className="bg-white rounded-lg border border-gray-200">
              {company.opportunities.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  Nenhuma oportunidade para esta empresa
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {company.opportunities.map((opp) => (
                    <div key={opp.id} className="p-4 flex items-center justify-between">
                      <div>
                        <p className="font-medium text-gray-800">
                          {opp.stage?.name || "Sem estágio"}
                        </p>
                        <p className="text-sm text-gray-500">
                          {opp.agent?.name || "Sem atendente"}
                        </p>
                      </div>
                      <span className="font-semibold text-green-600">
                        {formatCurrency(opp.estimatedValue)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
