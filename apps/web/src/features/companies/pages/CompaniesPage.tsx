import { Building2, Plus, Search } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "../../../components/layout/PageHeader";
import {
  Button,
  EmptyState,
  ErrorState,
  Input,
  Skeleton,
} from "../../../components/ui";
import { CompanyCard } from "../components/CompanyCard";
import { CreateCompanyDialog } from "../components/CreateCompanyDialog";
import { useInfiniteCompanies } from "../hooks";

export function CompaniesPage() {
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const query = useInfiniteCompanies(search);

  const companies = query.data?.pages.flatMap((page) => page.companies) ?? [];
  const total = query.data?.pages[0]?.pagination.total ?? 0;

  return (
    <>
      <PageHeader
        title="Empresas"
        description={query.data ? `${total} empresas cadastradas` : undefined}
        actions={
          <Button icon={<Plus />} onClick={() => setShowCreate(true)}>
            Nova empresa
          </Button>
        }
      />

      <div className="border-b border-line bg-surface px-8 py-3">
        <div className="max-w-md">
          <Input
            icon={<Search />}
            type="search"
            placeholder="Buscar por nome ou CNPJ..."
            aria-label="Buscar empresas"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="flex-1 p-8">
        {query.isPending ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-28" />
            ))}
          </div>
        ) : query.isError ? (
          <ErrorState
            error={query.error}
            onRetry={() => query.refetch()}
            title="Não foi possível carregar as empresas"
          />
        ) : companies.length === 0 ? (
          <EmptyState
            icon={Building2}
            title="Nenhuma empresa encontrada"
            description={
              search
                ? "Tente buscar por outro nome ou CNPJ."
                : "Cadastre a primeira empresa pelo CNPJ."
            }
            action={
              !search && (
                <Button icon={<Plus />} onClick={() => setShowCreate(true)}>
                  Criar primeira empresa
                </Button>
              )
            }
          />
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {companies.map((company) => (
                <CompanyCard key={company.id} company={company} />
              ))}
            </div>
            {query.hasNextPage && (
              <div className="mt-6 flex justify-center">
                <Button
                  variant="secondary"
                  loading={query.isFetchingNextPage}
                  onClick={() => query.fetchNextPage()}
                >
                  Carregar mais
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      <CreateCompanyDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
      />
    </>
  );
}
