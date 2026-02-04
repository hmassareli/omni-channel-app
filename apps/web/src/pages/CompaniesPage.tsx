import {
  Building2,
  Plus,
  Search,
  X,
} from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import * as api from "../lib/api";

// ============================================================================
// Components
// ============================================================================

const CompanyCard = ({ company, onClick }) => (
  <div
    onClick={onClick}
    className="bg-white rounded-lg border border-gray-200 p-4 cursor-pointer hover:border-purple-300 hover:shadow-md transition-all"
  >
    <div className="flex items-start justify-between">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
          <Building2 className="w-5 h-5 text-purple-600" />
        </div>
        <div>
          <h3 className="font-semibold text-gray-800">{company.alias || company.name}</h3>
          <p className="text-sm text-gray-500">{company.name}</p>
        </div>
      </div>
      <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">
        {company.status || "Ativa"}
      </span>
    </div>

    <div className="mt-4 flex items-center justify-between text-sm">
      <div className="flex gap-4">
        <span className="text-gray-500">
          <strong>{company._count.contacts}</strong> contatos
        </span>
        <span className="text-gray-500">
          <strong>{company._count.opportunities}</strong> oportunidades
        </span>
      </div>
      <span className="text-gray-400 font-mono text-xs">
        {company.taxId.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5")}
      </span>
    </div>
  </div>
);

const CreateCompanyModal = ({ isOpen, onClose, onCreated }) => {
  const [cnpj, setCnpj] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const formatCNPJ = (value) => {
    return value
      .replace(/\D/g, "")
      .replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5")
      .slice(0, 18);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await api.createCompany({ cnpj });
      onCreated();
      onClose();
      setCnpj("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao criar empresa");
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
            Nova Empresa (CNPJ)
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
              CNPJ
            </label>
            <input
              type="text"
              value={cnpj}
              onChange={(e) => setCnpj(formatCNPJ(e.target.value))}
              placeholder="00.000.000/0000-00"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none"
              maxLength={18}
              required
            />
            <p className="text-xs text-gray-500 mt-1">
              Os dados serão buscados automaticamente na base de dados
            </p>
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
                  Criar Empresa
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

export function CompaniesPage() {
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [pagination, setPagination] = useState({
    total: 0,
    limit: 50,
    offset: 0,
    hasMore: false,
  });

  const fetchCompanies = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.getCompanies({
        search: search || undefined,
        limit: pagination.limit,
        offset: pagination.offset,
      });
      setCompanies(response.companies);
      setPagination(response.pagination);
    } catch (error) {
      console.error("Erro ao buscar empresas:", error);
    } finally {
      setLoading(false);
    }
  }, [search, pagination.limit, pagination.offset]);

  useEffect(() => {
    fetchCompanies();
  }, [fetchCompanies]);

  const handleSearch = (e) => {
    setSearch(e.target.value);
    setPagination((prev) => ({ ...prev, offset: 0 }));
  };

  const handleCompanyClick = (company) => {
    window.location.href = `/companies/${company.id}`;
  };

  return (
    <div className="flex-1 flex flex-col">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-800">Empresas</h1>
            <p className="text-gray-500 mt-1">
              {pagination.total} empresas cadastradas
            </p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            Nova Empresa (CNPJ)
          </button>
        </div>
      </header>

      <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por nome, CNPJ..."
            value={search}
            onChange={handleSearch}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none"
          />
        </div>
      </div>

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
              <p className="text-gray-500">Carregando empresas...</p>
            </div>
          </div>
        ) : companies.length === 0 ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 mb-4">Nenhuma empresa encontrada</p>
              <button
                onClick={() => setShowModal(true)}
                className="text-purple-600 hover:text-purple-700 font-medium"
              >
                Criar primeira empresa
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {companies.map((company) => (
              <CompanyCard
                key={company.id}
                company={company}
                onClick={() => handleCompanyClick(company)}
              />
            ))}
          </div>
        )}

        {pagination.hasMore && (
          <div className="flex justify-center mt-6">
            <button
              onClick={() =>
                setPagination((prev) => ({
                  ...prev,
                  offset: prev.offset + prev.limit,
                }))
              }
              className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Carregar mais
            </button>
          </div>
        )}
      </main>

      <CreateCompanyModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onCreated={fetchCompanies}
      />
    </div>
  );
}
