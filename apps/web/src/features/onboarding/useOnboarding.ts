import { useState } from 'react';
import type { OnboardingState, OnboardingStep, OnboardingVendedor } from './types';

const TOTAL_STEPS = 4;

export function useOnboarding() {
  const [state, setState] = useState<OnboardingState>({
    currentStep: 1,
    totalSteps: TOTAL_STEPS,
    operationName: '',
    vendedores: [],
  });

  const [currentStepName, setCurrentStepName] = useState<OnboardingStep>('welcome');

  const progress = (state.currentStep / state.totalSteps) * 100;

  const goToStep = (step: number, stepName: OnboardingStep) => {
    setState(prev => ({ ...prev, currentStep: step }));
    setCurrentStepName(stepName);
  };

  const nextStep = () => {
    const steps: OnboardingStep[] = ['welcome', 'vendedores', 'tags', 'finish'];
    const nextIndex = state.currentStep; // currentStep é 1-indexed, então já é o próximo índice
    if (nextIndex < steps.length) {
      goToStep(state.currentStep + 1, steps[nextIndex]);
    }
  };

  const prevStep = () => {
    const steps: OnboardingStep[] = ['welcome', 'vendedores', 'tags', 'finish'];
    const prevIndex = state.currentStep - 2; // -1 para 0-indexed, -1 para voltar
    if (prevIndex >= 0) {
      goToStep(state.currentStep - 1, steps[prevIndex]);
    }
  };

  const setOperationName = (name: string) => {
    setState(prev => ({ ...prev, operationName: name }));
  };

  const addVendedor = (vendedor: Omit<OnboardingVendedor, 'id' | 'status'>) => {
    const newVendedor: OnboardingVendedor = {
      ...vendedor,
      id: crypto.randomUUID(),
      status: 'pending',
    };
    setState(prev => ({
      ...prev,
      vendedores: [...prev.vendedores, newVendedor],
    }));
    return newVendedor;
  };

  const updateVendedor = (id: string, updates: Partial<OnboardingVendedor>) => {
    setState(prev => ({
      ...prev,
      vendedores: prev.vendedores.map(v =>
        v.id === id ? { ...v, ...updates } : v
      ),
    }));
  };

  const removeVendedor = (id: string) => {
    setState(prev => ({
      ...prev,
      vendedores: prev.vendedores.filter(v => v.id !== id),
    }));
  };

  const canProceed = (): boolean => {
    switch (currentStepName) {
      case 'welcome':
        return state.operationName.trim().length > 0;
      case 'vendedores':
        // Precisa de pelo menos 1 vendedor conectado
        return state.vendedores.some(v => v.status === 'connected');
      case 'tags':
        return true; // Tags são opcionais
      case 'finish':
        return true;
      default:
        return false;
    }
  };

  return {
    state,
    currentStepName,
    progress,
    goToStep,
    nextStep,
    prevStep,
    setOperationName,
    addVendedor,
    updateVendedor,
    removeVendedor,
    canProceed,
  };
}
