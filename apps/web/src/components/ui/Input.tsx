import { useId, type InputHTMLAttributes, type ReactNode } from "react";
import { cn } from "../../lib/cn";
import { controlClass } from "./controlClass";
import { Field } from "./Field";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
  /** Ícone à esquerda (ex.: busca). */
  icon?: ReactNode;
}

export function Input({
  label,
  hint,
  error,
  icon,
  id,
  className,
  ...rest
}: InputProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <Field label={label} hint={hint} error={error} htmlFor={inputId}>
      <div className="relative">
        {icon && (
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-fg-faint [&_svg]:size-4">
            {icon}
          </span>
        )}
        <input
          id={inputId}
          aria-invalid={!!error}
          className={cn(
            controlClass,
            "h-9",
            icon && "pl-9",
            error && "border-danger-600",
            className,
          )}
          {...rest}
        />
      </div>
    </Field>
  );
}
