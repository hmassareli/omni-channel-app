import { Check, Copy, KeyRound, Link2, Plus, Trash2, UserCog } from "lucide-react";
import { useState, type FormEvent } from "react";
import { PageHeader } from "../../../components/layout/PageHeader";
import {
  Avatar,
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
import type { TeamUser } from "../../../lib/api";
import { useAgents, useMe } from "../../operations/hooks";
import { useInviteUser, useLinkAgent, useRemoveUser, useResetPassword, useTeamUsers } from "../hooks";

const ROLE_LABEL: Record<TeamUser["role"], string> = {
  ADMIN: "Administrador",
  MANAGER: "Gerente",
  AGENT: "Atendente",
};

type Modal =
  | { type: "invite" }
  | { type: "password"; user: TeamUser; password: string; invited: boolean }
  | { type: "reset"; user: TeamUser }
  | { type: "remove"; user: TeamUser }
  | { type: "link"; user: TeamUser }
  | null;

const errorText = (e: unknown) => (e instanceof Error ? e.message : undefined);

/** Mostra a senha provisória uma única vez, com botão de copiar. */
function PasswordDialog({ modal, onClose }: { modal: Extract<Modal, { type: "password" }>; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(modal.password);
    setCopied(true);
  };
  return (
    <Dialog
      open
      onClose={onClose}
      size="sm"
      title={modal.invited ? "Usuário convidado" : "Senha redefinida"}
      description={`Envie esta senha provisória para ${modal.user.name}. Ela não será mostrada de novo e precisa ser trocada no primeiro acesso.`}
      footer={<Button onClick={onClose}>Pronto</Button>}
    >
      <div className="flex items-center gap-2 rounded-lg border border-line bg-subtle px-3 py-2">
        <code className="flex-1 select-all font-mono text-sm text-fg">{modal.password}</code>
        <Button size="sm" variant="ghost" icon={copied ? <Check /> : <Copy />} onClick={copy}>
          {copied ? "Copiado" : "Copiar"}
        </Button>
      </div>
      <p className="mt-3 text-xs text-fg-muted">Login: {modal.user.email}</p>
    </Dialog>
  );
}

function InviteDialog({
  isAdmin,
  onClose,
  onInvited,
}: {
  isAdmin: boolean;
  onClose: () => void;
  onInvited: (user: TeamUser, password: string) => void;
}) {
  const invite = useInviteUser();
  const agents = useAgents();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<TeamUser["role"]>("AGENT");
  const [agentId, setAgentId] = useState("");
  const freeAgents = (agents.data ?? []).filter((a) => !a.userId);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    invite.mutate(
      { name: name.trim(), email: email.trim(), role, agentId: agentId || undefined },
      { onSuccess: (r) => onInvited(r.user, r.temporaryPassword) },
    );
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title="Convidar pessoa"
      description="Ela recebe uma senha provisória e define a própria senha no primeiro acesso."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="invite-form" loading={invite.isPending} disabled={!name.trim() || !email.trim()}>
            Convidar
          </Button>
        </>
      }
    >
      <form id="invite-form" onSubmit={submit} className="space-y-4">
        <Input label="Nome" autoFocus value={name} onChange={(e) => setName(e.target.value)} required />
        <Input label="E-mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <Select label="Papel" value={role} onChange={(e) => setRole(e.target.value as TeamUser["role"])}>
          <option value="AGENT">Atendente</option>
          <option value="MANAGER">Gerente</option>
          {isAdmin && <option value="ADMIN">Administrador</option>}
        </Select>
        {freeAgents.length > 0 && (
          <Select
            label="Atendente"
            hint="Vincule a um atendente já cadastrado ou deixe criar um novo."
            value={agentId}
            onChange={(e) => setAgentId(e.target.value)}
          >
            <option value="">Criar novo atendente</option>
            {freeAgents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        )}
        {invite.error && <p className="text-sm text-danger-700">{errorText(invite.error)}</p>}
      </form>
    </Dialog>
  );
}

function LinkAgentDialog({ user, onClose }: { user: TeamUser; onClose: () => void }) {
  const agents = useAgents();
  const link = useLinkAgent();
  const freeAgents = (agents.data ?? []).filter((a) => !a.userId);
  const [agentId, setAgentId] = useState(freeAgents[0]?.id ?? "");

  return (
    <Dialog
      open
      onClose={onClose}
      size="sm"
      title="Vincular atendente"
      description={`Assim ${user.name} pode assumir conversas no inbox.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            loading={link.isPending}
            disabled={!agentId}
            onClick={() => link.mutate({ agentId, userId: user.id }, { onSuccess: onClose })}
          >
            Vincular
          </Button>
        </>
      }
    >
      {freeAgents.length === 0 ? (
        <p className="text-sm text-fg-muted">Não há atendentes sem usuário vinculado.</p>
      ) : (
        <Select label="Atendente" value={agentId} onChange={(e) => setAgentId(e.target.value)}>
          {freeAgents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>
      )}
      {link.error && <p className="mt-3 text-sm text-danger-700">{errorText(link.error)}</p>}
    </Dialog>
  );
}

function ConfirmDialog({
  title,
  description,
  confirmLabel,
  danger,
  pending,
  error,
  onConfirm,
  onClose,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  danger?: boolean;
  pending: boolean;
  error?: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog
      open
      onClose={onClose}
      size="sm"
      title={title}
      description={description}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant={danger ? "danger" : "primary"} loading={pending} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {error && <p className="text-sm text-danger-700">{error}</p>}
    </Dialog>
  );
}

export default function TeamPage() {
  const me = useMe();
  const users = useTeamUsers();
  const reset = useResetPassword();
  const remove = useRemoveUser();
  const [modal, setModal] = useState<Modal>(null);
  const close = () => setModal(null);

  const role = me.data?.role;
  const allowed = role === "ADMIN" || role === "MANAGER";
  const canManage = (u: TeamUser) => u.id !== me.data?.id && (role === "ADMIN" || u.role !== "ADMIN");

  return (
    <>
      <PageHeader
        title="Equipe"
        description="Quem acessa o sistema e atende as conversas"
        actions={
          allowed && (
            <Button icon={<Plus />} onClick={() => setModal({ type: "invite" })}>
              Convidar
            </Button>
          )
        }
      />
      <div className="p-8">
        {me.isPending || users.isPending ? (
          <SkeletonList rows={4} />
        ) : !allowed ? (
          <EmptyState icon={UserCog} title="Acesso restrito" description="Apenas administradores e gerentes gerenciam a equipe." />
        ) : users.isError ? (
          <ErrorState error={users.error} onRetry={() => users.refetch()} />
        ) : users.data.length === 0 ? (
          <EmptyState icon={UserCog} title="Ninguém por aqui" description="Convide a primeira pessoa da equipe." />
        ) : (
          <Card className="divide-y divide-line">
            {users.data.map((u) => (
              <div key={u.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar name={u.name} />
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 truncate text-sm font-medium text-fg">
                      {u.name}
                      {u.id === me.data?.id && <span className="text-xs font-normal text-fg-muted">(você)</span>}
                    </p>
                    <p className="truncate text-xs text-fg-muted">{u.email}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={u.role === "AGENT" ? "neutral" : "accent"}>{ROLE_LABEL[u.role]}</Badge>
                  {u.mustChangePassword && <Badge tone="warning">Senha provisória</Badge>}
                  {!u.agent && (
                    <Button size="sm" variant="ghost" icon={<Link2 />} onClick={() => setModal({ type: "link", user: u })}>
                      Vincular atendente
                    </Button>
                  )}
                  {canManage(u) && (
                    <>
                      <Button size="sm" variant="ghost" icon={<KeyRound />} onClick={() => setModal({ type: "reset", user: u })}>
                        Redefinir senha
                      </Button>
                      <Button size="sm" variant="ghost" icon={<Trash2 />} onClick={() => setModal({ type: "remove", user: u })}>
                        Remover
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </Card>
        )}
      </div>

      {modal?.type === "invite" && (
        <InviteDialog
          isAdmin={role === "ADMIN"}
          onClose={close}
          onInvited={(user, password) => setModal({ type: "password", user, password, invited: true })}
        />
      )}
      {modal?.type === "password" && <PasswordDialog modal={modal} onClose={close} />}
      {modal?.type === "link" && <LinkAgentDialog user={modal.user} onClose={close} />}
      {modal?.type === "reset" && (
        <ConfirmDialog
          title="Redefinir senha"
          description={`${modal.user.name} receberá uma nova senha provisória e as sessões abertas serão encerradas.`}
          confirmLabel="Redefinir"
          pending={reset.isPending}
          error={errorText(reset.error)}
          onClose={close}
          onConfirm={() => {
            const user = modal.user;
            reset.mutate(user.id, {
              onSuccess: (r) => setModal({ type: "password", user, password: r.temporaryPassword, invited: false }),
            });
          }}
        />
      )}
      {modal?.type === "remove" && (
        <ConfirmDialog
          title="Remover pessoa"
          description={`${modal.user.name} perde o acesso ao sistema. O histórico de atendimentos é mantido.`}
          confirmLabel="Remover"
          danger
          pending={remove.isPending}
          error={errorText(remove.error)}
          onClose={close}
          onConfirm={() => remove.mutate(modal.user.id, { onSuccess: close })}
        />
      )}
    </>
  );
}
