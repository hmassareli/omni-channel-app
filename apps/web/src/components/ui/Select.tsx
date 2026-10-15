import { useId, type SelectHTMLAttributes } from "react";
import { cn } from "../../lib/cn";
import { controlClass } from "./controlClass";
import { Field } from "./Field";

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hint?: string;
  error?: string;
}

/** Select nativo estilizado. Passe <option> como children. */
export function Select({
  label,
  hint,
  error,
  id,
  className,
  children,
  ...rest
}: SelectProps) {
  const autoId = useId();
  const selectId = id ?? autoId;
  return (
    <Field label={label} hint={hint} error={error} htmlFor={selectId}>
      <select
        id={selectId}
        aria-invalid={!!error}
        className={cn(
          controlClass,
          "h-9",
          error && "border-danger-600",
          className,
        )}
        {...rest}
      >
        {children}
      </select>
    </Field>
  );
}
