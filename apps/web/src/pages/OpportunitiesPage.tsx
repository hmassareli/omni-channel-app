import { MoreHorizontal, Plus, User, X } from "lucide-react";
import { useEffect, useState } from "react";
import * as api from "../lib/api";

// ============================================================================
// Components
// ============================================================================

const OpportunityCardComponent = ({ opportunity, onClick }) => (
  <div
    onClick={onClick}
    className="bg-white rounded-lg border border-gray-200 p-4 cursor-pointer hover:border-purple-300 hover:shadow-md transition-all"
  >
    <div className="flex items-start justify-between mb-2">
      <h4 className="font-medium text-gray-800">
        {opportunity.company.alias || opportunity.company.name}
      </h4>
      <button
        onClick={(e) => e.stopPropagation()}
        className="text-gray-400 hover:text-gray-600"
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>
    </div>

    <p className="text-sm text-gray-500 mb-3">
      {opportunity.company.taxId.replace(
        /(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/,
        "$1.$2.$3/$4-$5",
      )}
    </p>

    {opportunity.estimatedValue && (
      <p className="text-sm font-semibold text-green-600 mb-3">
        {new Intl.NumberFormat("pt-BR", {
          style: "currency",
          currency: "BRL",
        }).format(opportunity.estimatedValue)}
      </p>
    )}

    {opportunity.agent && (
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 bg-purple-100 rounded-full flex items-center justify-center">
          <User className="w-3 h-3 text-purple-600" />
        </div>
        <span className="text-xs text-gray-600">{opportunity.agent.name}</span>
      </div>
    )}

    {opportunity.notes && (
      <p className="text-xs text-gray-400 mt-2 truncate">{opportunity.notes}</p>
    )}
  </div>
);

const CreateOpportunityModal = ({
  isOpen,
  onClose,
  onCreated,
  companies,
  stages,
}) => {
  const [companyId, setCompanyId] = useState("");
  const [stageId, setStageId] = useState("");
  const [estimatedValue, setEstimatedValue] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (stages.length > 0 && !stageId) {
      setStageId(stages[0].id);
    }
  }, [stages, stageId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await api.createOpportunity({
        companyId,
        stageId,
        estimatedValue: estimatedValue ? parseFloat(estimatedValue) : undefined,
        notes: notes || undefined,
      });
      onCreated();
      onClose();
      setCompanyId("");
      setEstimatedValue("");
      setNotes("");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Erro ao criar oportunidade",
      );
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl w-full max-w-md mx-4 shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold text-gray-800">
            Nova Oportunidade
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          {error && (
            <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg mb-4">
              {error}
            </div>
          )}

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Empresa *
            </label>
            <select
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none"
              required
            >
              <option value="">Selecione uma empresa</option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.alias || company.name}
                </option>
              ))}
            </select>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Estágio *
            </label>
            <select
              value={stageId}
              onChange={(e) => setStageId(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none"
              required
            >
              {stages.map((stage) => (
                <option key={stage.id} value={stage.id}>
                  {stage.name}
                </option>
              ))}
            </select>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Valor Estimado (R$)
            </label>
            <input
              type="number"
              value={estimatedValue}
              onChange={(e) => setEstimatedValue(e.target.value)}
              placeholder="0,00"
              step="0.01"
              min="0"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none"
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Observações
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notas sobre a oportunidade..."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none resize-none"
              rows={3}
            />
          </div>

          <div className="flex gap-3 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {loading ? (
                <>
                  <svg
                    className="animate-spin h-4 w-4"
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
                  Criando...
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  Criar Oportunidade
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ============================================================================
// Main Component
// ============================================================================

export function OpportunitiesPage() {
  const [kanbanData, setKanbanData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [companies, setCompanies] = useState([]);
  const [stages, setStages] = useState([]);
  const [filterStage, setFilterStage] = useState("");

  const fetchData = async () => {
    setLoading(true);
    try {
      const [kanbanResponse, companiesResponse, stagesResponse] =
        await Promise.all([
          api.getOpportunitiesKanban(),
          api.getCompanies({ limit: 1000 }),
          api.getStages(),
        ]);
      setKanbanData(kanbanResponse.columns);
      setCompanies(companiesResponse.companies);
      setStages(stagesResponse);
    } catch (error) {
      console.error("Erro ao buscar dados:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleOpportunityClick = (opportunity) => {
    window.location.href = `/company/${opportunity.company.id}`;
  };

  const handleDragStart = (e, opportunityId, fromStageId) => {
    e.dataTransfer.setData("opportunityId", opportunityId);
    e.dataTransfer.setData("fromStageId", fromStageId);
  };

  const handleDrop = async (e, toStageId) => {
    e.preventDefault();
    const opportunityId = e.dataTransfer.getData("opportunityId");
    const fromStageId = e.dataTransfer.getData("fromStageId");

    if (opportunityId && toStageId && fromStageId !== toStageId) {
      try {
        await api.updateOpportunity(opportunityId, { stageId: toStageId });
        fetchData();
      } catch (error) {
        console.error("Erro ao mover oportunidade:", error);
      }
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const filteredKanban = filterStage
    ? kanbanData.filter((k) => k.stage.id === filterStage)
    : kanbanData;

  return (
    <div className="flex-1 flex flex-col">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-800">
              Oportunidades
            </h1>
            <p className="text-gray-500 mt-1">
              {kanbanData.reduce((acc, k) => acc + k.count, 0)} oportunidades em{" "}
              {kanbanData.length} estágios
            </p>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={filterStage}
              onChange={(e) => setFilterStage(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none"
            >
              <option value="">Todos os estágios</option>
              {stages.map((stage) => (
                <option key={stage.id} value={stage.id}>
                  {stage.name}
                </option>
              ))}
            </select>
            <button
              onClick={() => setShowModal(true)}
              className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-2"
            >
              <Plus className="w-5 h-5" />
              Nova Oportunidade
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 p-6 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <svg
                className="animate-spin h-8 w-8 text-purple-600 mx-auto mb-4"
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
              <p className="text-gray-500">Carregando oportunidades...</p>
            </div>
          </div>
        ) : filteredKanban.length === 0 ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <p className="text-gray-500 mb-4">
                Nenhuma oportunidade encontrada
              </p>
              <button
                onClick={() => setShowModal(true)}
                className="text-purple-600 hover:text-purple-700 font-medium"
              >
                Criar primeira oportunidade
              </button>
            </div>
          </div>
        ) : (
          <div className="flex gap-4 overflow-x-auto pb-4">
            {filteredKanban.map((kanbanStage) => (
              <div
                key={kanbanStage.stage.id}
                className="flex-shrink-0 w-80"
                onDrop={(e) => handleDrop(e, kanbanStage.stage.id)}
                onDragOver={handleDragOver}
              >
                <div
                  className="rounded-t-lg px-4 py-3 mb-2"
                  style={{
                    backgroundColor: kanbanStage.stage.color || "#8b5cf6",
                  }}
                >
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-white">
                      {kanbanStage.stage.name}
                    </h3>
                    <span className="text-white/80 text-sm">
                      {kanbanStage.count}
                    </span>
                  </div>
                </div>

                <div className="bg-gray-100 rounded-b-lg p-2 min-h-[400px] max-h-[calc(100vh-250px)] overflow-y-auto">
                  {kanbanStage.opportunities.map((opportunity) => (
                    <div
                      key={opportunity.id}
                      draggable
                      onDragStart={(e) =>
                        handleDragStart(e, opportunity.id, kanbanStage.stage.id)
                      }
                      className="mb-2"
                    >
                      <OpportunityCardComponent
                        opportunity={opportunity}
                        onClick={() => handleOpportunityClick(opportunity)}
                      />
                    </div>
                  ))}

                  {kanbanStage.opportunities.length === 0 && (
                    <div className="text-center py-8 text-gray-400 text-sm">
                      Nenhuma oportunidade
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      <CreateOpportunityModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onCreated={fetchData}
        companies={companies}
        stages={stages}
      />
    </div>
  );
}
