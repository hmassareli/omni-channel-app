import { LayoutDashboard, MessageSquare, type LucideIcon } from "lucide-react";
import { PageHeader } from "../../../components/layout/PageHeader";
import { EmptyState } from "../../../components/ui";

function ComingSoon({
  title,
  icon,
}: {
  title: string;
  icon: LucideIcon;
}) {
  return (
    <>
      <PageHeader title={title} />
      <EmptyState
        icon={icon}
        title="Em breve"
        description="Esta área está em construção e estará disponível nas próximas versões."
        className="flex-1"
      />
    </>
  );
}

export function InboxPage() {
  return <ComingSoon title="Inbox" icon={MessageSquare} />;
}

export function DashboardPage() {
  return <ComingSoon title="Dashboard" icon={LayoutDashboard} />;
}
