import { useEffect } from "react";
import { supabase } from "../lib/supabase";

/**
 * Componente que processa o callback de autenticação OAuth.
 * Após o login com Google, o Supabase redireciona para esta página
 * com os tokens na URL (hash fragment).
 * 
 * O Supabase JS automaticamente processa esses tokens,
 * então apenas precisamos redirecionar o usuário após o processamento.
 */
export function AuthCallback() {
  useEffect(() => {
    const handleCallback = async () => {
      // O Supabase automaticamente processa o hash fragment com os tokens
      const { data, error } = await supabase.auth.getSession();

      if (error) {
        console.error("Erro no callback de autenticação:", error);
        window.location.href = "/login?error=auth_callback_failed";
        return;
      }

      if (data.session) {
        // Sucesso! Redireciona para a página principal
        window.location.href = "/";
      } else {
        // Sem sessão, volta para o login
        window.location.href = "/login";
      }
    };

    handleCallback();
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <div className="inline-flex items-center justify-center bg-purple-600 p-4 rounded-2xl shadow-lg mb-4">
          <span className="text-3xl font-bold text-white">CRM</span>
        </div>
        <div className="flex items-center justify-center gap-2 text-gray-600">
          <svg
            className="animate-spin h-5 w-5 text-purple-600"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            ></circle>
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            ></path>
          </svg>
          <span>Autenticando...</span>
        </div>
      </div>
    </div>
  );
}
