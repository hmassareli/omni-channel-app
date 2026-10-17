import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Clock,
  History,
  MessageCircle,
  Phone,
  Plus,
  QrCode,
  RadioTower,
  RefreshCw,
  Stethoscope,
  Trash2,
  User,
} from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { PageHeader } from "../../../components/layout/PageHeader";
import {
  Badge,
  Button,
  Card,
  Dialog,
  EmptyState,
  ErrorState,
  Input,
  Select,
  SkeletonList,
} from "../../../components/ui";
import type { ChannelHealthResponse, ChannelListItem } from "../../../lib/api";
import { cn } from "../../../lib/cn";
import { formatClock, formatTimeAgo, msSince } from "../../../lib/format";
import { useAgents, useMe, useOperation } from "../../operations/hooks";
import { ConnectChannelDialog } from "../components/ConnectChannelDialog";
import {
  channelKeys,
  useChannelHealth,
  useChannelList,
  useCreateWhatsAppChannel,
  useDeleteChannel,
} from "../hooks";
import { channelStatusMeta, formatChannelPhone, STALE_INBOUND_MS } from "../labels";

type Modal =
  | { type: "create" }
  | { type: "connect"; channel: { id: string; name: string } }
  | { type: "remove"; channel: ChannelListItem }
  | null;

const errorText = (e: unknown) => (e instanceof Error ? e.message : undefined);

const isWhatsapp = (c: ChannelListItem) => c.type === "WHATSAPP" && !!c.whatsappDetails;

/** Resumo da última checagem ao vivo. */
function healthSummary(h: ChannelHealthResponse): { text: string; tone: "muted" | "warning" | "danger" } {
  if (h.wahaStatus === null) return { text: h.error ?? "Servidor do WhatsApp inacessível.", tone: "danger" };
  if (h.wahaStatus === "NOT_FOUND")
    return { text: "A sessão não existe mais no servidor do WhatsApp. Reconecte e escaneie o QR.", tone: "danger" };
  if (h.wahaStatus === "WORKING") {
    if (h.webhookRepaired) return { text: "Sessão ativa. O webhook estava errado e foi reconfigurado.", tone: "warning" };
    if (h.webhookOk === false) return { text: "Sessão ativa, mas o webhook não está configurado: mensagens podem não chegar.", tone: "warning" };
    return { text: "Sessão ativa e recebendo eventos.", tone: "muted" };
  }
  if (h.wahaStatus === "SCAN_QR_CODE") return { text: "Aguardando a leitura do QR code.", tone: "warning" };
  if (h.wahaStatus === "STARTING") return { text: "Sessão iniciando...", tone: "warning" };
  if (h.wahaStatus === "FAILED")
    return { text: h.error ?? "A conexão com o WhatsApp falhou. Reconecte o canal.", tone: "danger" };
  return { text: "Sessão parada no servidor do WhatsApp.", tone: "danger" };
}

function ChannelIcon({ channel }: { channel: ChannelListItem }) {
  const Icon = channel.type === "WHATSAPP" ? MessageCircle : RadioTower;
  return (
    <span
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-lg",
        channel.type === "WHATSAPP" ? "bg-success-50 text-success-600" : "bg-subtle text-fg-muted",
      )}
    >
      <Icon className="size-5" />
    </span>
  );
}

function ChannelCard({
  channel,
  canManage,
  onConnect,
  onRemove,
}: {
  channel: ChannelListItem;
  canManage: boolean;
  onConnect: () => void;
  onRemove: () => void;
}) {
  const qc = useQueryClient();
  const whatsapp = isWhatsapp(channel);
  const health = useChannelHealth(channel.id, whatsapp);
  const h = health.data;

  // A checagem ao vivo pode ter mudado o status gravado: atualiza a lista (e o aviso global).
  useEffect(() => {
    if (h && h.status !== channel.status) {
      void qc.invalidateQueries({ queryKey: channelKeys.list });
    }
  }, [h, channel.status, qc]);

  const status = h?.status ?? channel.status;
  const meta = channelStatusMeta(status, h?.wahaStatus);
  const phone = formatChannelPhone(h?.me?.phoneNumber ?? channel.externalIdentifier);
  const lastInbound = h?.lastInboundAt ?? channel.lastInboundAt;
  const stale = status === "WORKING" && !!lastInbound && msSince(lastInbound) > STALE_INBOUND_MS;
  const neverConnected = status === "PENDING" || h?.wahaStatus === "SCAN_QR_CODE";
  const summary = h ? healthSummary(h) : null;

  return (
    <Card className={cn(meta.down && "border-danger-100")}>
      <div className="flex flex-wrap items-start justify-between gap-4 p-4">
        <div className="flex min-w-0 items-start gap-3">
          <ChannelIcon channel={channel} />
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate text-sm font-semibold text-fg">{channel.name}</p>
              <Badge tone={meta.tone}>{meta.label}</Badge>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-fg-muted">
              <span className="flex items-center gap-1">
                <Phone className="size-3.5" />
                {phone ?? "Sem número conectado"}
              </span>
              <span className="flex items-center gap-1">
                <User className="size-3.5" />
                {channel.agent ? channel.agent.name : "Compartilhado (sem atendente)"}
              </span>
              <span className={cn("flex items-center gap-1", stale && "font-medium text-warning-700")}>
                <Clock className="size-3.5" />
                {lastInbound
                  ? `Última mensagem recebida ${formatTimeAgo(lastInbound)}`
                  : "Nenhuma mensagem recebida ainda"}
              </span>
            </div>
            {channel.predecessors?.length > 0 && (
              <p className="flex items-center gap-1 text-xs text-fg-faint">
                <History className="size-3.5" />
                Inclui o histórico de{" "}
                {channel.predecessors
                  .map((p) => `"${p.name}"${p.replacedAt ? ` (substituído em ${new Date(p.replacedAt).toLocaleDateString("pt-BR")})` : ""}`)
                  .join(", ")}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {whatsapp && (
            <Button
              size="sm"
              variant="ghost"
              icon={<Stethoscope />}
              loading={health.isFetching}
              onClick={() => void health.refetch()}
            >
              Verificar agora
            </Button>
          )}
          {whatsapp && canManage && (
            <Button
              size="sm"
              variant={status === "WORKING" && !meta.down ? "secondary" : "primary"}
              icon={neverConnected ? <QrCode /> : <RefreshCw />}
              onClick={onConnect}
            >
              {neverConnected ? "Conectar" : "Reconectar"}
            </Button>
          )}
          {canManage && (
            <Button size="sm" variant="ghost" icon={<Trash2 />} onClick={onRemove}>
              Remover
            </Button>
          )}
        </div>
      </div>

      {(stale || summary || health.isError) && (
        <div className="space-y-2 border-t border-line px-4 py-3 text-xs">
          {stale && (
            <p className="flex items-start gap-2 rounded-md bg-warning-50 px-3 py-2 text-warning-700">
              <AlertTriangle className="mt-px size-4 shrink-0" />
              Canal conectado, mas nenhuma mensagem chega há mais de 24 h. Verifique se o WhatsApp
              continua ativo no celular ou reconecte.
            </p>
          )}
          {health.isError && (
            <p className="text-danger-700">Falha ao verificar: {errorText(health.error)}</p>
          )}
          {summary && h && (
            <p
              className={cn(
                summary.tone === "danger" && "text-danger-700",
                summary.tone === "warning" && "text-warning-700",
                summary.tone === "muted" && "text-fg-muted",
              )}
            >
              <span className="text-fg-faint">Verificado às {formatClock(h.checkedAt)} · </span>
              {summary.text}
            </p>
          )}
        </div>
      )}
    </Card>
  );
}

function NewChannelDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (channel: { id: string; name: string }) => void;
}) {
  const operation = useOperation();
  const agents = useAgents();
  const create = useCreateWhatsAppChannel();
  const [name, setName] = useState("");
  const [agentId, setAgentId] = useState("");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const value = name.trim();
    if (!value || !operation.data) return;
    create.mutate(
      { name: value, operationId: operation.data.id, agentId: agentId || undefined },
      { onSuccess: (r) => onCreated({ id: r.channel.id, name: r.channel.name }) },
    );
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title="Novo canal WhatsApp"
      description="Depois de criar, escaneie o QR code com o celular que vai atender."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="submit"
            form="new-channel-form"
            loading={create.isPending}
            disabled={!name.trim() || !operation.data}
          >
            Criar e conectar
          </Button>
        </>
      }
    >
      <form id="new-channel-form" onSubmit={submit} className="space-y-4">
        <Input
          label="Nome"
          placeholder="Ex.: WhatsApp Comercial"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <Select
          label="Atendente"
          hint="Opcional. Sem atendente, o canal é compartilhado pela equipe."
          value={agentId}
          onChange={(e) => setAgentId(e.target.value)}
        >
          <option value="">Compartilhado (sem atendente)</option>
          {(agents.data ?? []).map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>
        {create.error && <p className="text-sm text-danger-700">{errorText(create.error)}</p>}
      </form>
    </Dialog>
  );
}

function RemoveChannelDialog({ channel, onClose }: { channel: ChannelListItem; onClose: () => void }) {
  const remove = useDeleteChannel();
  const count = channel._count?.conversations ?? 0;
  return (
    <Dialog
      open
      onClose={onClose}
      size="sm"
      title="Remover canal"
      description={`O WhatsApp de "${channel.name}" será desconectado e a sessão apagada.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="danger" loading={remove.isPending} onClick={() => remove.mutate(channel.id, { onSuccess: onClose })}>
            Remover
          </Button>
        </>
      }
    >
      {count > 0 ? (
        <p className="text-sm text-fg-muted">
          {count === 1 ? "A conversa deste canal continua" : `As ${count} conversas deste canal continuam`} no
          histórico. Se este número for conectado de novo, num canal novo, o histórico passa para ele.
        </p>
      ) : (
        <p className="text-sm text-fg-muted">Este canal não tem conversas.</p>
      )}
      {remove.error && <p className="mt-3 text-sm text-danger-700">{errorText(remove.error)}</p>}
    </Dialog>
  );
}

export default function ChannelsPage() {
  const me = useMe();
  const channels = useChannelList();
  const [modal, setModal] = useState<Modal>(null);
  const close = () => setModal(null);

  const canManage = me.data?.role === "ADMIN" || me.data?.role === "MANAGER";

  return (
    <>
      <PageHeader
        title="Canais"
        description="Conexões de WhatsApp que recebem e enviam as mensagens"
        actions={
          canManage && (
            <Button icon={<Plus />} onClick={() => setModal({ type: "create" })}>
              Novo canal WhatsApp
            </Button>
          )
        }
      />
      <div className="p-8">
        {channels.isPending ? (
          <SkeletonList rows={3} />
        ) : channels.isError ? (
          <ErrorState error={channels.error} onRetry={() => channels.refetch()} />
        ) : channels.data.length === 0 ? (
          <EmptyState
            icon={MessageCircle}
            title="Nenhum canal conectado"
            description={
              canManage
                ? "Conecte um WhatsApp para começar a receber mensagens."
                : "Peça a um administrador para conectar o WhatsApp."
            }
            action={
              canManage && (
                <Button icon={<Plus />} onClick={() => setModal({ type: "create" })}>
                  Novo canal WhatsApp
                </Button>
              )
            }
          />
        ) : (
          <div className="space-y-3">
            {!canManage && (
              <p className="text-sm text-fg-muted">
                Só administradores e gerentes conectam ou removem canais.
              </p>
            )}
            {channels.data.map((c) => (
              <ChannelCard
                key={c.id}
                channel={c}
                canManage={canManage}
                onConnect={() => setModal({ type: "connect", channel: { id: c.id, name: c.name } })}
                onRemove={() => setModal({ type: "remove", channel: c })}
              />
            ))}
          </div>
        )}
      </div>

      {modal?.type === "create" && (
        <NewChannelDialog onClose={close} onCreated={(channel) => setModal({ type: "connect", channel })} />
      )}
      {modal?.type === "connect" && <ConnectChannelDialog channel={modal.channel} onClose={close} />}
      {modal?.type === "remove" && <RemoveChannelDialog channel={modal.channel} onClose={close} />}
    </>
  );
}
