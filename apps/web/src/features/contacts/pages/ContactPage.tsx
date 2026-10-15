import { MessageSquare, Phone, User } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { PageHeader } from "../../../components/layout/PageHeader";
import { InfoRow, SidebarSection } from "../../../components/layout/SidebarSection";
import { Badge, Card, EmptyState, ErrorState, SkeletonList } from "../../../components/ui";
import { formatDateTime } from "../../../lib/format";
import { CHANNEL_LABEL, STATUS_LABEL, STATUS_TONE } from "../../inbox/labels";
import { useContact } from "../hooks";

export default function ContactPage() {
  const { id } = useParams();
  const query = useContact(id);

  if (query.isPending) {
    return (
      <>
        <PageHeader title="Contato" backTo="/companies" />
        <div className="p-8">
          <SkeletonList rows={3} />
        </div>
      </>
    );
  }
  if (query.isError) {
    return (
      <>
        <PageHeader title="Contato" backTo="/companies" />
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      </>
    );
  }

  const c = query.data;
  const phone = c.identities.find((i) => i.type === "WHATSAPP")?.value;
  const email = c.identities.find((i) => i.type === "EMAIL")?.value;

  return (
    <>
      <PageHeader
        backTo={c.company ? `/companies/${c.company.id}` : "/companies"}
        title={c.name || "Contato sem nome"}
        leading={
          <span className="flex size-10 items-center justify-center rounded-full bg-accent-50 text-accent-600">
            <User className="size-5" />
          </span>
        }
        description={
          phone && (
            <span className="inline-flex items-center gap-1.5">
              <Phone className="size-3.5" /> {phone}
            </span>
          )
        }
      />
      <div className="grid grid-cols-12 gap-6 p-8">
        <aside className="col-span-12 lg:col-span-4 xl:col-span-3">
          <Card className="h-fit px-4 py-1">
            <SidebarSection title="Dados do contato">
              <InfoRow label="Nome" value={c.name} />
              <InfoRow label="Telefone" value={phone} />
              <InfoRow label="E-mail" value={email} />
              <InfoRow label="Cargo" value={c.role} />
              <InfoRow
                label="Empresa"
                value={
                  c.company && (
                    <Link to={`/companies/${c.company.id}`} className="text-accent-600 hover:underline">
                      {c.company.name}
                    </Link>
                  )
                }
              />
              <InfoRow label="Criado em" value={formatDateTime(c.createdAt)} />
            </SidebarSection>
            <SidebarSection title="Tags">
              {c.tags.length === 0 ? (
                <p className="text-sm text-fg-muted">Sem tags</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {c.tags.map((t) => (
                    <Badge key={t.tag.id}>{t.tag.name}</Badge>
                  ))}
                </div>
              )}
            </SidebarSection>
          </Card>
        </aside>

        <section className="col-span-12 lg:col-span-8 xl:col-span-9">
          <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-fg">
            <MessageSquare className="size-4 text-accent-600" /> Conversas
          </h2>
          {c.conversations.length === 0 ? (
            <EmptyState icon={MessageSquare} title="Nenhuma conversa" />
          ) : (
            <Card className="divide-y divide-line">
              {c.conversations.map((conv) => (
                <Link
                  key={conv.id}
                  to={`/inbox?conversation=${conv.id}`}
                  className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-subtle"
                >
                  <div>
                    <p className="text-sm font-medium text-fg">
                      {CHANNEL_LABEL[conv.channel.type]} · {conv.channel.name}
                    </p>
                    <p className="text-xs text-fg-muted">
                      {conv._count.messages} mensagens · última em {formatDateTime(conv.lastMessageAt)}
                    </p>
                  </div>
                  <Badge tone={STATUS_TONE[conv.status]}>{STATUS_LABEL[conv.status]}</Badge>
                </Link>
              ))}
            </Card>
          )}
        </section>
      </div>
    </>
  );
}
