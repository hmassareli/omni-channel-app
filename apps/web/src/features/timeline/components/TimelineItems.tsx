import { CheckCircle } from "lucide-react";
import { Avatar } from "../../../components/ui";
import { cn } from "../../../lib/cn";
import { formatDateTime } from "../../../lib/format";
import type { SystemEventKind } from "../groupEvents";

export function TimelineMessage({
  sender,
  time,
  message,
  isInbound,
  channelName,
}: {
  sender: string;
  time: string | Date;
  message: string;
  isInbound: boolean;
  channelName?: string;
}) {
  return (
    <div className={cn("mb-4 flex gap-3", !isInbound && "flex-row-reverse")}>
      <Avatar name={sender} tone={isInbound ? "neutral" : "accent"} />
      <div className={cn("max-w-[70%]", !isInbound && "text-right")}>
        <div
          className={cn(
            "inline-block rounded-lg px-3 py-2 text-left",
            isInbound
              ? "border border-line bg-surface text-fg"
              : "bg-accent-600 text-white",
          )}
        >
          <p className="whitespace-pre-wrap text-sm">{message}</p>
        </div>
        <div
          className={cn(
            "mt-1 flex items-center gap-1.5 text-xs text-fg-faint",
            !isInbound && "justify-end",
          )}
        >
          <span>{formatDateTime(time)}</span>
          <span>· {sender}</span>
          {channelName && <span>· {channelName}</span>}
        </div>
      </div>
    </div>
  );
}

const eventTone: Record<SystemEventKind, string> = {
  create: "bg-success-50 text-success-600",
  stage_change: "bg-accent-50 text-accent-600",
  system: "bg-subtle text-fg-muted",
};

export function TimelineSystemEvent({
  time,
  title,
  kind,
}: {
  time: string | Date;
  title: string;
  kind: SystemEventKind;
}) {
  return (
    <div className="mb-3 flex items-center gap-3 py-1">
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-full",
          eventTone[kind],
        )}
      >
        <CheckCircle className="size-4" />
      </span>
      <div className="flex flex-1 items-center justify-between gap-3">
        <span className="text-sm text-fg-muted">{title}</span>
        <span className="shrink-0 text-xs text-fg-faint">
          {formatDateTime(time)}
        </span>
      </div>
    </div>
  );
}
