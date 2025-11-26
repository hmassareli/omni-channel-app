import {
  AlertTriangle,
  Bell,
  Calendar,
  CheckCircle,
  ChevronDown,
  Clock,
  Mail,
  MapPin,
  Mic,
  Paperclip,
  PenLine,
  Phone,
  Search,
  User,
} from "lucide-react";
import React from "react";

// --- Componentes Menores (poderiam estar em arquivos separados) ---

const TopHeader = () => (
  <header className="flex items-center justify-between px-6 py-3 bg-white border-b border-gray-200">
    <div className="flex items-center w-1/3">
      <div className="bg-green-600 p-2 rounded text-white mr-4 font-bold">
        {/* Logo Placeholder */}
        <span className="text-xl">CRM</span>
      </div>
      <div className="relative w-full max-w-md">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
        <input
          type="text"
          placeholder="Busque em qualquer lugar"
          className="w-full pl-10 pr-4 py-2 bg-gray-100 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
      </div>
    </div>

    <div className="flex items-center space-x-6 text-gray-600">
      <button className="bg-purple-700 text-white px-4 py-1.5 rounded text-sm font-medium hover:bg-purple-800">
        Assinar
      </button>
      <Mail className="h-5 w-5 cursor-pointer hover:text-gray-800" />
      <Bell className="h-5 w-5 cursor-pointer hover:text-gray-800" />
      <Calendar className="h-5 w-5 cursor-pointer hover:text-gray-800" />
      <User className="h-5 w-5 cursor-pointer hover:text-gray-800" />
      <div className="flex items-center cursor-pointer">
        <span className="text-sm font-medium mr-1">fdgsdg</span>
        <ChevronDown className="h-4 w-4" />
      </div>
    </div>
  </header>
);

const DealHeader = ({ title, clientName }) => (
  <div className="px-6 py-4 bg-white flex justify-between items-start">
    <div className="flex items-start gap-4">
      <div className="bg-green-500 p-3 rounded-lg">
        <span className="text-white font-bold text-xl">$</span>
      </div>
      <div>
        <h1 className="text-2xl font-semibold text-gray-800">{title}</h1>
        <div className="flex gap-2 mt-1">
          <span className="px-2 py-0.5 text-xs border border-gray-300 rounded text-gray-600 bg-white">
            Novas vendas
          </span>
          <span className="px-2 py-0.5 text-xs border border-blue-200 text-blue-600 bg-blue-50 rounded flex items-center">
            {clientName}
          </span>
        </div>
      </div>
    </div>

    <div className="flex gap-2">
      <button className="px-4 py-2 bg-red-500 text-white text-sm font-medium rounded hover:bg-red-600">
        Perder
      </button>
      <button className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded hover:bg-gray-50 flex items-center gap-2">
        <PenLine className="h-4 w-4" /> Remanejar pipe
      </button>
      <button className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded hover:bg-gray-50 flex items-center gap-2">
        <PenLine className="h-4 w-4" /> Opções{" "}
        <ChevronDown className="h-3 w-3" />
      </button>
    </div>
  </div>
);

const PipelineSteps = () => {
  const steps = [
    "Prospect",
    "Identificação de necessidades",
    "Proposta",
    "Apresentação da Solução",
    "Fechamento",
  ];
  const currentStepIndex = 0; // Controla qual está ativo

  return (
    <div className="flex w-full bg-white border-b border-gray-200">
      {steps.map((step, index) => (
        <div
          key={index}
          className={`
            flex-1 py-3 text-center text-sm font-medium relative cursor-pointer
            ${
              index === currentStepIndex
                ? "bg-purple-600 text-white"
                : "bg-white text-gray-500 hover:bg-gray-50"
            }
            ${index < steps.length - 1 ? "border-r border-gray-200" : ""}
          `}
        >
          {step}
          {/* Triângulo decorativo (CSS pseudo-element simulado) para efeito de seta poderia ser adicionado aqui */}
        </div>
      ))}
    </div>
  );
};

const SidebarSection = ({ title, children, defaultOpen = true }) => {
  const [isOpen, setIsOpen] = React.useState(defaultOpen);
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
          className={`h-4 w-4 text-gray-400 transition-transform ${
            isOpen ? "" : "-rotate-90"
          }`}
        />
      </div>
      {isOpen && <div className="mt-2 px-2">{children}</div>}
    </div>
  );
};

const FieldRow = ({ label, value, alert }) => (
  <div className="flex items-start py-2 text-sm">
    {alert && (
      <AlertTriangle className="h-4 w-4 text-red-500 mr-2 mt-0.5 shrink-0" />
    )}
    <div className="flex-1">
      <span
        className={`block ${
          alert ? "text-red-500 font-medium" : "text-gray-800"
        }`}
      >
        {label}
      </span>
      <span className="text-gray-500 text-xs block mt-0.5">
        {value || (alert ? "Pipe não tem Contato ..." : "Adicionar ...")}
      </span>
    </div>
  </div>
);

const TimelineItem = ({ user, time, title, description, type }) => (
  <div className="flex gap-4 mb-6 relative">
    {/* Linha vertical conectora */}
    <div className="absolute left-5 top-10 bottom-[-24px] w-0.5 bg-gray-200"></div>

    <div
      className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 z-10 ${
        type === "create"
          ? "bg-green-500 text-white"
          : "bg-gray-200 text-gray-600"
      }`}
    >
      {type === "create" ? (
        <CheckCircle className="h-5 w-5" />
      ) : (
        <User className="h-5 w-5" />
      )}
    </div>

    <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm w-full">
      <div className="flex justify-between mb-1">
        <span className="font-bold text-gray-800 text-sm">{user}</span>
        <span className="text-xs text-gray-400 flex items-center gap-1">
          <Clock className="h-3 w-3" /> {time}
        </span>
      </div>
      <div className="text-sm font-semibold text-gray-700 mb-1">{title}</div>
      {description && (
        <div className="text-sm text-gray-600">{description}</div>
      )}
      <div className="mt-3 pt-2 border-t border-gray-100 flex gap-4">
        <button className="text-xs text-gray-500 hover:text-blue-600">
          Visualizar
        </button>
        <div className="flex gap-2 text-xs text-gray-400 items-center">
          <span>0 Comentários</span>
          <span>17/11/2025</span>
        </div>
      </div>
    </div>
  </div>
);

// --- Layout Principal ---

export default function CRMPage() {
  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-900">
      <TopHeader />

      {/* Área Branca do Header do Deal */}
      <div className="bg-white shadow-sm">
        <DealHeader title="Teste" clientName="BARAO ERVA MATE E CHAS" />
        <PipelineSteps />
      </div>

      {/* Grid Principal */}
      <main className="max-w-[1600px] mx-auto p-6 grid grid-cols-12 gap-6">
        {/* Sidebar Esquerda (Info) */}
        <aside className="col-span-3 bg-white rounded-lg border border-gray-200 p-4 h-fit shadow-sm">
          <SidebarSection title="Dados do Contato">
            <FieldRow label="Contato" value="" alert />
            <FieldRow label="Telefone do Contato" value="" alert />
            <FieldRow label="E-mail do Contato" value="" alert />
          </SidebarSection>

          <SidebarSection title="Dados Básicos">
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 block">Título</label>
                <div className="text-sm font-medium">Teste</div>
              </div>
              <div>
                <label className="text-xs text-gray-500 block">Cliente</label>
                <span className="inline-block px-2 py-1 bg-gray-100 text-xs text-gray-700 rounded mt-1">
                  BARAO ERVA MATE E CHAS
                </span>
              </div>
            </div>
          </SidebarSection>

          <SidebarSection title="Outras Informações">
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Responsável</span>
                <div className="flex items-center gap-2 bg-gray-100 px-2 py-0.5 rounded-full">
                  <div className="w-4 h-4 bg-gray-400 rounded-full"></div>
                  <span className="text-xs">fdgsdg</span>
                </div>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Início</span>
                <span>Hoje</span>
              </div>
              <div>
                <span className="text-gray-500 block mb-1">Situação</span>
                <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-xs font-medium">
                  P Prospect
                </span>
              </div>
              <div>
                <span className="text-gray-500 block mb-1">Observações</span>
                <p className="text-xs text-gray-600 leading-relaxed">
                  SERGIO ANTONIO PICOLO (16-Presidente) NILVA FATIMA LONGO
                  PICOLO (10-Diretor) ANA PAULA PICOLO BUCCOLO (10-Diretor)
                </p>
              </div>
            </div>
          </SidebarSection>
        </aside>

        {/* Conteúdo Central (Tabs e Timeline) */}
        <div className="col-span-9">
          {/* Menu de Abas Superior */}
          <nav className="flex space-x-6 border-b border-gray-200 mb-6 text-sm font-medium">
            <button className="pb-3 border-b-2 border-purple-600 text-purple-600">
              Linha do tempo
            </button>
            <button className="pb-3 border-b-2 border-transparent text-gray-500 hover:text-gray-700">
              Propostas
            </button>
            <button className="pb-3 border-b-2 border-transparent text-gray-500 hover:text-gray-700">
              Vendas
            </button>
            <button className="pb-3 border-b-2 border-transparent text-gray-500 hover:text-gray-700">
              Documentos
            </button>
            <button className="pb-3 border-b-2 border-transparent text-gray-500 hover:text-gray-700">
              Pipes derivados
            </button>
            <button className="pb-3 border-b-2 border-transparent text-gray-500 hover:text-gray-700">
              Anexos
            </button>
          </nav>

          {/* Caixa de Input de Interação */}
          <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm mb-6">
            <div className="flex gap-4 mb-3 text-gray-500 text-sm">
              <button className="flex items-center gap-2 text-gray-700 font-medium">
                <PenLine className="w-4 h-4" /> Registrar interação
              </button>
              <button className="flex items-center gap-2 hover:text-gray-700">
                <Calendar className="w-4 h-4" /> Agendar tarefa
              </button>
              <button className="flex items-center gap-2 hover:text-gray-700">
                <CheckCircle className="w-4 h-4" /> Novo pipe
              </button>
            </div>

            <div className="flex gap-3 mb-2 text-gray-400">
              <div className="p-2 bg-gray-100 rounded-full">
                <PenLine className="w-4 h-4" />
              </div>
              <div className="p-2 hover:bg-gray-100 rounded-full cursor-pointer">
                <MapPin className="w-4 h-4" />
              </div>
              <div className="p-2 hover:bg-gray-100 rounded-full cursor-pointer">
                <Phone className="w-4 h-4" />
              </div>
              <div className="p-2 hover:bg-gray-100 rounded-full cursor-pointer">
                <Mail className="w-4 h-4" />
              </div>
              <div className="p-2 hover:bg-gray-100 rounded-full cursor-pointer">
                <User className="w-4 h-4" />
              </div>
            </div>

            <div className="relative">
              <textarea
                className="w-full border border-blue-300 rounded-md p-3 text-sm h-24 focus:ring-2 focus:ring-blue-200 focus:outline-none resize-none"
                defaultValue="teste"
              ></textarea>
              <Mic className="absolute right-3 bottom-3 text-gray-400 w-5 h-5 cursor-pointer" />
            </div>

            <div className="flex justify-between items-center mt-3">
              <button className="text-blue-500 text-sm font-medium flex items-center gap-1">
                <PenLine className="w-4 h-4" /> Mais campos{" "}
                <ChevronDown className="w-3 h-3" />
              </button>
              <div className="flex gap-2">
                <button className="flex items-center gap-2 px-3 py-2 text-gray-600 hover:bg-gray-100 rounded text-sm border border-gray-200">
                  <Paperclip className="w-4 h-4" /> Adicionar anexo
                </button>
                <button className="bg-blue-500 text-white px-6 py-2 rounded text-sm font-medium hover:bg-blue-600">
                  Salvar
                </button>
              </div>
            </div>
          </div>

          {/* Seção de Tarefas */}
          <div className="bg-purple-50 rounded-md p-3 mb-6 border border-purple-100">
            <h4 className="text-purple-700 text-sm font-bold mb-2">
              Tarefas em aberto
            </h4>
            <div className="bg-white p-3 rounded border border-gray-200 text-sm text-gray-500 flex items-center gap-2">
              <Calendar className="w-4 h-4" /> Nenhuma tarefa agendada. Clique
              aqui para criar.
            </div>
          </div>

          {/* Filtros do Histórico */}
          <div className="flex justify-between items-center mb-4 border-b border-gray-200 pb-2">
            <div className="flex gap-4 text-sm font-medium">
              <button className="text-purple-700 border-b-2 border-purple-700 pb-2">
                Histórico completo
              </button>
              <button className="text-gray-500 hover:text-gray-700 pb-2">
                Interações
              </button>
            </div>
            <div className="flex gap-2">
              <button className="text-xs bg-gray-100 px-3 py-1 rounded text-gray-600 border border-gray-200 flex items-center gap-1">
                Filtrar <ChevronDown className="w-3 h-3" />
              </button>
              <button className="text-xs text-gray-500 hover:text-gray-700">
                Todas as atividades <ChevronDown className="w-3 h-3 inline" />
              </button>
            </div>
          </div>

          {/* Lista da Timeline */}
          <div className="pl-2">
            <TimelineItem
              user="fdgsdg"
              time="Hoje às 15:32"
              title="Simples"
              description="sdfsdf"
              type="interaction"
            />

            <TimelineItem
              user="fdgsdg"
              time="Hoje às 15:31"
              title="Pipe criado."
              description=""
              type="create"
            />
          </div>
        </div>
      </main>
    </div>
  );
}
