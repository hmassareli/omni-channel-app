import { useState, useEffect } from 'react';
import { useOnboarding } from './useOnboarding';
import { 
  ProgressBar, 
  WelcomeStep, 
  VendedoresStep, 
  FinishStep 
} from './components';
import * as api from '../../lib/api';

interface OnboardingPageProps {
  onComplete: () => void;
}

export function OnboardingPage({ onComplete }: OnboardingPageProps) {
  const {
    state,
    currentStepName,
    nextStep,
    prevStep,
    setOperationName,
    addVendedor,
    updateVendedor,
    removeVendedor,
    setVendedores,
    goToStep,
  } = useOnboarding();

  // ID da operação criada no backend
  const [operationId, setOperationId] = useState<string | null>(null);
  const [isCreatingOperation, setIsCreatingOperation] = useState(false);
  const [isCheckingOperation, setIsCheckingOperation] = useState(true);
  // Flag que indica se a operação já existia antes do onboarding
  const [hasExistingOperation, setHasExistingOperation] = useState(false);

  // Verifica se já existe uma operação cadastrada ao carregar
  useEffect(() => {
    async function checkExistingOperation() {
      try {
        // Busca a operation do usuário autenticado
        const operation = await api.getUserOperation();
        
        if (operation) {
          // Já existe operação, usa ela e pula para vendedores
          setOperationId(operation.id);
          setOperationName(operation.name);
          setHasExistingOperation(true);
          
          // Busca os agents/vendedores existentes
          const agents = await api.getAgentsByOperation(operation.id);
          
          // Converte agents para o formato de vendedores do onboarding
          const existingVendedores = await Promise.all(
            agents.map(async (agent) => {
              const channel = agent.channels[0]; // Pega o primeiro canal do agent
              
              let vendedorStatus: 'pending' | 'connecting' | 'connected' | 'error' = 'pending';
              let phone: string | undefined;
              let qrCode: string | undefined;
              
              if (channel) {
                try {
                  // Verifica o status real do channel no WAHA
                  const channelStatus = await api.getChannelStatus(channel.id);
                  
                  if (channelStatus.status === 'WORKING') {
                    vendedorStatus = 'connected';
                    phone = channelStatus.phoneNumber;
                  } else if (channelStatus.status === 'FAILED') {
                    vendedorStatus = 'error';
                  } else {
                    // STARTING ou SCAN_QR - tenta buscar o QR
                    try {
                      const qrData = await api.getChannelQRCode(channel.id);
                      if (qrData.qrCode) {
                        // Tem QR - mostra como pending para exibir o QR
                        qrCode = qrData.qrCode.startsWith('data:') 
                          ? qrData.qrCode 
                          : `data:image/png;base64,${qrData.qrCode}`;
                        vendedorStatus = 'pending';
                      } else {
                        // Não tem QR ainda - mostra como connecting
                        vendedorStatus = 'connecting';
                      }
                    } catch {
                      // Erro ao buscar QR - mostra como connecting
                      vendedorStatus = 'connecting';
                    }
                  }
                } catch (error) {
                  console.error('Erro ao verificar status do channel:', error);
                  vendedorStatus = 'error';
                }
              }
              
              return {
                id: agent.id,
                name: agent.name,
                phone,
                status: vendedorStatus,
                qrCode,
                channelId: channel?.id,
                agentId: agent.id,
              };
            })
          );
          
          if (existingVendedores.length > 0) {
            setVendedores(existingVendedores);
          }
          
          goToStep(2, 'vendedores');
        }
      } catch (error) {
        console.error('Erro ao verificar operation do usuário:', error);
      } finally {
        setIsCheckingOperation(false);
      }
    }

    checkExistingOperation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connectedVendedores = state.vendedores.filter(v => v.status === 'connected');

  // Handler para quando sair do Welcome step - cria a operation
  const handleWelcomeNext = async () => {
    if (isCreatingOperation) return;
    
    setIsCreatingOperation(true);
    
    try {
      // Cria a Operation no backend
      const operation = await api.createOperation(state.operationName);
      setOperationId(operation.id);
      nextStep();
    } catch (error) {
      console.error('Erro ao criar operação:', error);
      alert('Erro ao criar operação. Tente novamente.');
    } finally {
      setIsCreatingOperation(false);
    }
  };

  const handleFinish = async () => {
    console.log('Onboarding completo:', state);
    onComplete();
  };

  // Handler para voltar do VendedoresStep - não permite voltar se já tinha operação
  const handleVendedoresBack = () => {
    // Se a operação já existia antes do onboarding, não permite voltar ao Welcome
    if (hasExistingOperation) {
      return;
    }
    prevStep();
  };

  // Loading enquanto verifica se existe operação
  if (isCheckingOperation) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Carregando...</p>
        </div>
      </div>
    );
  }

  const renderStep = () => {
    switch (currentStepName) {
      case 'welcome':
        return (
          <WelcomeStep
            operationName={state.operationName}
            onOperationNameChange={setOperationName}
            onNext={handleWelcomeNext}
            isLoading={isCreatingOperation}
          />
        );
      
      case 'vendedores':
        if (!operationId) {
          // Fallback caso não tenha operationId (não deveria acontecer)
          prevStep();
          return null;
        }
        return (
          <VendedoresStep
            operationId={operationId}
            vendedores={state.vendedores}
            onAddVendedor={addVendedor}
            onUpdateVendedor={updateVendedor}
            onRemoveVendedor={removeVendedor}
            onNext={nextStep}
            onBack={hasExistingOperation ? undefined : handleVendedoresBack}
          />
        );
      
      case 'tags':
        // Pulando tags por enquanto - vai direto para finish
        nextStep();
        return null;
      
      case 'finish':
        return (
          <FinishStep
            operationName={state.operationName}
            vendedoresCount={connectedVendedores.length}
            onFinish={handleFinish}
            onBack={prevStep}
          />
        );
      
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-12">
        <ProgressBar 
          currentStep={state.currentStep} 
          totalSteps={state.totalSteps} 
        />
        
        {renderStep()}
      </div>
    </div>
  );
}
