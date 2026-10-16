import { AlertCircle, Lock } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button, Input } from "../../../components/ui";
import { useSession } from "../authContext";
import { AuthCard } from "../components/AuthCard";

const MIN_LENGTH = 8;

/** Troca obrigatória da senha provisória (primeiro acesso ou após redefinição). */
export function ChangePasswordPage() {
  const { changePassword, signOut, user } = useSession();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (next.length < MIN_LENGTH) return setError(`A nova senha precisa ter ao menos ${MIN_LENGTH} caracteres.`);
    if (next !== confirm) return setError("As senhas não conferem.");
    if (next === current) return setError("Escolha uma senha diferente da provisória.");

    setSaving(true);
    try {
      await changePassword(current, next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível trocar a senha.");
      setSaving(false);
    }
  }

  return (
    <AuthCard
      title="Defina sua senha"
      description={`Olá${user?.name ? `, ${user.name}` : ""}! Troque a senha provisória para continuar.`}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-md border border-danger-100 bg-danger-50 px-3 py-2 text-sm text-danger-700"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            {error}
          </div>
        )}
        <Input
          label="Senha provisória"
          type="password"
          autoComplete="current-password"
          icon={<Lock />}
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          required
          autoFocus
        />
        <Input
          label="Nova senha"
          type="password"
          autoComplete="new-password"
          icon={<Lock />}
          hint={`Mínimo de ${MIN_LENGTH} caracteres.`}
          value={next}
          onChange={(e) => setNext(e.target.value)}
          required
        />
        <Input
          label="Confirme a nova senha"
          type="password"
          autoComplete="new-password"
          icon={<Lock />}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
        />
        <Button type="submit" size="lg" loading={saving} className="w-full">
          Salvar e continuar
        </Button>
        <Button type="button" variant="ghost" className="w-full" onClick={signOut}>
          Sair
        </Button>
      </form>
    </AuthCard>
  );
}
