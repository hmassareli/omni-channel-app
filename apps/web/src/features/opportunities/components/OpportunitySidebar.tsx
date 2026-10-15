import { Link } from "react-router-dom";
import { InfoRow, SidebarSection } from "../../../components/layout/SidebarSection";
import { Avatar, Card } from "../../../components/ui";
import type { OpportunityDetail } from "../../../lib/api";
import { formatCNPJ, formatCurrency } from "../../../lib/format";

export function OpportunitySidebar({
  opportunity,
  contacts,
}: {
  opportunity: OpportunityDetail;
  contacts: Array<{ id: string; name: string | null }>;
}) {
  const company = opportunity.company;

  return (
    <Card className="h-fit px-4 py-1">
      <SidebarSection title="Dados da empresa">
        <InfoRow label="Razão social" value={company.name} />
        <InfoRow label="Nome fantasia" value={company.alias} />
        <InfoRow label="CNPJ" value={formatCNPJ(company.taxId)} />
        {company.status && <InfoRow label="Situação" value={company.status} />}
        {company.addressCity && (
          <InfoRow
            label="Localização"
            value={`${company.addressCity} - ${company.addressState}`}
          />
        )}
        <Link
          to={`/companies/${company.id}`}
          className="mt-1 inline-block text-xs font-medium text-accent-600 hover:text-accent-700"
        >
          Ver página da empresa →
        </Link>
      </SidebarSection>

      <SidebarSection title="Oportunidade">
        <InfoRow label="Estágio" value={opportunity.stage?.name} />
        <InfoRow
          label="Valor estimado"
          value={formatCurrency(Number(opportunity.estimatedValue) || null)}
        />
        <InfoRow
          label="Responsável"
          value={opportunity.agent?.name || "Não atribuído"}
        />
        {opportunity.notes && (
          <div className="mt-2">
            <p className="mb-1 text-xs text-fg-muted">Observações</p>
            <p className="rounded-md bg-subtle p-2 text-sm text-fg">
              {opportunity.notes}
            </p>
          </div>
        )}
      </SidebarSection>

      <SidebarSection title={`Contatos (${contacts.length})`}>
        {contacts.length === 0 ? (
          <p className="text-sm text-fg-muted">Nenhum contato vinculado</p>
        ) : (
          contacts.map((contact) => (
            <div key={contact.id} className="flex items-center gap-2 py-1.5">
              <Avatar name={contact.name} />
              <p className="text-sm font-medium text-fg">
                {contact.name || "Sem nome"}
              </p>
            </div>
          ))
        )}
      </SidebarSection>
    </Card>
  );
}
