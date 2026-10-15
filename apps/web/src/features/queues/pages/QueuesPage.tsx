import { Layers, Pencil, Plus, Trash2, Users } from "lucide-react";
import { useState, type FormEvent } from "react";
import { PageHeader } from "../../../components/layout/PageHeader";
import {
  Avatar,
  Button,
  Card,
  Dialog,
  EmptyState,
  ErrorState,
  Input,
  SkeletonList,
} from "../../../components/ui";
import type { DeskQueue } from "../../../lib/api";
import { useMe, useAgents } from "../../operations/hooks";
import {
  useCreateQueue,
  useDeleteQueue,
  useQueues,
  useRenameQueue,
  useSetQueueMembers,
} from "../hooks";

type Modal =
  | { type: "create" }
  | { type: "rename"; queue: DeskQueue }
  | { type: "members"; queue: DeskQueue }
  | { type: "delete"; queue: DeskQueue }
  | null;

function errorText(e: unknown) {
  return e instanceof Error ? e.message : undefined;
}

function NameDialog({ modal, onClose }: { modal: Modal; onClose: () => void }) {
  const create = useCreateQueue();
  const rename = useRenameQueue();
  const open = modal?.type === "create" || modal?.type === "rename";
  const editing = modal?.type === "rename" ? modal.queue : null;
  const [name, setName] = useState(editing?.name ?? "");
  const mutation = editing ? rename : create;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const value = name.trim();
    if (!value) return;
    const done = { onSuccess: onClose };
    if (editing) rename.mutate({ id: editing.id, name: value }, done);
    else create.mutate(value, done);
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={editing ? "Renomear fila" : "Nova fila"}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="queue-name-form" loading={mutation.isPending} disabled={!name.trim()}>
            Salvar
          </Button>
        </>
      }
    >
      <form id="queue-name-form" onSubmit={submit}>
        <Input
          label="Nome"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={errorText(mutation.error)}
        />
      </form>
    </Dialog>
  );
}

function MembersDialog({ queue, onClose }: { queue: DeskQueue; onClose: () => void }) {
  const agents = useAgents();
  const save = useSetQueueMembers();
  const [selected, setSelected] = useState(() => new Set(queue.members.map((m) => m.id)));

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Membros de ${queue.name}`}
      description="Atendentes que recebem conversas desta fila."
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            loading={save.isPending}
            onClick={() => save.mutate({ id: queue.id, agentIds: [...selected] }, { onSuccess: onClose })}
          >
            Salvar
          </Button>
        </>
      }
    >
      {agents.isPending ? (
        <SkeletonList rows={3} />
      ) : agents.isError ? (
        <ErrorState error={agents.error} onRetry={() => agents.refetch()} />
      ) : agents.data.length === 0 ? (
        <p className="text-sm text-fg-muted">Nenhum atendente cadastrado.</p>
      ) : (
        <ul className="space-y-1">
          {agents.data.map((a) => (
            <li key={a.id}>
              <label className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 hover:bg-subtle">
                <input
                  type="checkbox"
                  className="size-4 accent-accent-600"
                  checked={selected.has(a.id)}
                  onChange={() => toggle(a.id)}
                />
                <Avatar name={a.name} src={a.avatarUrl} size="xs" />
                <span className="text-sm text-fg">{a.name}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
      {save.isError && <p className="mt-3 text-xs text-danger-600">{errorText(save.error)}</p>}
    </Dialog>
  );
}

function DeleteDialog({ queue, onClose }: { queue: DeskQueue; onClose: () => void }) {
  const del = useDeleteQueue();
  return (
    <Dialog
      open
      onClose={onClose}
      title="Excluir fila"
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="danger" loading={del.isPending} onClick={() => del.mutate(queue.id, { onSuccess: onClose })}>
            Excluir
          </Button>
        </>
      }
    >
      <p className="text-sm text-fg-muted">
        Excluir a fila <strong className="text-fg">{queue.name}</strong>? As conversas dela ficarão sem fila.
      </p>
      {del.isError && <p className="mt-3 text-xs text-danger-600">{errorText(del.error)}</p>}
    </Dialog>
  );
}

export default function QueuesPage() {
  const me = useMe();
  const queues = useQueues();
  const [modal, setModal] = useState<Modal>(null);
  const close = () => setModal(null);
  const allowed = me.data?.role === "ADMIN" || me.data?.role === "MANAGER";

  return (
    <>
      <PageHeader
        title="Filas de atendimento"
        description="Organize as conversas e defina quem atende cada fila"
        actions={
          allowed && (
            <Button icon={<Plus />} onClick={() => setModal({ type: "create" })}>
              Nova fila
            </Button>
          )
        }
      />
      <div className="p-8">
        {me.isPending || queues.isPending ? (
          <SkeletonList rows={3} />
        ) : !allowed ? (
          <EmptyState icon={Layers} title="Acesso restrito" description="Apenas administradores e gerentes configuram filas." />
        ) : queues.isError ? (
          <ErrorState error={queues.error} onRetry={() => queues.refetch()} />
        ) : queues.data.length === 0 ? (
          <EmptyState
            icon={Layers}
            title="Nenhuma fila"
            description="Crie a primeira fila para distribuir conversas entre atendentes."
            action={<Button onClick={() => setModal({ type: "create" })}>Nova fila</Button>}
          />
        ) : (
          <Card className="divide-y divide-line">
            {queues.data.map((q) => (
              <div key={q.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-fg">{q.name}</p>
                  <p className="text-xs text-fg-muted">
                    {q.members.length === 0
                      ? "Sem membros"
                      : q.members.map((m) => m.name).join(", ")}
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" icon={<Users />} onClick={() => setModal({ type: "members", queue: q })}>
                    Membros
                  </Button>
                  <Button size="sm" variant="ghost" icon={<Pencil />} onClick={() => setModal({ type: "rename", queue: q })}>
                    Renomear
                  </Button>
                  <Button size="sm" variant="ghost" icon={<Trash2 />} onClick={() => setModal({ type: "delete", queue: q })}>
                    Excluir
                  </Button>
                </div>
              </div>
            ))}
          </Card>
        )}
      </div>

      {(modal?.type === "create" || modal?.type === "rename") && (
        <NameDialog
          key={modal.type === "rename" ? modal.queue.id : "new"}
          modal={modal}
          onClose={close}
        />
      )}
      {modal?.type === "members" && <MembersDialog key={modal.queue.id} queue={modal.queue} onClose={close} />}
      {modal?.type === "delete" && <DeleteDialog queue={modal.queue} onClose={close} />}
    </>
  );
}
