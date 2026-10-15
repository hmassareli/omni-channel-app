import { useEffect } from "react";
import { supabase } from "../../../lib/supabase";
import { LoadingScreen } from "../../../components/layout/LoadingScreen";

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

      
      // Aguarda um pouco para o Supabase processar o hash
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Tenta trocar o code por sessão
      const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(
        window.location.search
      );
      
      if (exchangeError) {
        console.error('[Callback] Erro ao trocar code:', exchangeError);
      }
      
      // Verifica a sessão
      const { data, error } = await supabase.auth.getSession();
      


      if (error) {
        console.error("Erro:", error);
        window.location.href = "/?error=auth_callback_failed";
        return;
      }

      if (!data.session) {
        console.error("Sem sessão!");
        window.location.href = "/?error=auth_callback_failed";
        return;
      }


      window.location.href = "/";
    };

    handleCallback();
  }, []);

  return <LoadingScreen label="Autenticando..." />;
}
