import { LogOut } from "lucide-react";
import { useState, useEffect } from "react";
import { useAuth } from "./hooks/useAuth";
import { LoginPage } from "./components/LoginPage";
import { AuthCallback } from "./components/AuthCallback";
import { ContactTimeline } from "./pages/ContactTimeline";
import { CompaniesPage } from "./pages/CompaniesPage";
import { CompanyTimeline } from "./pages/CompanyTimeline";
import { OpportunitiesPage } from "./pages/OpportunitiesPage";
import { OnboardingPage } from "./features/onboarding";
import * as api from "./lib/api";

// --- Componentes de Layout ---

interface TopHeaderProps {
  userName?: string;
  userEmail?: string;
  onSignOut: () => void;
}

const TopHeader = ({ userName, userEmail, onSignOut }: TopHeaderProps) => {
  const initials = userName
    ? userName
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : userEmail?.slice(0, 2).toUpperCase() || "??";

  return (
    <header className="flex items-center justify-between px-6 py-3 bg-white border-b border-gray-200">
      <div className="flex items-center">
        <div className="bg-purple-600 p-2 rounded text-white font-bold">
          <span className="text-xl">CRM</span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-gray-100">
          <div className="w-8 h-8 bg-purple-600 rounded-full flex items-center justify-center text-white text-sm font-medium">
            {initials}
          </div>
          <span className="text-sm font-medium text-gray-700">
            {userName || userEmail || "Usuário"}
          </span>
        </div>
        <button
          onClick={onSignOut}
          className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors"
          title="Sair"
        >
          <LogOut className="w-4 h-4" />
          <span className="hidden sm:inline">Sair</span>
        </button>
      </div>
    </header>
  );
};

// --- Componente de Loading ---
const LoadingScreen = () => (
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
        <span>Carregando...</span>
      </div>
    </div>
  </div>
);

// --- Roteamento Simples ---
function getRoute(): "callback" | "contact" | "companies" | "company" | "opportunities" | "onboarding" | "home" {
  const path = window.location.pathname;
  if (path.startsWith("/auth/callback")) {
    return "callback";
  }
  if (path.startsWith("/onboarding")) {
    return "onboarding";
  }
  if (path.startsWith("/contact")) {
    return "contact";
  }
  if (path.startsWith("/companies/")) {
    return "company";
  }
  if (path.startsWith("/companies")) {
    return "companies";
  }
  if (path.startsWith("/opportunities")) {
    return "opportunities";
  }
  return "home";
}

// --- Dashboard Principal (com autenticação) ---
function Dashboard() {
  const { user, signOut } = useAuth();
  const route = getRoute();
  
  // Estado para controlar se precisa fazer onboarding
  const [needsOnboarding, setNeedsOnboarding] = useState<boolean | null>(null);
  const [checkingOnboarding, setCheckingOnboarding] = useState(true);

  useEffect(() => {
    const checkOnboarding = async () => {
      if (!user?.email) {
        setCheckingOnboarding(false);
        return;
      }

      try {
        // 1. Garante que o usuário existe no banco
        const userName = user?.user_metadata?.full_name || user?.user_metadata?.name || user.email.split('@')[0];
        
        await api.signupUser(user.email, userName);

        // 2. Verifica se tem operation
        const operation = await api.getUserOperation();
        setNeedsOnboarding(!operation);
      } catch (error) {
        console.error('[Dashboard] Erro ao verificar onboarding:', error);
        // Se for erro de "já cadastrado", ignora
        if (error instanceof Error && error.message.includes('já cadastrado')) {
          try {
            const operation = await api.getUserOperation();
            setNeedsOnboarding(!operation);
          } catch (opError) {
            console.error('[Dashboard] Erro ao buscar operation:', opError);
            setNeedsOnboarding(true);
          }
        } else {
          setNeedsOnboarding(true);
        }
      } finally {
        setCheckingOnboarding(false);
      }
    };
    
    checkOnboarding();
  }, [user]);

  const userName = user?.user_metadata?.full_name || user?.user_metadata?.name;
  const userEmail = user?.email;

  // Se está verificando onboarding, mostra loading
  if (checkingOnboarding) {
    return <LoadingScreen />;
  }

  // Se precisa de onboarding (e não está na rota de onboarding), redireciona
  if (needsOnboarding && route !== 'onboarding') {
    window.location.href = '/onboarding';
    return <LoadingScreen />;
  }

  // Se está na rota de onboarding
  if (route === 'onboarding') {
    return (
      <OnboardingPage 
        onComplete={() => {
          setNeedsOnboarding(false);
          window.location.href = '/';
        }} 
      />
    );
  }

  // Renderiza a página baseado na rota
  const renderPage = () => {
    switch (route) {
      case "contact":
        return <ContactTimeline userName={userName} />;
      case "companies":
        return <CompaniesPage />;
      case "company":
        return <CompanyTimeline />;
      case "opportunities":
        return <OpportunitiesPage />;
      default:
        // Home: Lista de contatos (placeholder por enquanto)
        return (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <h2 className="text-2xl font-semibold text-gray-800 mb-2">
                Bem-vindo ao Omni Channel CRM
              </h2>
              <p className="text-gray-500 mb-4">
                Selecione um contato para ver o histórico de conversas
              </p>
              <a
                href="/contact/1"
                className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
              >
                Ver exemplo de contato
              </a>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-900 flex flex-col">
      <TopHeader
        userName={userName}
        userEmail={userEmail}
        onSignOut={signOut}
      />
      {renderPage()}
    </div>
  );
}

// --- App Principal ---
export default function App() {
  const { user, loading, isAuthenticated } = useAuth();
  const route = getRoute();

  // Se está na rota de callback, mostra o componente de callback
  if (route === "callback") {
    return <AuthCallback />;
  }

  // Se está carregando, mostra loading
  if (loading) {
    return <LoadingScreen />;
  }

  // Se não está autenticado, mostra login
  if (!isAuthenticated || !user) {
    return <LoginPage />;
  }

  // Se está autenticado, mostra o dashboard
  return <Dashboard />;
}
