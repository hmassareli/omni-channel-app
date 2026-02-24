import {
  Building2,
  CheckCircle,
  ChevronDown,
  Clock,
  Link,
  MessageSquare,
  Plus,
  Search,
  User,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import * as api from "../lib/api";

// Helper para extrair ID da URL
function getCompanyIdFromUrl(): string | null {
  const path = window.location.pathname;
  const match = path.match(/\/companies\/([^/]+)/);
  return match ? match[1] : null;
}

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
          <span>
            CNPJ:{" "}
            {cnpj?.replace(
              /(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/,
              "$1.$2.$3/$4-$5",
            ) || "—"}
          </span>
        </div>
      </div>
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
        <p className="text-sm font-medium text-gray-800">
          {name || "Sem nome"}
        </p>
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
// Modals
// ============================================================================

const CreateOpportunityModal = ({
  isOpen,
  onClose,
  onCreated,
  companyId,
  stages,
}) => {
  const [stageId, setStageId] = useState("");
  const [estimatedValue, setEstimatedValue] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (stages.length > 0 && !stageId) {
      setStageId(stages[0].id);
    }
  }, [stages, stageId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await api.createOpportunity({
        companyId,
        stageId,
        estimatedValue: estimatedValue ? parseFloat(estimatedValue) : undefined,
        notes: notes || undefined,
      });
      onCreated();
      onClose();
      setEstimatedValue("");
      setNotes("");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Erro ao criar oportunidade",
      );
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl w-full max-w-md mx-4 shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold text-gray-800">
            Nova Oportunidade
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          {error && (
            <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg mb-4">
              {error}
            </div>
          )}

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Estágio *
            </label>
            <select
              value={stageId}
              onChange={(e) => setStageId(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none"
              required
            >
              {stages.map((stage) => (
                <option key={stage.id} value={stage.id}>
                  {stage.name}
                </option>
              ))}
            </select>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Valor Estimado (R$)
            </label>
            <input
              type="number"
              value={estimatedValue}
              onChange={(e) => setEstimatedValue(e.target.value)}
              placeholder="0,00"
              step="0.01"
              min="0"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none"
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Observações
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notas sobre a oportunidade..."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none resize-none"
              rows={3}
            />
          </div>

          <div className="flex gap-3 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {loading ? "Criando..." : "Criar Oportunidade"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

type ContactModalTab = "whatsapp" | "manual";

const CreateContactModal = ({
  isOpen,
  onClose,
  onCreated,
  companyId,
  channels,
}) => {
  const [activeTab, setActiveTab] = useState<ContactModalTab>("whatsapp");

  // WhatsApp tab state
  const [search, setSearch] = useState("");
  const [chats, setChats] = useState<api.WhatsAppChat[]>([]);
  const [selectedChat, setSelectedChat] = useState<api.WhatsAppChat | null>(
    null,
  );
  const [searchLoading, setSearchLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const wahaOffset = useRef(0);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Shared form state
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Usa o primeiro canal WhatsApp disponível
  const channelId = channels.find(
    (c: { type: string }) => c.type === "WHATSAPP",
  )?.id;

  // Carrega chats iniciais (sem busca)
  const loadInitialChats = async () => {
    if (!channelId) return;

    setSearchLoading(true);
    setChats([]);
    setHasMore(true);
    wahaOffset.current = 0;
    try {
      const result = await api.getWhatsAppChats(channelId, {
        limit: 50,
        offset: 0,
      });
      setChats(result.chats.filter((c) => !c.linkedToCompany));
      setHasMore(result.hasMore);
      wahaOffset.current = result.nextOffset;
      setFetchError(null);
    } catch (err) {
      console.error("Erro ao buscar chats:", err);
      setChats([]);
      setFetchError(
        "Não foi possível carregar os chats do WhatsApp. Tente novamente ou crie o contato manualmente.",
      );
    } finally {
      setSearchLoading(false);
    }
  };

  // Carrega mais chats (próxima página)
  const loadMoreChats = async () => {
    if (!channelId || loadingMore || !hasMore) return;

    setLoadingMore(true);
    try {
      const result = await api.getWhatsAppChats(channelId, {
        search: search || undefined,
        limit: 50,
        offset: wahaOffset.current,
      });
      const newChats = result.chats.filter((c) => !c.linkedToCompany);
      setChats((prev) => [...prev, ...newChats]);
      setHasMore(result.hasMore);
      wahaOffset.current = result.nextOffset;
    } catch (err) {
      console.error("Erro ao carregar mais chats:", err);
    } finally {
      setLoadingMore(false);
    }
  };

  // Busca com termo específico
  const searchChats = async (searchTerm: string) => {
    if (!channelId) return;

    setSearchLoading(true);
    setChats([]);
    setHasMore(true);
    wahaOffset.current = 0;
    try {
      const result = await api.getWhatsAppChats(channelId, {
        search: searchTerm || undefined,
        limit: 100, // Busca mais quando tem termo de pesquisa
        offset: 0,
      });
      setChats(result.chats.filter((c) => !c.linkedToCompany));
      setHasMore(result.hasMore);
      wahaOffset.current = result.nextOffset;
      setFetchError(null);
    } catch (err) {
      console.error("Erro ao buscar chats:", err);
      setChats([]);
      setFetchError(
        "Não foi possível carregar os chats do WhatsApp. Tente novamente ou crie o contato manualmente.",
      );
    } finally {
      setSearchLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && channelId && activeTab === "whatsapp") {
      loadInitialChats();
    }
  }, [isOpen, channelId, activeTab]);

  useEffect(() => {
    const debounce = setTimeout(() => {
      if (isOpen && channelId && activeTab === "whatsapp" && search) {
        searchChats(search);
      }
    }, 400);
    return () => clearTimeout(debounce);
  }, [search, isOpen, channelId, activeTab]);

  const handleSelectChat = (chat: api.WhatsAppChat) => {
    setSelectedChat(chat);
    setName(chat.name || "");
    setPhone(chat.waId);
  };

  const resetForm = () => {
    setSelectedChat(null);
    setName("");
    setPhone("");
    setEmail("");
    setRole("");
    setSearch("");
    setError(null);
  };

  const handleSubmitWhatsApp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedChat || !channelId) return;

    setLoading(true);
    setError(null);

    try {
      await api.linkWhatsAppChat({
        waId: selectedChat.waId,
        companyId,
        channelId,
        name: name || undefined,
        role: role || undefined,
      });
      onCreated();
      onClose();
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao vincular contato");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name && !phone && !email) return;

    setLoading(true);
    setError(null);

    try {
      await api.createContact({
        name: name || undefined,
        phone: phone || undefined,
        email: email || undefined,
        companyId,
        role: role || undefined,
      });
      onCreated();
      onClose();
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao criar contato");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const formatPhone = (waId: string) => {
    const match = waId.match(/^(\d{2})(\d{2})(\d{5})(\d{4})$/);
    if (match) {
      return `+${match[1]} (${match[2]}) ${match[3]}-${match[4]}`;
    }
    return waId;
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    const now = new Date();
    const diffDays = Math.floor(
      (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24),
    );

    if (diffDays === 0) {
      return date.toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
      });
    } else if (diffDays === 1) {
      return "Ontem";
    } else if (diffDays < 7) {
      return date.toLocaleDateString("pt-BR", { weekday: "short" });
    }
    return date.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl w-full max-w-lg mx-4 shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
          <h2 className="text-lg font-semibold text-gray-800">
            {selectedChat ? "Vincular Contato" : "Novo Contato"}
          </h2>
          <button
            onClick={() => {
              onClose();
              resetForm();
            }}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs - só mostra se não tem chat selecionado */}
        {!selectedChat && (
          <div className="flex border-b shrink-0">
            <button
              onClick={() => setActiveTab("whatsapp")}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === "whatsapp"
                  ? "text-purple-600 border-b-2 border-purple-600 bg-purple-50"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <MessageSquare className="w-4 h-4 inline mr-2" />
              Vincular WhatsApp
            </button>
            <button
              onClick={() => setActiveTab("manual")}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === "manual"
                  ? "text-purple-600 border-b-2 border-purple-600 bg-purple-50"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <User className="w-4 h-4 inline mr-2" />
              Criar Manualmente
            </button>
          </div>
        )}

        {error && (
          <div className="mx-6 mt-4 bg-red-50 text-red-600 text-sm p-3 rounded-lg">
            {error}
          </div>
        )}

        {/* WhatsApp Tab - Chat Selecionado */}
        {selectedChat ? (
          <form onSubmit={handleSubmitWhatsApp} className="p-6">
            <div className="bg-green-50 rounded-lg p-4 mb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                  <MessageSquare className="w-6 h-6 text-green-600" />
                </div>
                <div>
                  <p className="font-medium text-gray-800">
                    {selectedChat.name || "Sem nome"}
                  </p>
                  <p className="text-sm text-gray-500">
                    {formatPhone(selectedChat.waId)}
                  </p>
                </div>
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Nome do Contato
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nome do contato"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none"
              />
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Cargo/Função
              </label>
              <input
                type="text"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder="Ex: Diretor, Gerente..."
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none"
              />
            </div>

            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setSelectedChat(null)}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Voltar
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                <Link className="w-4 h-4" />
                {loading ? "Vinculando..." : "Vincular à Empresa"}
              </button>
            </div>
          </form>
        ) : activeTab === "whatsapp" ? (
          /* WhatsApp Tab - Lista de Chats */
          <>
            {!channelId ? (
              <div className="p-6 text-center text-gray-500">
                <MessageSquare className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                <p>Nenhum canal WhatsApp configurado.</p>
                <p className="text-sm mt-2">
                  Configure um canal primeiro ou crie o contato manualmente.
                </p>
                <button
                  onClick={() => setActiveTab("manual")}
                  className="mt-4 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                >
                  Criar Manualmente
                </button>
              </div>
            ) : (
              <>
                <div className="p-4 border-b shrink-0">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="text"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Buscar por nome ou número..."
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none"
                    />
                  </div>
                </div>

                <div className="overflow-y-auto flex-1 max-h-80">
                  {searchLoading ? (
                    <div className="p-8 text-center text-gray-500">
                      <div className="animate-spin w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full mx-auto mb-4" />
                      Buscando chats...
                    </div>
                  ) : fetchError ? (
                    <div className="p-8 text-center">
                      <MessageSquare className="w-12 h-12 mx-auto mb-4 text-orange-400" />
                      <p className="text-orange-600 font-medium">
                        Erro ao carregar chats
                      </p>
                      <p className="text-sm text-gray-500 mt-2">{fetchError}</p>
                      <button
                        onClick={() => setActiveTab("manual")}
                        className="mt-4 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm"
                      >
                        Criar contato manualmente
                      </button>
                    </div>
                  ) : chats.length === 0 ? (
                    <div className="p-8 text-center text-gray-500">
                      <MessageSquare className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                      <p>Nenhum chat disponível para vincular.</p>
                      <p className="text-sm mt-2">
                        Todos os chats já estão vinculados ou não há conversas.
                      </p>
                      <button
                        onClick={() => setActiveTab("manual")}
                        className="mt-4 text-purple-600 hover:text-purple-700 text-sm font-medium"
                      >
                        Criar contato manualmente →
                      </button>
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-100">
                      {chats.map((chat) => (
                        <button
                          key={chat.waId}
                          onClick={() => handleSelectChat(chat)}
                          className="w-full p-4 flex items-center gap-3 hover:bg-gray-50 transition-colors text-left"
                        >
                          <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center shrink-0 overflow-hidden">
                            {chat.picture ? (
                              <img
                                src={chat.picture}
                                alt=""
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <MessageSquare className="w-6 h-6 text-green-600" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <p className="font-medium text-gray-800 truncate">
                                {chat.name || formatPhone(chat.waId)}
                              </p>
                              {chat.lastMessage && (
                                <span className="text-xs text-gray-400 shrink-0 ml-2">
                                  {formatTime(chat.lastMessage.timestamp)}
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-gray-500">
                              {formatPhone(chat.waId)}
                            </p>
                            {chat.lastMessage && (
                              <p className="text-sm text-gray-400 truncate mt-1">
                                {chat.lastMessage.fromMe && "Você: "}
                                {chat.lastMessage.body}
                              </p>
                            )}
                          </div>
                        </button>
                      ))}

                      {/* Botão carregar mais */}
                      {hasMore && (
                        <div className="p-4 text-center">
                          <button
                            type="button"
                            onClick={loadMoreChats}
                            disabled={loadingMore}
                            className="px-4 py-2 text-purple-600 hover:bg-purple-50 rounded-lg transition-colors text-sm font-medium disabled:opacity-50"
                          >
                            {loadingMore ? (
                              <span className="flex items-center gap-2">
                                <div className="animate-spin w-4 h-4 border-2 border-purple-600 border-t-transparent rounded-full" />
                                Carregando...
                              </span>
                            ) : (
                              "Carregar mais chats"
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </>
        ) : (
          /* Manual Tab - Formulário */
          <form onSubmit={handleSubmitManual} className="p-6">
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Nome *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nome do contato"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none"
                required
              />
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                WhatsApp
              </label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="5511999999999"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none"
              />
              <p className="text-xs text-gray-400 mt-1">
                Formato: código do país + DDD + número
              </p>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                E-mail
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@exemplo.com"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none"
              />
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Cargo/Função
              </label>
              <input
                type="text"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder="Ex: Diretor, Gerente..."
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none"
              />
            </div>

            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  resetForm();
                }}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={loading || !name}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                {loading ? "Criando..." : "Criar Contato"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

// ============================================================================
// Main Component
// ============================================================================

export function CompanyTimeline() {
  const id = getCompanyIdFromUrl();
  const [company, setCompany] = useState(null);
  const [timeline, setTimeline] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("timeline");
  const [stages, setStages] = useState([]);
  const [channels, setChannels] = useState([]);
  const [showOpportunityModal, setShowOpportunityModal] = useState(false);
  const [showContactModal, setShowContactModal] = useState(false);

  const fetchData = async () => {
    if (!id) return;
    setLoading(true);

    try {
      const [companyData, timelineData, stagesData, channelsData] =
        await Promise.all([
          api.getCompany(id),
          api.getCompanyTimeline(id),
          api.getStages(),
          api.getChannels(),
        ]);
      setCompany(companyData);
      setTimeline(timelineData);
      setStages(stagesData);
      setChannels(channelsData);
    } catch (error) {
      console.error("Erro ao buscar dados:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
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
      <ContactHeader
        companyName={company.alias || company.name}
        cnpj={company.taxId}
      />

      <main className="flex-1 w-full px-6 py-6 grid grid-cols-12 gap-6 overflow-auto">
        <aside className="col-span-3 bg-white rounded-lg border border-gray-200 p-4 h-fit shadow-sm">
          <SidebarSection title="Dados da Empresa">
            <InfoRow label="Razão Social" value={company.name} />
            <InfoRow label="Status" value={company.status} />
            <InfoRow label="Porte" value={company.sizeText} />
            <InfoRow
              label="Atividade Principal"
              value={company.mainActivityText}
            />
            <InfoRow
              label="Cidade"
              value={`${company.addressCity} - ${company.addressState}`}
            />
          </SidebarSection>

          <SidebarSection title="Contatos">
            {company.contacts.map((contact) => {
              const phone = contact.identities.find(
                (i) => i.type === "WHATSAPP",
              )?.value;
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
                  <span className="text-gray-600">
                    {opp.stage?.name || "Sem estágio"}
                  </span>
                  <span className="font-medium">
                    {formatCurrency(opp.estimatedValue)}
                  </span>
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
                <h2 className="text-lg font-semibold text-gray-800">
                  Timeline
                </h2>
                <span className="text-sm text-gray-400">
                  • Todos os contatos
                </span>
              </div>

              <div className="bg-gray-100 rounded-lg p-4 mb-4 min-h-[400px] max-h-[500px] overflow-y-auto">
                {timeline.events.length === 0 ? (
                  <div className="flex items-center justify-center h-64 text-gray-500">
                    Nenhum evento na timeline
                  </div>
                ) : (
                  <>
                    {timeline.events.map((event) => {
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
                              event.conversation?.channel.name || "Desconhecido"
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
                    })}
                  </>
                )}
              </div>
            </>
          )}

          {activeTab === "contacts" && (
            <>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-800">
                  Contatos
                </h2>
                <button
                  onClick={() => setShowContactModal(true)}
                  className="flex items-center gap-2 px-3 py-2 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Novo Contato
                </button>
              </div>
              <div className="bg-white rounded-lg border border-gray-200">
                {company.contacts.length === 0 ? (
                  <div className="p-8 text-center text-gray-500">
                    Nenhum contato vinculado a esta empresa
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {company.contacts.map((contact) => (
                      <div
                        key={contact.id}
                        className="p-4 flex items-center justify-between"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center">
                            <User className="w-5 h-5 text-gray-600" />
                          </div>
                          <div>
                            <p className="font-medium text-gray-800">
                              {contact.name || "Sem nome"}
                            </p>
                            <p className="text-sm text-gray-500">
                              {contact.identities
                                .map((i) => i.value)
                                .join(", ")}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {activeTab === "opportunities" && (
            <>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-800">
                  Oportunidades
                </h2>
                <button
                  onClick={() => setShowOpportunityModal(true)}
                  className="flex items-center gap-2 px-3 py-2 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Nova Oportunidade
                </button>
              </div>
              <div className="bg-white rounded-lg border border-gray-200">
                {company.opportunities.length === 0 ? (
                  <div className="p-8 text-center text-gray-500">
                    Nenhuma oportunidade para esta empresa
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {company.opportunities.map((opp) => (
                      <div
                        key={opp.id}
                        className="p-4 flex items-center justify-between"
                      >
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
            </>
          )}
        </div>
      </main>

      {/* Modals */}
      <CreateOpportunityModal
        isOpen={showOpportunityModal}
        onClose={() => setShowOpportunityModal(false)}
        onCreated={fetchData}
        companyId={id}
        stages={stages}
      />
      <CreateContactModal
        isOpen={showContactModal}
        onClose={() => setShowContactModal(false)}
        onCreated={fetchData}
        companyId={id}
        channels={channels}
      />
    </div>
  );
}
