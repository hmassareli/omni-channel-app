import { Building2, Loader2 } from 'lucide-react';

interface WelcomeStepProps {
  operationName: string;
  onOperationNameChange: (name: string) => void;
  onNext: () => void;
  isLoading?: boolean;
}

export function WelcomeStep({ 
  operationName, 
  onOperationNameChange, 
  onNext,
  isLoading = false,
}: WelcomeStepProps) {
  const canProceed = operationName.trim().length > 0 && !isLoading;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (canProceed) {
      onNext();
    }
  };

  return (
    <div className="max-w-lg mx-auto">
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-4">
          <Building2 className="w-8 h-8 text-blue-600" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Bem-vindo ao CRM Omni Channel
        </h1>
        <p className="text-gray-600">
          Vamos configurar sua operação em poucos passos. Primeiro, dê um nome para identificar sua empresa.
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="mb-6">
          <label 
            htmlFor="operationName" 
            className="block text-sm font-medium text-gray-700 mb-2"
          >
            Nome da Operação
          </label>
          <input
            id="operationName"
            type="text"
            value={operationName}
            onChange={(e) => onOperationNameChange(e.target.value)}
            placeholder="Ex: Minha Empresa"
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors"
            autoFocus
            disabled={isLoading}
          />
          <p className="mt-2 text-sm text-gray-500">
            Este nome será usado para identificar sua operação no sistema.
          </p>
        </div>

        <button
          type="submit"
          disabled={!canProceed}
          className="w-full py-3 px-4 bg-blue-500 text-white font-medium rounded-lg hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
        >
          {isLoading && <Loader2 className="w-5 h-5 animate-spin" />}
          {isLoading ? 'Criando...' : 'Continuar'}
        </button>
      </form>
    </div>
  );
}
