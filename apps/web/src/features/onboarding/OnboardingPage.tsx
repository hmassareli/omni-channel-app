import { useState } from 'react';
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
  } = useOnboarding();

  // ID da operação criada no backend
  const [operationId, setOperationId] = useState<string | null>(null);
  const [isCreatingOperation, setIsCreatingOperation] = useState(false);

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
            onBack={prevStep}
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
