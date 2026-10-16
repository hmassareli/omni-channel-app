import { AlertCircle, Lock, Mail } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button, Input } from "../../../components/ui";
import { useSession } from "../authContext";
import { AuthCard } from "../components/AuthCard";

export function LoginPage() {
  const { signInWithEmail, loading } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const result = await signInWithEmail(email, password);
    if (!result.success) setError(result.error.message);
  }

  return (
    <AuthCard title="Entrar" description="Acesse a mesa de atendimento com seu e-mail e senha.">
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
          label="E-mail"
          type="email"
          autoComplete="email"
          icon={<Mail />}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="voce@empresa.com"
          required
          autoFocus
        />
        <Input
          label="Senha"
          type="password"
          autoComplete="current-password"
          icon={<Lock />}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <Button type="submit" size="lg" loading={loading} className="w-full">
          Entrar
        </Button>
        <p className="text-center text-xs text-fg-muted">
          Esqueceu a senha? Peça a um administrador para redefinir.
        </p>
      </form>
    </AuthCard>
  );
}
