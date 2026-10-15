import { Check, X } from "lucide-react";
import { Button, Card, Input } from "../../../../components/ui";
import { cn } from "../../../../lib/cn";
import { STAGE_COLOR_PRESETS } from "./kanbanUtils";

interface StageEditorProps {
  title: string;
  subtitle: string;
  name: string;
  color: string;
  loading: boolean;
  submitLabel: string;
  onNameChange: (value: string) => void;
  onColorChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}

export function StageEditor({
  title,
  subtitle,
  name,
  color,
  loading,
  submitLabel,
  onNameChange,
  onColorChange,
  onSubmit,
  onCancel,
}: StageEditorProps) {
  return (
    <Card className="p-4">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-fg">{title}</p>
          <p className="mt-1 text-xs text-fg-muted">{subtitle}</p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md p-1 text-fg-faint transition-colors hover:bg-subtle hover:text-fg"
          aria-label="Cancelar edição da coluna"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="space-y-4">
        <Input
          label="Nome da coluna"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="Ex.: Negociação"
        />

        <div>
          <span className="mb-2 block text-xs font-medium text-fg">Cor</span>
          <div className="mb-3 flex flex-wrap gap-2">
            {STAGE_COLOR_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => onColorChange(preset)}
                className={cn(
                  "size-7 rounded-full ring-offset-2 transition",
                  preset.toLowerCase() === color.toLowerCase()
                    ? "ring-2 ring-accent-600"
                    : "ring-1 ring-line hover:scale-105",
                )}
                style={{ backgroundColor: preset }}
                aria-label={`Selecionar cor ${preset}`}
              />
            ))}
          </div>
          <input
            type="color"
            value={color}
            onChange={(e) => onColorChange(e.target.value)}
            aria-label="Cor personalizada"
            className="h-9 w-full cursor-pointer rounded-md border border-line-strong bg-surface p-1"
          />
        </div>
      </div>

      <div className="mt-4 flex items-center justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancelar
        </Button>
        <Button
          size="sm"
          onClick={onSubmit}
          disabled={!name.trim()}
          loading={loading}
          icon={<Check />}
        >
          {loading ? "Salvando..." : submitLabel}
        </Button>
      </div>
    </Card>
  );
}
