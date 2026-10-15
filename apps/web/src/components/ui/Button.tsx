import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/cn";
import { Spinner } from "./Spinner";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  /** Ícone (Lucide) exibido antes do texto. */
  icon?: ReactNode;
}

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-accent-600 text-white shadow-xs hover:bg-accent-700 disabled:bg-accent-300",
  secondary:
    "bg-surface text-fg border border-line-strong shadow-xs hover:bg-subtle disabled:text-fg-faint",
  ghost: "text-fg-muted hover:bg-subtle hover:text-fg disabled:text-fg-faint",
  danger:
    "bg-danger-600 text-white shadow-xs hover:bg-danger-700 disabled:opacity-50",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-xs gap-1.5",
  md: "h-9 px-4 text-sm gap-2",
  lg: "h-10 px-5 text-sm gap-2",
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  icon,
  className,
  children,
  disabled,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-md font-medium transition-colors [&_svg]:size-4",
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {loading ? (
        <Spinner size="sm" className="border-white/40 border-t-white" />
      ) : (
        icon
      )}
      {children}
    </button>
  );
}
