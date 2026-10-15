import { Building2, MessageSquare } from "lucide-react";
import { useState } from "react";
import { useParams } from "react-router-dom";
import { PageHeader } from "../../../components/layout/PageHeader";
import {
  EmptyState,
  ErrorState,
  Skeleton,
  Tabs,
} from "../../../components/ui";
import { formatCNPJ } from "../../../lib/format";
import { CreateContactDialog } from "../../contacts/components/CreateContactDialog";
import { CreateOpportunityDialog } from "../../opportunities/components/CreateOpportunityDialog";
import { TimelineView } from "../../timeline/components/TimelineView";
import {
  CompanyContactsTab,
  CompanyOpportunitiesTab,
} from "../components/CompanyTabs";
import {
  CompanySidebar,
  type CompanyDetail,
} from "../components/CompanySidebar";
import { useCompany, useCompanyTimeline } from "../hooks";

type CompanyTab = "timeline" | "contacts" | "opportunities";

function PageSkeleton() {
  return (
    <div className="grid grid-cols-12 gap-6 p-8">
      <Skeleton className="col-span-3 h-96" />
      <Skeleton className="col-span-9 h-96" />
    </div>
  );
}

export function CompanyPage() {
  const { id } = useParams<{ id: string }>();
  const companyQuery = useCompany(id);
  const timelineQuery = useCompanyTimeline(id);
  const [tab, setTab] = useState<CompanyTab>("timeline");
  const [showContactDialog, setShowContactDialog] = useState(false);
  const [showOpportunityDialog, setShowOpportunityDialog] = useState(false);

  if (companyQuery.isPending) return <PageSkeleton />;
  if (companyQuery.isError) {
    return (
      <ErrorState
        error={companyQuery.error}
        onRetry={() => companyQuery.refetch()}
        title="Não foi possível carregar a empresa"
      />
    );
  }

  const company = companyQuery.data as CompanyDetail | null;
  if (!company) {
    return (
      <EmptyState
        icon={Building2}
        title="Empresa não encontrada"
        description="Ela pode ter sido removida ou o link está incorreto."
      />
    );
  }

  return (
    <>
      <PageHeader
        backTo="/companies"
        title={company.alias || company.name}
        description={`CNPJ: ${formatCNPJ(company.taxId)}`}
        leading={
          <span className="flex size-10 items-center justify-center rounded-lg bg-accent-50 text-accent-600">
            <Building2 className="size-5" />
          </span>
        }
      />

      <div className="grid grid-cols-12 gap-6 p-8">
        <aside className="col-span-12 lg:col-span-4 xl:col-span-3">
          <CompanySidebar company={company} />
        </aside>

        <div className="col-span-12 lg:col-span-8 xl:col-span-9">
          <Tabs<CompanyTab>
            idPrefix="company"
            value={tab}
            onChange={setTab}
            className="mb-5"
            tabs={[
              { id: "timeline", label: "Timeline" },
              {
                id: "contacts",
                label: "Contatos",
                count: company.contacts.length,
              },
              {
                id: "opportunities",
                label: "Oportunidades",
                count: company.opportunities.length,
              },
            ]}
          />

          <div role="tabpanel" id={`company-panel-${tab}`}>
            {tab === "timeline" && (
              <>
                <div className="mb-4 flex items-center gap-2">
                  <MessageSquare className="size-4 text-accent-600" />
                  <h2 className="text-base font-semibold text-fg">Timeline</h2>
                  <span className="text-sm text-fg-faint">· Todos os contatos</span>
                </div>
                {timelineQuery.isPending ? (
                  <Skeleton className="h-64" />
                ) : timelineQuery.isError ? (
                  <ErrorState
                    error={timelineQuery.error}
                    onRetry={() => timelineQuery.refetch()}
                    title="Não foi possível carregar a timeline"
                  />
                ) : (
                  <TimelineView events={timelineQuery.data.events} />
                )}
              </>
            )}

            {tab === "contacts" && (
              <CompanyContactsTab
                company={company}
                onNewContact={() => setShowContactDialog(true)}
              />
            )}

            {tab === "opportunities" && (
              <CompanyOpportunitiesTab
                company={company}
                onNewOpportunity={() => setShowOpportunityDialog(true)}
              />
            )}
          </div>
        </div>
      </div>

      <CreateContactDialog
        open={showContactDialog}
        onClose={() => setShowContactDialog(false)}
        companyId={company.id}
      />
      <CreateOpportunityDialog
        open={showOpportunityDialog}
        onClose={() => setShowOpportunityDialog(false)}
        companyId={company.id}
      />
    </>
  );
}
