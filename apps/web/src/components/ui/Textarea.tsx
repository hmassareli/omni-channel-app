import { useId, type Ref, type TextareaHTMLAttributes } from "react";
import { cn } from "../../lib/cn";
import { controlClass } from "./controlClass";
import { Field } from "./Field";

export interface TextareaProps
  extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
  error?: string;
  ref?: Ref<HTMLTextAreaElement>;
}

export function Textarea({
  label,
  hint,
  error,
  id,
  className,
  rows = 3,
  ref,
  ...rest
}: TextareaProps) {
  const autoId = useId();
  const textId = id ?? autoId;
  return (
    <Field label={label} hint={hint} error={error} htmlFor={textId}>
      <textarea
        ref={ref}
        id={textId}
        rows={rows}
        aria-invalid={!!error}
        className={cn(
          controlClass,
          "resize-none py-2",
          error && "border-danger-600",
          className,
        )}
        {...rest}
      />
    </Field>
  );
}
