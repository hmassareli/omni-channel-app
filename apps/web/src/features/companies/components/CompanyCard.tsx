import { Building2 } from "lucide-react";
import { Link } from "react-router-dom";
import { Badge, Card } from "../../../components/ui";
import { formatCNPJ } from "../../../lib/format";
import type { CompanyWithCounts } from "../../../lib/api";

export function CompanyCard({ company }: { company: CompanyWithCounts }) {
  return (
    <Link to={`/companies/${company.id}`} className="block">
      <Card interactive className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent-50 text-accent-600">
              <Building2 className="size-5" />
            </span>
            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold text-fg">
                {company.alias || company.name}
              </h3>
              <p className="truncate text-xs text-fg-muted">{company.name}</p>
            </div>
          </div>
          <Badge tone="success">{company.status || "Ativa"}</Badge>
        </div>

        <div className="mt-4 flex items-center justify-between text-xs text-fg-muted">
          <div className="flex gap-4">
            <span>
              <strong className="font-semibold text-fg">
                {company._count.contacts}
              </strong>{" "}
              contatos
            </span>
            <span>
              <strong className="font-semibold text-fg">
                {company._count.opportunities}
              </strong>{" "}
              oportunidades
            </span>
          </div>
          <span className="font-mono text-fg-faint">
            {formatCNPJ(company.taxId)}
          </span>
        </div>
      </Card>
    </Link>
  );
}
