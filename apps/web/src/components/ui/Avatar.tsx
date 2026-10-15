import { cn } from "../../lib/cn";
import { getInitials } from "../../lib/format";

export interface AvatarProps {
  name?: string | null;
  src?: string | null;
  size?: "xs" | "sm" | "md" | "lg";
  /** "accent" para usuário/atendente, "neutral" para clientes. */
  tone?: "neutral" | "accent";
  className?: string;
}

const sizes = {
  xs: "size-6 text-2xs",
  sm: "size-8 text-xs",
  md: "size-10 text-sm",
  lg: "size-12 text-base",
};

export function Avatar({
  name,
  src,
  size = "sm",
  tone = "neutral",
  className,
}: AvatarProps) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-medium",
        tone === "accent"
          ? "bg-accent-100 text-accent-700"
          : "bg-subtle text-fg-muted",
        sizes[size],
        className,
      )}
      title={name ?? undefined}
    >
      {src ? (
        <img src={src} alt={name ?? ""} className="size-full object-cover" />
      ) : (
        getInitials(name)
      )}
    </span>
  );
}
