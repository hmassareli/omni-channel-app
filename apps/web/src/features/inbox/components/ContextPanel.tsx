import { Star } from "lucide-react";
import { Link } from "react-router-dom";
import { InfoRow, SidebarSection } from "../../../components/layout/SidebarSection";
import { Badge, Skeleton } from "../../../components/ui";
import type { ConversationDetail } from "../../../lib/api";
import { formatCNPJ, formatCurrency } from "../../../lib/format";
import type { CompanyDetail } from "../../companies/components/CompanySidebar";
import { useCompany } from "../../companies/hooks";
import { useContact } from "../../contacts/hooks";

export function ContextPanel({ conversation }: { conversation: ConversationDetail }) {
  const contact = useContact(conversation.contact.id);
  const companyId = conversation.contact.company?.id;
  const company = useCompany(companyId);
  const opportunities = (company.data as CompanyDetail | undefined)?.opportunities ?? [];

  const c = contact.data;
  const phone = c?.identities.find((i) => i.type === "WHATSAPP")?.value;
  const email = c?.identities.find((i) => i.type === "EMAIL")?.value;

  return (
    <div className="h-full overflow-y-auto bg-surface px-4 py-2">
      <SidebarSection title="Contato">
        {contact.isPending ? (
          <Skeleton className="h-16 w-full" />
        ) : (
          <>
            <InfoRow label="Nome" value={c?.name ?? conversation.contact.name} />
            <InfoRow label="Telefone" value={phone} />
            <InfoRow label="E-mail" value={email} />
            <InfoRow label="Cargo" value={c?.role} />
            <Link
              to={`/contacts/${conversation.contact.id}`}
              className="mt-1 inline-block text-xs font-medium text-accent-600 hover:underline"
            >
              Ver contato
            </Link>
          </>
        )}
      </SidebarSection>

      <SidebarSection title="Empresa">
        {!companyId ? (
          <p className="text-sm text-fg-muted">Contato sem empresa vinculada</p>
        ) : company.isPending ? (
          <Skeleton className="h-16 w-full" />
        ) : (
          <>
            <InfoRow label="Nome" value={company.data?.name} />
            <InfoRow label="CNPJ" value={formatCNPJ(company.data?.taxId)} />
            <InfoRow label="Setor" value={company.data?.sector} />
            <Link
              to={`/companies/${companyId}`}
              className="mt-1 inline-block text-xs font-medium text-accent-600 hover:underline"
            >
              Abrir empresa
            </Link>
          </>
        )}
      </SidebarSection>

      <SidebarSection title="Tags">
        {c && c.tags.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {c.tags.map((t) => (
              <Badge key={t.tag.id}>{t.tag.name}</Badge>
            ))}
          </div>
        ) : (
          <p className="text-sm text-fg-muted">Sem tags</p>
        )}
      </SidebarSection>

      <SidebarSection title="Oportunidades">
        {opportunities.length === 0 ? (
          <p className="text-sm text-fg-muted">Nenhuma oportunidade</p>
        ) : (
          opportunities.map((o) => (
            <Link
              key={o.id}
              to={`/opportunities/${o.id}`}
              className="-mx-1 flex justify-between gap-2 rounded-md px-1 py-1.5 text-sm hover:bg-subtle"
            >
              <span className="text-fg-muted">{o.stage?.name ?? "Sem estágio"}</span>
              <span className="font-medium text-fg">
                {formatCurrency(Number(o.estimatedValue))}
              </span>
            </Link>
          ))
        )}
      </SidebarSection>

      <SidebarSection title="Resumo da conversa (IA)">
        {conversation.summary ? (
          <p className="whitespace-pre-wrap rounded-md bg-accent-50 p-2 text-sm text-fg">
            {conversation.summary}
          </p>
        ) : (
          <p className="text-sm text-fg-muted">Ainda sem resumo.</p>
        )}
      </SidebarSection>

      {conversation.csat && (
        <SidebarSection title="Satisfação (CSAT)">
          <p className="flex items-center gap-1 text-sm font-medium text-fg">
            <Star className="size-4 text-warning-600" />
            {conversation.csat.score} / 5
          </p>
          {conversation.csat.comment && (
            <p className="mt-1 text-sm text-fg-muted">{conversation.csat.comment}</p>
          )}
        </SidebarSection>
      )}
    </div>
  );
}
