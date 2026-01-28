import { useState, useEffect } from "react";
import { useAuth } from "../hooks/useAuth";
import { Mail, Lock, User, Loader2, AlertCircle } from "lucide-react";

type AuthMode = "login" | "signup" | "forgot-password";

const URL_ERROR_MESSAGES: Record<string, string> = {
  auth_callback_failed: "Falha na autenticação. Por favor, tente novamente.",
  session_expired: "Sua sessão expirou. Faça login novamente.",
};

export function LoginPage() {
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Captura erros passados via URL (ex: ?error=auth_callback_failed)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const errorParam = params.get("error");
    
    if (errorParam) {
      const errorMessage = URL_ERROR_MESSAGES[errorParam] || "Ocorreu um erro. Tente novamente.";
      
      // Limpa o parâmetro da URL sem recarregar a página
      window.history.replaceState({}, "", window.location.pathname);
      
      // Define o erro após limpar a URL (assíncrono para evitar warning)
      setTimeout(() => {
        setLocalError(errorMessage);
      }, 0);
    }
  }, []);

  const {
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    resetPassword,
    loading,
    error,
  } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    setSuccessMessage(null);

    if (mode === "login") {
      const result = await signInWithEmail(email, password);
      if (!result.success) {
        setLocalError(result.error?.message || "Erro ao fazer login");
      }
    } else if (mode === "signup") {
      if (password.length < 6) {
        setLocalError("A senha deve ter pelo menos 6 caracteres");
        return;
      }
      const result = await signUpWithEmail(email, password, fullName);
      if (!result.success) {
        setLocalError(result.error?.message || "Erro ao criar conta");
      } else {
        setSuccessMessage(
          "Conta criada! Verifique seu email para confirmar o cadastro."
        );
        setMode("login");
      }
    } else if (mode === "forgot-password") {
      const result = await resetPassword(email);
      if (result.success) {
        setSuccessMessage(
          "Email enviado! Verifique sua caixa de entrada para redefinir a senha."
        );
        setMode("login");
      } else {
        setLocalError(result.error?.message || "Erro ao enviar email");
      }
    }
  };

  const displayError = localError || error?.message;

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-purple-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center bg-purple-600 p-4 rounded-2xl shadow-lg mb-4">
            <span className="text-3xl font-bold text-white">CRM</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-800">Omni Channel</h1>
          <p className="text-gray-500 mt-2">
            Gerencie todas as suas conversas em um só lugar
          </p>
        </div>

        {/* Card de Login */}
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8">
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-gray-800">
              {mode === "login" && "Bem-vindo de volta"}
              {mode === "signup" && "Criar nova conta"}
              {mode === "forgot-password" && "Recuperar senha"}
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              {mode === "login" && "Faça login para continuar"}
              {mode === "signup" && "Preencha os dados para se cadastrar"}
              {mode === "forgot-password" &&
                "Digite seu email para receber o link"}
            </p>
          </div>

          {/* Mensagens de erro/sucesso */}
          {displayError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700 text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {displayError}
            </div>
          )}

          {successMessage && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
              {successMessage}
            </div>
          )}

          {/* Formulário */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "signup" && (
              <div>
                <label
                  htmlFor="fullName"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Nome completo
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    id="fullName"
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="João Silva"
                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none transition-all text-gray-800 placeholder-gray-400"
                  />
                </div>
              </div>
            )}

            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  required
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none transition-all text-gray-800 placeholder-gray-400"
                />
              </div>
            </div>

            {mode !== "forgot-password" && (
              <div>
                <label
                  htmlFor="password"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Senha
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none transition-all text-gray-800 placeholder-gray-400"
                  />
                </div>
              </div>
            )}

            {mode === "login" && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setMode("forgot-password");
                    setLocalError(null);
                  }}
                  className="text-sm text-purple-600 hover:text-purple-700 font-medium"
                >
                  Esqueceu a senha?
                </button>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-purple-600 text-white py-3 rounded-lg font-medium hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Aguarde...
                </>
              ) : (
                <>
                  {mode === "login" && "Entrar"}
                  {mode === "signup" && "Criar conta"}
                  {mode === "forgot-password" && "Enviar link de recuperação"}
                </>
              )}
            </button>
          </form>

          {/* Divider */}
          {mode !== "forgot-password" && (
            <>
              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-200"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-white text-gray-500">ou</span>
                </div>
              </div>

              {/* Google Login */}
              <button
                type="button"
                onClick={signInWithGoogle}
                disabled={loading}
                className="w-full flex items-center justify-center gap-3 px-4 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    fill="#4285F4"
                  />
                  <path
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    fill="#34A853"
                  />
                  <path
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    fill="#FBBC05"
                  />
                  <path
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    fill="#EA4335"
                  />
                </svg>
                <span className="text-gray-700 font-medium">
                  Continuar com Google
                </span>
              </button>
            </>
          )}

          {/* Toggle Mode */}
          <div className="mt-6 text-center text-sm">
            {mode === "login" && (
              <p className="text-gray-600">
                Não tem uma conta?{" "}
                <button
                  type="button"
                  onClick={() => {
                    setMode("signup");
                    setLocalError(null);
                  }}
                  className="text-purple-600 hover:text-purple-700 font-medium"
                >
                  Criar conta
                </button>
              </p>
            )}
            {mode === "signup" && (
              <p className="text-gray-600">
                Já tem uma conta?{" "}
                <button
                  type="button"
                  onClick={() => {
                    setMode("login");
                    setLocalError(null);
                  }}
                  className="text-purple-600 hover:text-purple-700 font-medium"
                >
                  Fazer login
                </button>
              </p>
            )}
            {mode === "forgot-password" && (
              <p className="text-gray-600">
                Lembrou da senha?{" "}
                <button
                  type="button"
                  onClick={() => {
                    setMode("login");
                    setLocalError(null);
                  }}
                  className="text-purple-600 hover:text-purple-700 font-medium"
                >
                  Voltar ao login
                </button>
              </p>
            )}
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-gray-400 mt-6">
          © 2025 Omni Channel CRM. Todos os direitos reservados.
        </p>
      </div>
    </div>
  );
}
