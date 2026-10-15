import { Send, StickyNote } from "lucide-react";
import { useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { Button, Textarea } from "../../../components/ui";
import { cn } from "../../../lib/cn";
import { useAddNote, useSendMessage } from "../hooks";

type Mode = "reply" | "note";

export function Composer({
  conversationId,
  disabled,
}: {
  conversationId: string;
  disabled?: boolean;
}) {
  const [mode, setMode] = useState<Mode>("reply");
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  const send = useSendMessage(conversationId);
  const note = useAddNote(conversationId);
  const mutation = mode === "reply" ? send : note;

  // Auto-crescimento do textarea (até ~8 linhas)
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 192)}px`;
  }, [text]);

  const submit = () => {
    const value = text.trim();
    if (!value || mutation.isPending) return;
    mutation.mutate(value, {
      onSuccess: () => {
        setText("");
        send.reset();
        note.reset();
      },
    });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div
      className={cn(
        "border-t border-line p-3",
        mode === "note" ? "bg-warning-50" : "bg-surface",
      )}
    >
      <div className="mb-2 flex gap-1" role="tablist" aria-label="Tipo de envio">
        {(
          [
            ["reply", "Responder"],
            ["note", "Nota interna"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={mode === id}
            onClick={() => setMode(id)}
            className={cn(
              "rounded-md px-3 py-1 text-xs font-medium transition-colors",
              mode === id
                ? "bg-fg text-white"
                : "text-fg-muted hover:bg-subtle hover:text-fg",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="flex items-end gap-2">
        <Textarea
          ref={ref}
          aria-label={mode === "reply" ? "Mensagem" : "Nota interna"}
          rows={1}
          value={text}
          disabled={disabled}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={
            mode === "reply"
              ? "Digite uma mensagem (Enter envia, Shift+Enter quebra linha)"
              : "Nota visível apenas para a equipe"
          }
          className="max-h-48 min-h-9"
        />
        <Button
          icon={mode === "reply" ? <Send /> : <StickyNote />}
          loading={mutation.isPending}
          disabled={disabled || !text.trim()}
          onClick={submit}
          aria-label={mode === "reply" ? "Enviar" : "Salvar nota"}
        >
          {mode === "reply" ? "Enviar" : "Salvar"}
        </Button>
      </div>
      {mutation.isError && (
        <p role="alert" className="mt-2 flex items-center gap-2 text-xs text-danger-600">
          {mutation.error instanceof Error
            ? mutation.error.message
            : "Não foi possível enviar."}
          <button type="button" onClick={submit} className="font-medium underline">
            Tentar novamente
          </button>
        </p>
      )}
    </div>
  );
}
