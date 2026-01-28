import { CheckCircle, Rocket } from 'lucide-react';

interface FinishStepProps {
  operationName: string;
  vendedoresCount: number;
  onFinish: () => void;
  onBack: () => void;
  isLoading?: boolean;
}

export function FinishStep({ 
  operationName, 
  vendedoresCount, 
  onFinish, 
  onBack,
  isLoading
}: FinishStepProps) {
  return (
    <div className="max-w-lg mx-auto text-center">
      <div className="mb-8">
        <div className="inline-flex items-center justify-center w-20 h-20 bg-green-100 rounded-full mb-6">
          <CheckCircle className="w-10 h-10 text-green-600" />
        </div>
        
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Tudo pronto!
        </h1>
        <p className="text-gray-600">
          Sua operação <strong>{operationName}</strong> está configurada com{' '}
          <strong>{vendedoresCount}</strong> vendedor{vendedoresCount !== 1 ? 'es' : ''} conectado{vendedoresCount !== 1 ? 's' : ''}.
        </p>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 mb-8 text-left">
        <h3 className="font-semibold text-blue-900 mb-3">Próximos passos:</h3>
        <ul className="space-y-2 text-sm text-blue-800">
          <li className="flex items-start gap-2">
            <span className="w-5 h-5 bg-blue-200 rounded-full flex items-center justify-center text-xs font-bold text-blue-700 shrink-0 mt-0.5">1</span>
            As mensagens recebidas no WhatsApp aparecerão automaticamente no CRM
          </li>
          <li className="flex items-start gap-2">
            <span className="w-5 h-5 bg-blue-200 rounded-full flex items-center justify-center text-xs font-bold text-blue-700 shrink-0 mt-0.5">2</span>
            Configure tags e etapas do funil para organizar seus contatos
          </li>
          <li className="flex items-start gap-2">
            <span className="w-5 h-5 bg-blue-200 rounded-full flex items-center justify-center text-xs font-bold text-blue-700 shrink-0 mt-0.5">3</span>
            A IA analisará as conversas e aplicará tags automaticamente
          </li>
        </ul>
      </div>

      <div className="flex justify-between">
        <button
          onClick={onBack}
          className="px-6 py-2 text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
        >
          Voltar
        </button>
        <button
          onClick={onFinish}
          disabled={isLoading}
          className={`flex items-center gap-2 px-6 py-3 font-medium rounded-lg transition-colors ${
            isLoading
              ? "bg-blue-300 text-white cursor-not-allowed"
              : "bg-blue-500 text-white hover:bg-blue-600"
          }`}
        >
          <Rocket className="w-5 h-5" />
          {isLoading ? "Salvando..." : "Começar a usar"}
        </button>
      </div>
    </div>
  );
}
