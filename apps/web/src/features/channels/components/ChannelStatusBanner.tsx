import { AlertTriangle } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { cn } from "../../../lib/cn";
import { useMe } from "../../operations/hooks";
import { useChannelList } from "../hooks";
import { isChannelDown } from "../labels";

const CHANNELS_PATH = "/settings/channels";

/** Faixa no topo quando algum WhatsApp está desconectado/falho (atualiza via channel.updated). */
export function ChannelStatusBanner() {
  const channels = useChannelList();
  const me = useMe();
  const location = useLocation();

  const whatsapp = (channels.data ?? []).filter((c) => c.type === "WHATSAPP");
  const down = whatsapp.filter((c) => isChannelDown(c.status));
  if (down.length === 0) return null;

  const allDown = down.length === whatsapp.length;
  const canManage = me.data?.role === "ADMIN" || me.data?.role === "MANAGER";
  const onChannelsPage = location.pathname.startsWith(CHANNELS_PATH);

  const message =
    whatsapp.length === 1
      ? "WhatsApp desconectado — as mensagens não estão chegando."
      : allDown
        ? "Todos os WhatsApps estão desconectados — as mensagens não estão chegando."
        : `${down.length === 1 ? "WhatsApp desconectado" : `${down.length} WhatsApps desconectados`} (${down
            .map((c) => c.name)
            .join(", ")}) — as mensagens ${down.length === 1 ? "dele" : "deles"} não estão chegando.`;

  return (
    <div
      role="alert"
      className={cn(
        "flex shrink-0 items-center justify-center gap-2 border-b px-6 py-2 text-sm",
        allDown
          ? "border-danger-100 bg-danger-50 text-danger-700"
          : "border-warning-100 bg-warning-50 text-warning-700",
      )}
    >
      <AlertTriangle className="size-4 shrink-0" />
      <span className="min-w-0 truncate">{message}</span>
      {!onChannelsPage && (
        <Link
          to={CHANNELS_PATH}
          className="shrink-0 font-semibold underline underline-offset-2 hover:no-underline"
        >
          {canManage ? "Reconectar" : "Ver canais"}
        </Link>
      )}
    </div>
  );
}
