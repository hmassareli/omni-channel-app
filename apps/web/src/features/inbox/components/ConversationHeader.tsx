import { ArrowLeft, CheckCircle2, Clock, RotateCcw, UserCheck } from "lucide-react";
import { Avatar, Badge, Button, Select } from "../../../components/ui";
import type { ConversationDetail } from "../../../lib/api";
import { useMe, useAgents } from "../../operations/hooks";
import { useAssignConversation, useQueues, useSetStatus } from "../hooks";
import { CHANNEL_LABEL, STATUS_LABEL, STATUS_TONE } from "../labels";

export function ConversationHeader({
  conversation,
  onBack,
}: {
  conversation: ConversationDetail;
  onBack: () => void;
}) {
  const me = useMe();
  const agents = useAgents();
  const queues = useQueues();
  const assign = useAssignConversation(conversation.id);
  const setStatus = useSetStatus(conversation.id);

  const isManager = me.data?.role === "ADMIN" || me.data?.role === "MANAGER";
  const myAgent = agents.data?.find((a) => a.user?.id === me.data?.id);
  const assignedToMe = !!myAgent && conversation.assignedAgent?.id === myAgent.id;
  const busy = assign.isPending || setStatus.isPending;
  const error = assign.error ?? setStatus.error;
  const resolved = conversation.status === "RESOLVED";

  return (
    <div className="border-b border-line bg-surface px-4 py-3">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          aria-label="Voltar à lista"
          className="rounded-md p-1.5 text-fg-muted hover:bg-subtle lg:hidden"
        >
          <ArrowLeft className="size-4" />
        </button>
        <Avatar name={conversation.contact.name} src={conversation.contact.avatarUrl} size="md" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold text-fg">
            {conversation.contact.name || "Contato sem nome"}
          </h2>
          <p className="truncate text-xs text-fg-muted">
            {conversation.contact.company?.name ?? "Sem empresa"} ·{" "}
            {CHANNEL_LABEL[conversation.channel.type]}
          </p>
        </div>
        <div className="hidden items-center gap-2 sm:flex">
          <Badge tone={STATUS_TONE[conversation.status]}>
            {STATUS_LABEL[conversation.status]}
          </Badge>
          {conversation.assignedAgent ? (
            <span className="flex items-center gap-1.5 text-xs text-fg-muted">
              <Avatar name={conversation.assignedAgent.name} src={conversation.assignedAgent.avatarUrl} size="xs" tone="accent" />
              {conversation.assignedAgent.name}
            </span>
          ) : (
            <span className="text-xs text-fg-faint">Sem responsável</span>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {!assignedToMe && myAgent && !resolved && (
          <Button
            size="sm"
            icon={<UserCheck />}
            disabled={busy}
            onClick={() => assign.mutate({ agentId: myAgent.id })}
          >
            Assumir
          </Button>
        )}
        {isManager && (
          <>
            <div className="w-44">
              <Select
                aria-label="Atribuir a"
                className="h-8 text-xs"
                disabled={busy}
                value={conversation.assignedAgent?.id ?? ""}
                onChange={(e) => assign.mutate({ agentId: e.target.value || null })}
              >
                <option value="">Atribuir a...</option>
                {agents.data?.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="w-40">
              <Select
                aria-label="Mover para fila"
                className="h-8 text-xs"
                disabled={busy}
                value={conversation.queue?.id ?? ""}
                onChange={(e) => assign.mutate({ queueId: e.target.value || null })}
              >
                <option value="">Sem fila</option>
                {queues.data?.map((q) => (
                  <option key={q.id} value={q.id}>
                    Fila: {q.name}
                  </option>
                ))}
              </Select>
            </div>
          </>
        )}
        <div className="ml-auto flex gap-2">
          {conversation.status === "OPEN" && (
            <Button
              size="sm"
              variant="secondary"
              icon={<Clock />}
              disabled={busy}
              onClick={() => setStatus.mutate("PENDING")}
            >
              Marcar pendente
            </Button>
          )}
          {resolved ? (
            <Button
              size="sm"
              variant="secondary"
              icon={<RotateCcw />}
              disabled={busy}
              onClick={() => setStatus.mutate("OPEN")}
            >
              Reabrir
            </Button>
          ) : (
            <Button
              size="sm"
              variant="secondary"
              icon={<CheckCircle2 />}
              disabled={busy}
              onClick={() => setStatus.mutate("RESOLVED")}
            >
              Resolver
            </Button>
          )}
        </div>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-xs text-danger-600">
          {error instanceof Error ? error.message : "Ação não concluída."}
        </p>
      )}
    </div>
  );
}
