import {
  Building2,
  LayoutDashboard,
  LogOut,
  Layers,
  MessageSquare,
  RadioTower,
  Target,
  UserCog,
  type LucideIcon,
} from "lucide-react";
import { Suspense, useEffect, useRef, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useSession } from "../../features/auth/authContext";
import { cn } from "../../lib/cn";
import { useDeskEvents } from "../../features/inbox/hooks";
import { ChannelStatusBanner } from "../../features/channels/components/ChannelStatusBanner";
import { Avatar, Spinner } from "../ui";

const NAV_ITEMS: Array<{ to: string; label: string; icon: LucideIcon }> = [
  { to: "/inbox", label: "Inbox", icon: MessageSquare },
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/companies", label: "Empresas", icon: Building2 },
  { to: "/opportunities", label: "Oportunidades", icon: Target },
  { to: "/settings/queues", label: "Filas", icon: Layers },
  { to: "/settings/channels", label: "Canais", icon: RadioTower },
  { to: "/settings/team", label: "Equipe", icon: UserCog },
];

function SideNav() {
  return (
    <nav
      aria-label="Principal"
      className="flex w-20 shrink-0 flex-col items-center gap-1 border-r border-line bg-surface py-4"
    >
      <NavLink
        to="/"
        aria-label="Início"
        className="mb-4 flex size-9 items-center justify-center rounded-lg bg-accent-600 text-xs font-bold text-white shadow-sm"
      >
        CRM
      </NavLink>
      {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            cn(
              "flex w-16 flex-col items-center gap-1 rounded-lg px-1 py-2 text-2xs font-medium transition-colors",
              isActive
                ? "bg-accent-50 text-accent-700"
                : "text-fg-muted hover:bg-subtle hover:text-fg",
            )
          }
        >
          <Icon className="size-5" />
          <span className="max-w-full truncate">{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

function UserMenu() {
  const { user, signOut } = useSession();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const name = user?.name;
  const label = name || user?.email || "Usuário";

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-full py-1 pl-1 pr-3 text-sm transition-colors hover:bg-subtle"
      >
        <Avatar name={name || user?.email} tone="accent" />
        <span className="hidden max-w-40 truncate font-medium text-fg sm:inline">
          {label}
        </span>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-2 w-56 rounded-lg border border-line bg-surface p-1 shadow-md"
        >
          <div className="border-b border-line px-3 py-2">
            <p className="truncate text-sm font-medium text-fg">{label}</p>
            {user?.email && (
              <p className="truncate text-xs text-fg-muted">{user.email}</p>
            )}
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={signOut}
            className="mt-1 flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-fg-muted transition-colors hover:bg-danger-50 hover:text-danger-700"
          >
            <LogOut className="size-4" />
            Sair
          </button>
        </div>
      )}
    </div>
  );
}

/** Layout das páginas autenticadas: navegação lateral, cabeçalho e conteúdo. */
export function AppShell() {
  useDeskEvents();
  return (
    <div className="flex h-screen bg-canvas">
      <SideNav />
      <div className="flex min-w-0 flex-1 flex-col">
        <ChannelStatusBanner />
        <div className="flex h-14 shrink-0 items-center justify-end border-b border-line bg-surface px-6">
          <UserMenu />
        </div>
        <main className="flex min-h-0 flex-1 flex-col overflow-auto">
          <Suspense
            fallback={
              <div className="flex flex-1 items-center justify-center">
                <Spinner />
              </div>
            }
          >
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
}
