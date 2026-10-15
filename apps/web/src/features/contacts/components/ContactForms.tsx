import { Link, Plus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Avatar, Button, Input } from "../../../components/ui";
import type { WhatsAppChat } from "../../../lib/api";
import { useCreateContact, useLinkWhatsAppChat } from "../hooks";
import { formatPhone } from "../utils";

function FormError({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <p className="rounded-md bg-danger-50 p-3 text-sm text-danger-700">
      {error instanceof Error ? error.message : "Erro ao salvar contato"}
    </p>
  );
}

/** Vincula um chat do WhatsApp selecionado à empresa. */
export function LinkChatForm({
  chat,
  companyId,
  channelId,
  onBack,
  onDone,
}: {
  chat: WhatsAppChat;
  companyId: string;
  channelId: string;
  onBack: () => void;
  onDone: () => void;
}) {
  const [name, setName] = useState(chat.name || "");
  const [role, setRole] = useState("");
  const link = useLinkWhatsAppChat();

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    await link.mutateAsync({
      waId: chat.waId,
      companyId,
      channelId,
      name: name || undefined,
      role: role || undefined,
    });
    onDone();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <FormError error={link.error} />
      <div className="flex items-center gap-3 rounded-lg bg-subtle p-3">
        <Avatar name={chat.name || chat.waId} src={chat.picture} size="md" />
        <div>
          <p className="text-sm font-medium text-fg">
            {chat.name || "Sem nome"}
          </p>
          <p className="text-xs text-fg-muted">{formatPhone(chat.waId)}</p>
        </div>
      </div>
      <Input
        label="Nome do contato"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Nome do contato"
      />
      <Input
        label="Cargo/Função"
        value={role}
        onChange={(e) => setRole(e.target.value)}
        placeholder="Ex.: Diretor, Gerente..."
      />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onBack}>
          Voltar
        </Button>
        <Button type="submit" loading={link.isPending} icon={<Link />}>
          {link.isPending ? "Vinculando..." : "Vincular à empresa"}
        </Button>
      </div>
    </form>
  );
}

/** Cria um contato manualmente (nome, WhatsApp, e-mail, cargo). */
export function ManualContactForm({
  companyId,
  onCancel,
  onDone,
}: {
  companyId: string;
  onCancel: () => void;
  onDone: () => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  const create = useCreateContact();

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name && !phone && !email) return;
    await create.mutateAsync({
      name: name || undefined,
      phone: phone || undefined,
      email: email || undefined,
      companyId,
      role: role || undefined,
    });
    onDone();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <FormError error={create.error} />
      <Input
        label="Nome *"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Nome do contato"
        required
      />
      <Input
        label="WhatsApp"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="5511999999999"
        hint="Formato: código do país + DDD + número"
      />
      <Input
        label="E-mail"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="email@exemplo.com"
      />
      <Input
        label="Cargo/Função"
        value={role}
        onChange={(e) => setRole(e.target.value)}
        placeholder="Ex.: Diretor, Gerente..."
      />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
        <Button
          type="submit"
          disabled={!name}
          loading={create.isPending}
          icon={<Plus />}
        >
          {create.isPending ? "Criando..." : "Criar contato"}
        </Button>
      </div>
    </form>
  );
}
