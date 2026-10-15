import { Link } from "react-router-dom";
import { InfoRow, SidebarSection } from "../../../components/layout/SidebarSection";
import { Avatar, Badge, Card } from "../../../components/ui";
import type { Company } from "../../../lib/api";
import { formatCurrency } from "../../../lib/format";

// O detalhe da empresa inclui contatos e oportunidades relacionados
export type CompanyDetail = Company & {
  contacts: Array<{
    id: string;
    name: string | null;
    identities: Array<{ type: string; value: string }>;
  }>;
  opportunities: Array<{
    id: string;
    estimatedValue: number | string | null;
    stage?: { name: string } | null;
    agent?: { name: string } | null;
  }>;
};

function formatAddress(company: CompanyDetail): string {
  const parts = [
    company.addressStreet,
    company.addressNumber,
    company.addressDetails,
    company.addressDistrict,
    company.addressCity,
    company.addressState,
    company.addressZip,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : "—";
}

export function CompanySidebar({ company }: { company: CompanyDetail }) {
  const wealthSigns = company.apparentWealthSigns ?? [];

  return (
    <Card className="h-fit px-4 py-1">
      <SidebarSection title="Dados da empresa">
        <InfoRow label="Razão social" value={company.name} />
        <InfoRow label="Status" value={company.status} />
        <InfoRow label="Setor" value={company.sector} />
        <InfoRow label="Porte" value={company.sizeText} />
        <InfoRow label="Endereço" value={formatAddress(company)} />
        <InfoRow label="Cobrança" value={company.billingAddress} />
        <InfoRow label="Entrega" value={company.shippingAddress} />
        <InfoRow label="Faturamento anual" value={company.annualRevenue} />
        <InfoRow
          label="Limite de crédito"
          value={company.creditLimit ? formatCurrency(Number(company.creditLimit)) : null}
        />
        <InfoRow
          label="Funcionários"
          value={company.employeeCount?.toLocaleString("pt-BR")}
        />
        <InfoRow label="Atividade principal" value={company.mainActivityText} />
        <InfoRow label="Cidade" value={company.addressCity} />
        <InfoRow label="Estado" value={company.addressState} />
      </SidebarSection>

      <SidebarSection title="Sinais de riqueza aparente">
        {wealthSigns.length === 0 ? (
          <p className="text-sm text-fg-muted">Nenhum sinal informado</p>
        ) : (
          <div className="flex flex-wrap gap-2 pt-1">
            {wealthSigns.map((sign) => (
              <Badge key={sign} tone="warning">
                {sign}
              </Badge>
            ))}
          </div>
        )}
      </SidebarSection>

      <SidebarSection title="Contatos">
        {company.contacts.length === 0 && (
          <p className="text-sm text-fg-muted">Nenhum contato vinculado</p>
        )}
        {company.contacts.map((contact) => (
          <div key={contact.id} className="flex items-center gap-2 py-1.5">
            <Avatar name={contact.name} />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-fg">
                {contact.name || "Sem nome"}
              </p>
              <p className="text-xs text-fg-muted">
                {contact.identities.find((i) => i.type === "WHATSAPP")?.value ||
                  "Sem telefone"}
              </p>
            </div>
          </div>
        ))}
      </SidebarSection>

      <SidebarSection title="Oportunidades">
        {company.opportunities.length === 0 && (
          <p className="text-sm text-fg-muted">Nenhuma oportunidade</p>
        )}
        {company.opportunities.map((opp) => (
          <Link
            key={opp.id}
            to={`/opportunities/${opp.id}`}
            className="-mx-1 block rounded-md px-1 py-1.5 text-sm transition-colors hover:bg-subtle"
          >
            <div className="flex justify-between gap-2">
              <span className="text-fg-muted">
                {opp.stage?.name || "Sem estágio"}
              </span>
              <span className="font-medium text-fg">
                {formatCurrency(Number(opp.estimatedValue))}
              </span>
            </div>
            {opp.agent && (
              <p className="text-xs text-fg-faint">{opp.agent.name}</p>
            )}
          </Link>
        ))}
      </SidebarSection>
    </Card>
  );
}
