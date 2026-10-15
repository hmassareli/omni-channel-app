import { MessageSquare, Phone, Send, User } from "lucide-react";
import { PageHeader } from "../../../components/layout/PageHeader";
import { InfoRow, SidebarSection } from "../../../components/layout/SidebarSection";
import { Badge, Button, Card, Textarea } from "../../../components/ui";
import { useSession } from "../../auth/authContext";
import { PipelineStepsPreview } from "../components/PipelineStepsPreview";
import {
  TimelineMessage,
  TimelineSystemEvent,
} from "../../timeline/components/TimelineItems";

// Página ainda com dados de exemplo (mock) — será ligada à API junto com a Inbox.
const STAGES = [
  "Novo lead",
  "Em contato",
  "Negociação",
  "Proposta enviada",
  "Fechamento",
];

const MESSAGES = [
  { fromClient: true, at: "2025-12-05T10:30:00", text: "Olá, gostaria de saber mais sobre o produto X" },
  { fromClient: false, at: "2025-12-05T10:32:00", text: "Olá! Claro, posso te ajudar. O produto X tem as seguintes características..." },
  { fromClient: true, at: "2025-12-05T10:35:00", text: "Qual o valor?" },
  { fromClient: false, at: "2025-12-05T10:40:00", text: "O investimento é de R$ 2.500,00 com condições especiais para pagamento à vista." },
  { fromClient: true, at: "2025-12-05T10:42:00", text: "Interessante! Vou pensar e retorno em breve." },
];

export function ContactTimelinePage() {
  const { user } = useSession();
  const userName =
    (user?.user_metadata?.full_name as string | undefined) ||
    (user?.user_metadata?.name as string | undefined) ||
    "Você";

  return (
    <>
      <PageHeader
        backTo="/companies"
        title="Maria Oliveira"
        leading={
          <span className="flex size-10 items-center justify-center rounded-full bg-accent-50 text-accent-600">
            <User className="size-5" />
          </span>
        }
        description={
          <span className="inline-flex items-center gap-1.5">
            <Phone className="size-3.5" /> +55 11 99999-0001
          </span>
        }
        actions={
          <>
            <Button variant="danger">Marcar como perdido</Button>
            <Button>Marcar como ganho</Button>
          </>
        }
      />
      <PipelineStepsPreview stages={STAGES} currentIndex={2} />

      <div className="grid grid-cols-12 gap-6 p-8">
        <aside className="col-span-12 lg:col-span-4 xl:col-span-3">
          <Card className="h-fit px-4 py-1">
            <SidebarSection title="Dados do contato">
              <InfoRow label="Nome" value="Maria Oliveira" />
              <InfoRow label="Telefone" value="+55 11 99999-0001" />
              <InfoRow label="E-mail" value="maria@email.com" />
            </SidebarSection>
            <SidebarSection title="Tags">
              <div className="flex flex-wrap gap-2">
                <Badge tone="warning">Lead quente</Badge>
                <Badge tone="accent">Interessado em Produto X</Badge>
              </div>
            </SidebarSection>
            <SidebarSection title="Informações">
              <InfoRow label="Responsável" value={userName} />
              <InfoRow label="Criado em" value="05/12/2025" />
              <InfoRow label="Última interação" value="Hoje às 10:42" />
            </SidebarSection>
            <SidebarSection title="Insights (IA)">
              <div className="space-y-2 text-sm">
                <p className="rounded-md bg-accent-50 p-2">
                  <span className="font-medium text-accent-700">Orçamento:</span>{" "}
                  ~R$ 2.500
                </p>
                <p className="rounded-md bg-accent-50 p-2">
                  <span className="font-medium text-accent-700">Interesse:</span>{" "}
                  Produto X
                </p>
              </div>
            </SidebarSection>
          </Card>
        </aside>

        <div className="col-span-12 lg:col-span-8 xl:col-span-9">
          <div className="mb-4 flex items-center gap-2">
            <MessageSquare className="size-4 text-accent-600" />
            <h2 className="text-base font-semibold text-fg">Conversa</h2>
            <span className="text-sm text-fg-faint">· WhatsApp</span>
          </div>

          <div className="mb-4 max-h-[28rem] min-h-80 overflow-y-auto rounded-lg border border-line bg-canvas p-4">
            <TimelineSystemEvent time="2025-12-05T10:28:00" title="Contato criado" kind="create" />
            <TimelineSystemEvent time="2025-12-05T10:35:00" title="Movido para: Em contato" kind="stage_change" />
            {MESSAGES.map((msg) => (
              <TimelineMessage
                key={msg.at}
                sender={msg.fromClient ? "Maria Oliveira" : userName}
                time={msg.at}
                message={msg.text}
                isInbound={msg.fromClient}
              />
            ))}
            <TimelineSystemEvent time="2025-12-05T10:45:00" title="Movido para: Negociação" kind="stage_change" />
          </div>

          <Card className="p-4">
            <Textarea
              aria-label="Mensagem"
              placeholder="Digite sua mensagem..."
              rows={3}
            />
            <div className="mt-3 flex justify-end">
              <Button icon={<Send />}>Enviar</Button>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
