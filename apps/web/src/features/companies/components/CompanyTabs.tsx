import { Plus, Target, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { Avatar, Button, Card, EmptyState } from "../../../components/ui";
import { formatCurrency } from "../../../lib/format";
import type { CompanyDetail } from "./CompanySidebar";

function TabHeader({
  title,
  actionLabel,
  onAction,
}: {
  title: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <h2 className="text-base font-semibold text-fg">{title}</h2>
      <Button size="sm" icon={<Plus />} onClick={onAction}>
        {actionLabel}
      </Button>
    </div>
  );
}

export function CompanyContactsTab({
  company,
  onNewContact,
}: {
  company: CompanyDetail;
  onNewContact: () => void;
}) {
  return (
    <>
      <TabHeader
        title="Contatos"
        actionLabel="Novo contato"
        onAction={onNewContact}
      />
      <Card>
        {company.contacts.length === 0 ? (
          <EmptyState
            icon={Users}
            title="Nenhum contato vinculado"
            description="Vincule um chat do WhatsApp ou crie um contato manualmente."
          />
        ) : (
          <ul className="divide-y divide-line">
            {company.contacts.map((contact) => (
              <li key={contact.id} className="flex items-center gap-3 p-4">
                <Avatar name={contact.name} size="md" />
                <div>
                  <p className="text-sm font-medium text-fg">
                    {contact.name || "Sem nome"}
                  </p>
                  <p className="text-xs text-fg-muted">
                    {contact.identities.map((i) => i.value).join(", ")}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

export function CompanyOpportunitiesTab({
  company,
  onNewOpportunity,
}: {
  company: CompanyDetail;
  onNewOpportunity: () => void;
}) {
  return (
    <>
      <TabHeader
        title="Oportunidades"
        actionLabel="Nova oportunidade"
        onAction={onNewOpportunity}
      />
      <Card>
        {company.opportunities.length === 0 ? (
          <EmptyState
            icon={Target}
            title="Nenhuma oportunidade"
            description="Esta empresa ainda não tem oportunidades no pipeline."
          />
        ) : (
          <ul className="divide-y divide-line">
            {company.opportunities.map((opp) => (
              <li key={opp.id}>
                <Link
                  to={`/opportunities/${opp.id}`}
                  className="flex items-center justify-between p-4 transition-colors hover:bg-subtle"
                >
                  <div>
                    <p className="text-sm font-medium text-fg">
                      {opp.stage?.name || "Sem estágio"}
                    </p>
                    <p className="text-xs text-fg-muted">
                      {opp.agent?.name || "Sem atendente"}
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-success-700">
                    {formatCurrency(Number(opp.estimatedValue))}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
