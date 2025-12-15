// Tipos para o fluxo de onboarding

export interface OnboardingVendedor {
  id: string;
  name: string;
  phone?: string;
  status: 'pending' | 'connecting' | 'connected' | 'error';
  avatarUrl?: string;
  qrCode?: string;
  // IDs do backend
  channelId?: string;
  agentId?: string;
}

export interface OnboardingState {
  currentStep: number;
  totalSteps: number;
  operationName: string;
  vendedores: OnboardingVendedor[];
}

export type OnboardingStep = 
  | 'welcome'           // Passo 1: Boas-vindas e nome da operação
  | 'vendedores'        // Passo 2: Cadastro de vendedores com WhatsApp
  | 'tags'              // Passo 3: Configurar tags (opcional)
  | 'finish';           // Passo 4: Finalização
