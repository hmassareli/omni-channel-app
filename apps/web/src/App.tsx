import {
  CheckCircle,
  ChevronDown,
  Clock,
  MessageSquare,
  Phone,
  Send,
  User,
} from "lucide-react";
import React from "react";

// --- Componentes ---

const TopHeader = () => (
  <header className="flex items-center justify-between px-6 py-3 bg-white border-b border-gray-200">
    <div className="flex items-center">
      <div className="bg-purple-600 p-2 rounded text-white font-bold">
        <span className="text-xl">CRM</span>
      </div>
    </div>

    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-gray-100 hover:bg-gray-200 cursor-pointer">
        <div className="w-8 h-8 bg-purple-600 rounded-full flex items-center justify-center text-white text-sm font-medium">
          JS
        </div>
        <span className="text-sm font-medium text-gray-700">João Silva</span>
      </div>
    </div>
  </header>
);

const ContactHeader = ({ contactName, phone }: { contactName: string; phone: string }) => (
  <div className="px-6 py-4 bg-white flex justify-between items-center border-b border-gray-200">
    <div className="flex items-start gap-4">
      <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center">
        <User className="w-6 h-6 text-purple-600" />
      </div>
      <div>
        <h1 className="text-xl font-semibold text-gray-800">{contactName}</h1>
        <div className="flex items-center gap-2 mt-1 text-gray-500 text-sm">
          <Phone className="w-4 h-4" />
          <span>{phone}</span>
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

const PipelineSteps = ({ stages, currentStageIndex }: { stages: string[]; currentStageIndex: number }) => {
  return (
    <div className="flex w-full bg-white border-b border-gray-200">
      {stages.map((step, index) => (
        <div
          key={index}
          className={`
            flex-1 py-3 text-center text-sm font-medium cursor-pointer transition-colors
            ${index === currentStageIndex
              ? "bg-purple-600 text-white"
              : index < currentStageIndex
                ? "bg-purple-100 text-purple-700"
                : "bg-white text-gray-500 hover:bg-gray-50"
            }
            ${index < stages.length - 1 ? "border-r border-gray-200" : ""}
          `}
        >
          {step}
        </div>
      ))}
    </div>
  );
};

const SidebarSection = ({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) => {
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

const TagBadge = ({ label, color }: { label: string; color: string }) => (
  <span className={`px-2 py-1 text-xs font-medium rounded-full ${color}`}>
    {label}
  </span>
);

const TimelineMessage = ({ 
  sender, 
  time, 
  message, 
  isInbound 
}: { 
  sender: string; 
  time: string; 
  message: string; 
  isInbound: boolean;
}) => (
  <div className={`flex gap-3 mb-4 ${isInbound ? "" : "flex-row-reverse"}`}>
    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
      isInbound ? "bg-gray-200 text-gray-600" : "bg-purple-600 text-white"
    }`}>
      {isInbound ? <User className="h-4 w-4" /> : <span className="text-xs font-medium">JS</span>}
    </div>

    <div className={`max-w-[70%] ${isInbound ? "" : "text-right"}`}>
      <div className={`inline-block p-3 rounded-lg ${
        isInbound 
          ? "bg-white border border-gray-200 text-gray-800" 
          : "bg-purple-600 text-white"
      }`}>
        <p className="text-sm">{message}</p>
      </div>
      <div className={`flex items-center gap-1 mt-1 text-xs text-gray-400 ${isInbound ? "" : "justify-end"}`}>
        <Clock className="h-3 w-3" />
        <span>{time}</span>
        <span>• {sender}</span>
      </div>
    </div>
  </div>
);

const TimelineEvent = ({ 
  time, 
  title, 
  type 
}: { 
  time: string; 
  title: string; 
  type: "create" | "stage_change";
}) => (
  <div className="flex items-center gap-3 mb-4 py-2">
    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
      type === "create" ? "bg-green-100 text-green-600" : "bg-purple-100 text-purple-600"
    }`}>
      <CheckCircle className="h-4 w-4" />
    </div>
    <div className="flex-1 flex items-center justify-between">
      <span className="text-sm text-gray-600">{title}</span>
      <span className="text-xs text-gray-400">{time}</span>
    </div>
  </div>
);

// --- Layout Principal ---

export default function CRMPage() {
  const stages = [
    "Novo Lead",
    "Em Contato",
    "Negociação",
    "Proposta Enviada",
    "Fechamento",
  ];

  const tags = [
    { label: "Lead Quente", color: "bg-orange-100 text-orange-700" },
    { label: "Interessado em Produto X", color: "bg-blue-100 text-blue-700" },
  ];

  const messages = [
    { sender: "Cliente", time: "10:30", message: "Olá, gostaria de saber mais sobre o produto X", isInbound: true },
    { sender: "João Silva", time: "10:32", message: "Olá! Claro, posso te ajudar. O produto X tem as seguintes características...", isInbound: false },
    { sender: "Cliente", time: "10:35", message: "Qual o valor?", isInbound: true },
    { sender: "João Silva", time: "10:40", message: "O investimento é de R$ 2.500,00 com condições especiais para pagamento à vista.", isInbound: false },
    { sender: "Cliente", time: "10:42", message: "Interessante! Vou pensar e retorno em breve.", isInbound: true },
  ];

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-900">
      <TopHeader />

      <div className="bg-white shadow-sm">
        <ContactHeader 
          contactName="Maria Oliveira" 
          phone="+55 11 99999-0001" 
        />
        <PipelineSteps stages={stages} currentStageIndex={2} />
      </div>

      <main className="w-full px-6 py-6 grid grid-cols-12 gap-6">
        {/* Sidebar Esquerda */}
        <aside className="col-span-3 bg-white rounded-lg border border-gray-200 p-4 h-fit shadow-sm">
          <SidebarSection title="Dados do Contato">
            <InfoRow label="Nome" value="Maria Oliveira" />
            <InfoRow label="Telefone" value="+55 11 99999-0001" />
            <InfoRow label="Email" value="maria@email.com" />
          </SidebarSection>

          <SidebarSection title="Tags">
            <div className="flex flex-wrap gap-2">
              {tags.map((tag, i) => (
                <TagBadge key={i} label={tag.label} color={tag.color} />
              ))}
            </div>
          </SidebarSection>

          <SidebarSection title="Informações">
            <InfoRow label="Responsável" value="João Silva" />
            <InfoRow label="Criado em" value="05/12/2025" />
            <InfoRow label="Última interação" value="Hoje às 10:42" />
          </SidebarSection>

          <SidebarSection title="Insights (IA)">
            <div className="space-y-2 text-sm">
              <div className="p-2 bg-purple-50 rounded">
                <span className="text-purple-700 font-medium">Orçamento:</span>
                <span className="text-gray-700 ml-1">~R$ 2.500</span>
              </div>
              <div className="p-2 bg-purple-50 rounded">
                <span className="text-purple-700 font-medium">Interesse:</span>
                <span className="text-gray-700 ml-1">Produto X</span>
              </div>
            </div>
          </SidebarSection>
        </aside>

        {/* Conteúdo Central */}
        <div className="col-span-9">
          {/* Header da Timeline */}
          <div className="flex items-center gap-2 mb-4">
            <MessageSquare className="w-5 h-5 text-purple-600" />
            <h2 className="text-lg font-semibold text-gray-800">Conversa</h2>
            <span className="text-sm text-gray-400">• WhatsApp</span>
          </div>

          {/* Timeline de Mensagens */}
          <div className="bg-gray-100 rounded-lg p-4 mb-4 min-h-[400px] max-h-[500px] overflow-y-auto">
            <TimelineEvent 
              time="05/12/2025 10:28" 
              title="Contato criado" 
              type="create" 
            />
            
            <TimelineEvent 
              time="05/12/2025 10:35" 
              title="Movido para: Em Contato" 
              type="stage_change" 
            />

            {messages.map((msg, i) => (
              <TimelineMessage
                key={i}
                sender={msg.sender}
                time={msg.time}
                message={msg.message}
                isInbound={msg.isInbound}
              />
            ))}

            <TimelineEvent 
              time="Hoje 10:45" 
              title="Movido para: Negociação" 
              type="stage_change" 
            />
          </div>

          {/* Caixa de Envio */}
          <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
            <div className="relative">
              <textarea
                className="w-full border border-gray-300 rounded-lg p-3 text-sm h-20 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 focus:outline-none resize-none"
                placeholder="Digite sua mensagem..."
              ></textarea>
            </div>

            <div className="flex justify-end mt-3">
              <button className="bg-purple-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-purple-700 flex items-center gap-2">
                <Send className="w-4 h-4" />
                Enviar
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
