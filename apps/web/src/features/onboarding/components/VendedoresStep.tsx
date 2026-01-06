import { useState, useEffect, useCallback } from 'react';
import { Plus, QrCode, RefreshCw, User, Loader2 } from 'lucide-react';
import type { OnboardingVendedor } from '../types';
import * as api from '../../../lib/api';

interface VendedoresStepProps {
  operationId: string;
  vendedores: OnboardingVendedor[];
  onAddVendedor: (vendedor: Omit<OnboardingVendedor, 'id' | 'status'>) => OnboardingVendedor;
  onUpdateVendedor: (id: string, updates: Partial<OnboardingVendedor>) => void;
  onRemoveVendedor: (id: string) => void;
  onNext: () => void;
  onBack?: () => void;
}

export function VendedoresStep({
  operationId,
  vendedores,
  onAddVendedor,
  onUpdateVendedor,
  onRemoveVendedor,
  onNext,
  onBack,
}: VendedoresStepProps) {
  const [showAddForm, setShowAddForm] = useState(vendedores.length === 0);
  const [newVendedorName, setNewVendedorName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const hasConnectedVendedor = vendedores.some(v => v.status === 'connected');

  const handleAddVendedor = async () => {
    if (!newVendedorName.trim() || isCreating) return;
    
    setIsCreating(true);
    
    try {
      // 1. Cria o Agent no backend
      const agent = await api.createAgent({
        name: newVendedorName.trim(),
        operationId,
      });
      
      // 2. Cria o Canal WhatsApp vinculado ao Agent
      const { channel } = await api.createWhatsAppChannel({
        name: `WhatsApp - ${newVendedorName.trim()}`,
        operationId,
        agentId: agent.id,
      });
      
      // 3. Adiciona ao estado local (já com status 'connecting')
      const vendedor = onAddVendedor({ 
        name: newVendedorName.trim(),
        channelId: channel.id,
        agentId: agent.id,
      });
      
      setNewVendedorName('');
      setShowAddForm(false);
      
      // 4. Já dispara a geração do QR automaticamente
      handleGenerateQR(vendedor);
    } catch (error) {
      console.error('Erro ao criar vendedor:', error);
      alert('Erro ao criar vendedor. Tente novamente.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleGenerateQR = async (vendedor: OnboardingVendedor) => {
    if (!vendedor.channelId) return;
    
    onUpdateVendedor(vendedor.id, { status: 'connecting' });
    
    // Tenta buscar o QR com retry (a sessão pode demorar pra ficar pronta)
    const maxRetries = 5;
    const retryDelay = 2000; // 2 segundos
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`Tentativa ${attempt}/${maxRetries} - Buscando QR para channel:`, vendedor.channelId);
        
        // Primeiro verifica o status da sessão
        const status = await api.getChannelStatus(vendedor.channelId);
        console.log('Status da sessão:', status);
        
        // Se já está conectado, não precisa de QR
        if (status.status === 'WORKING') {
          onUpdateVendedor(vendedor.id, { 
            status: 'connected',
            phone: status.phoneNumber,
          });
          return;
        }
        
        // Tenta buscar o QR
        const qrData = await api.getChannelQRCode(vendedor.channelId);
        console.log('QR Data recebido:', qrData);
        
        if (qrData.qrCode) {
          onUpdateVendedor(vendedor.id, { 
            status: 'pending',
            qrCode: qrData.qrCode.startsWith('data:') 
              ? qrData.qrCode 
              : `data:image/png;base64,${qrData.qrCode}`,
          });
          return; // Sucesso!
        }
      } catch (error) {
        console.log(`Tentativa ${attempt} falhou:`, error);
        
        if (attempt < maxRetries) {
          // Aguarda antes de tentar novamente
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
      }
    }
    
    // Se chegou aqui, todas as tentativas falharam
    console.error('Falha ao gerar QR após todas as tentativas');
    onUpdateVendedor(vendedor.id, { status: 'error' });
  };

  const handleReconnect = async (vendedor: OnboardingVendedor) => {
    if (!vendedor.channelId) return;
    
    onUpdateVendedor(vendedor.id, { status: 'connecting', qrCode: undefined });
    
    try {
      await api.reconnectChannel(vendedor.channelId);
      // Após reconectar, busca novo QR
      await handleGenerateQR(vendedor);
    } catch (error) {
      console.error('Erro ao reconectar:', error);
      onUpdateVendedor(vendedor.id, { status: 'error' });
    }
  };

  const handleRemove = async (vendedor: OnboardingVendedor) => {
    if (!vendedor.channelId) {
      onRemoveVendedor(vendedor.id);
      return;
    }
    
    try {
      await api.deleteChannel(vendedor.channelId);
      onRemoveVendedor(vendedor.id);
    } catch (error) {
      console.error('Erro ao remover canal:', error);
      // Remove do estado local mesmo se falhar no backend
      onRemoveVendedor(vendedor.id);
    }
  };

  // Polling para verificar status dos vendedores aguardando conexão
  const checkStatuses = useCallback(async () => {
    for (const vendedor of vendedores) {
      // Verifica vendedores que estão aguardando conexão (pending com QR ou connecting)
      const shouldCheck = vendedor.channelId && 
        ((vendedor.status === 'pending' && vendedor.qrCode) || vendedor.status === 'connecting');
      
      if (shouldCheck) {
        try {
          const status = await api.getChannelStatus(vendedor.channelId!);
          
          if (status.status === 'WORKING') {
            onUpdateVendedor(vendedor.id, { 
              status: 'connected',
              phone: status.phoneNumber,
              qrCode: undefined,
            });
          } else if (status.status === 'STOPPED') {
            onUpdateVendedor(vendedor.id, { status: 'error' });
          } else if (status.wahaStatus === 'SCAN_QR_CODE') {
            // QR pode ter expirado, busca novo QR
            try {
              const qrData = await api.getChannelQRCode(vendedor.channelId!);
              if (qrData.qrCode) {
                const newQrCode = qrData.qrCode.startsWith('data:') 
                  ? qrData.qrCode 
                  : `data:image/png;base64,${qrData.qrCode}`;
                // Só atualiza se for diferente (evita flicker)
                if (newQrCode !== vendedor.qrCode) {
                  onUpdateVendedor(vendedor.id, { 
                    status: 'pending',
                    qrCode: newQrCode,
                  });
                }
              }
            } catch (qrError) {
              console.log('Erro ao atualizar QR:', qrError);
            }
          }
        } catch (error) {
          console.error('Erro ao verificar status:', error);
        }
      }
    }
  }, [vendedores, onUpdateVendedor]);

  // Polling a cada 3 segundos enquanto houver vendedores aguardando conexão
  useEffect(() => {
    const hasWaitingConnection = vendedores.some(
      v => (v.status === 'pending' && v.qrCode) || v.status === 'connecting'
    );
    
    if (!hasWaitingConnection) return;
    
    const interval = setInterval(checkStatuses, 3000);
    return () => clearInterval(interval);
  }, [vendedores, checkStatuses]);

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Conecte o WhatsApp dos seus vendedores
        </h1>
        <p className="text-gray-600">
          Para começar, conecte as contas de WhatsApp que serão usadas para atendimento. 
          Peça para cada vendedor escanear o código com o celular.
        </p>
      </div>

      {/* Lista de Vendedores */}
      <div className="space-y-4 mb-6">
        {vendedores.map((vendedor, index) => (
          <VendedorCard
            key={vendedor.id}
            vendedor={vendedor}
            index={index + 1}
            onGenerateQR={() => handleGenerateQR(vendedor)}
            onReconnect={() => handleReconnect(vendedor)}
            onRemove={() => handleRemove(vendedor)}
          />
        ))}
      </div>

      {/* Form para adicionar vendedor */}
      {showAddForm ? (
        <div className="border-2 border-dashed border-gray-300 rounded-xl p-6 mb-6">
          <div className="flex gap-3">
            <input
              type="text"
              value={newVendedorName}
              onChange={(e) => setNewVendedorName(e.target.value)}
              placeholder="Nome do vendedor"
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddVendedor();
                if (e.key === 'Escape') {
                  setShowAddForm(false);
                  setNewVendedorName('');
                }
              }}
            />
            <button
              onClick={handleAddVendedor}
              disabled={!newVendedorName.trim()}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              Adicionar
            </button>
            <button
              onClick={() => {
                setShowAddForm(false);
                setNewVendedorName('');
              }}
              className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowAddForm(true)}
          className="w-full border-2 border-dashed border-blue-300 rounded-xl p-4 text-blue-600 hover:bg-blue-50 hover:border-blue-400 transition-colors flex items-center justify-center gap-2 mb-6"
        >
          <Plus className="w-5 h-5" />
          Adicionar Vendedor
        </button>
      )}

      {/* Navegação */}
      <div className={`flex ${onBack ? 'justify-between' : 'justify-end'}`}>
        {onBack && (
          <button
            onClick={onBack}
            className="px-6 py-2 text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            Voltar
          </button>
        )}
        <button
          onClick={onNext}
          disabled={!hasConnectedVendedor}
          className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
        >
          Continuar
        </button>
      </div>

      {!hasConnectedVendedor && vendedores.length > 0 && (
        <p className="text-center text-sm text-amber-600 mt-4">
          Conecte pelo menos um vendedor para continuar
        </p>
      )}
    </div>
  );
}

// --- Componente do Card de Vendedor ---

interface VendedorCardProps {
  vendedor: OnboardingVendedor;
  index: number;
  onGenerateQR: () => void;
  onReconnect: () => void;
  onRemove: () => void;
}

function VendedorCard({ 
  vendedor, 
  index, 
  onGenerateQR, 
  onReconnect, 
  onRemove,
}: VendedorCardProps) {
  const statusConfig = {
    pending: {
      label: 'Aguardando Conexão',
      color: 'text-amber-600',
      dot: 'bg-amber-500',
    },
    connecting: {
      label: 'Conectando...',
      color: 'text-blue-600',
      dot: 'bg-blue-500',
    },
    connected: {
      label: 'Conectado',
      color: 'text-green-600',
      dot: 'bg-green-500',
    },
    error: {
      label: 'Erro na conexão',
      color: 'text-red-600',
      dot: 'bg-red-500',
    },
  };

  const status = statusConfig[vendedor.status];

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4 flex-1">
          <div className="flex flex-col">
            <h3 className="font-semibold text-gray-900">
              Vendedor {index}
            </h3>
            <p className="text-sm text-gray-500">{vendedor.name}</p>
            <div className={`flex items-center gap-1.5 text-sm ${status.color} mt-1`}>
              <span className={`w-2 h-2 rounded-full ${status.dot}`} />
              {status.label}
            </div>
            
            {vendedor.status === 'connected' && vendedor.phone && (
              <p className="text-sm text-gray-600 mt-1">
                +{vendedor.phone}
              </p>
            )}
          </div>
        </div>

        {/* QR Code ou Avatar */}
        {vendedor.qrCode && vendedor.status === 'pending' ? (
          <div className="w-32 h-32 bg-white border border-gray-200 rounded-lg overflow-hidden flex-shrink-0">
            <img 
              src={vendedor.qrCode} 
              alt="QR Code WhatsApp"
              className="w-full h-full object-contain"
            />
          </div>
        ) : (
          <div className="w-12 h-12 bg-gradient-to-br from-purple-400 to-pink-400 rounded-full flex items-center justify-center flex-shrink-0">
            {vendedor.avatarUrl ? (
              <img 
                src={vendedor.avatarUrl} 
                alt={vendedor.name} 
                className="w-full h-full rounded-full object-cover"
              />
            ) : (
              <User className="w-6 h-6 text-white" />
            )}
          </div>
        )}
      </div>

      {/* Ações */}
      <div className="mt-4 flex items-center gap-2">
        {vendedor.status === 'pending' && !vendedor.qrCode && (
          <button
            onClick={onGenerateQR}
            className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600 transition-colors"
          >
            <QrCode className="w-4 h-4" />
            Gerar QR Code
          </button>
        )}

        {vendedor.status === 'pending' && vendedor.qrCode && (
          <p className="text-sm text-gray-500">
            Escaneie o QR Code com o WhatsApp do vendedor
          </p>
        )}

        {vendedor.status === 'connecting' && (
          <div className="flex items-center gap-2 px-4 py-2 bg-blue-100 text-blue-700 text-sm font-medium rounded-lg">
            <Loader2 className="w-4 h-4 animate-spin" />
            Gerando QR Code...
          </div>
        )}

        {vendedor.status === 'connected' && (
          <>
            <button
              onClick={onRemove}
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 transition-colors"
            >
              Remover
            </button>
            <button
              onClick={onReconnect}
              className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600 transition-colors"
            >
              Reconectar
            </button>
          </>
        )}

        {vendedor.status === 'error' && (
          <button
            onClick={onReconnect}
            className="flex items-center gap-2 px-4 py-2 bg-red-100 text-red-700 text-sm font-medium rounded-lg hover:bg-red-200 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Tentar Novamente
          </button>
        )}
      </div>
    </div>
  );
}
