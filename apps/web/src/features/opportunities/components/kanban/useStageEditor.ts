import { useState } from "react";
import { useCreateStage, useDeleteStage, useUpdateStage } from "../../hooks";
import {
  DEFAULT_STAGE_COLOR,
  type FeedbackState,
  type KanbanColumn,
  type StageEditorState,
} from "./kanbanUtils";

/** Criação, edição e exclusão de colunas (etapas) do pipeline. */
export function useStageEditor({
  operationId,
  onFeedback,
  onStageDeleted,
}: {
  operationId: string | null;
  onFeedback: (feedback: FeedbackState) => void;
  onStageDeleted?: (stageId: string) => void;
}) {
  const [editor, setEditor] = useState<StageEditorState | null>(null);
  const [savingStageId, setSavingStageId] = useState<string | null>(null);

  const createStage = useCreateStage();
  const updateStage = useUpdateStage();
  const deleteStage = useDeleteStage();

  const openCreate = () => {
    onFeedback(null);
    setEditor({ mode: "create", name: "", color: DEFAULT_STAGE_COLOR });
  };

  const openEdit = (stage: KanbanColumn["stage"]) => {
    onFeedback(null);
    setEditor({
      mode: "edit",
      stageId: stage.id,
      name: stage.name,
      color: stage.color || DEFAULT_STAGE_COLOR,
    });
  };

  const setName = (name: string) =>
    setEditor((cur) => (cur ? { ...cur, name } : cur));
  const setColor = (color: string) =>
    setEditor((cur) => (cur ? { ...cur, color } : cur));
  const cancel = () => setEditor(null);

  const submit = async () => {
    if (!editor || !editor.name.trim()) return;
    onFeedback(null);

    if (editor.mode === "create") {
      if (!operationId) {
        onFeedback({
          type: "error",
          text: "Não foi possível identificar a operação para criar a coluna.",
        });
        return;
      }
      setSavingStageId("create");
      try {
        await createStage.mutateAsync({
          name: editor.name.trim(),
          color: editor.color,
          operationId,
        });
        setEditor(null);
        onFeedback({ type: "success", text: "Nova coluna adicionada ao pipeline." });
      } catch (error) {
        console.error("Erro ao criar estágio:", error);
        onFeedback({ type: "error", text: "Não foi possível criar a nova coluna." });
      } finally {
        setSavingStageId(null);
      }
      return;
    }

    if (!editor.stageId) return;
    setSavingStageId(editor.stageId);
    try {
      await updateStage.mutateAsync({
        id: editor.stageId,
        data: { name: editor.name.trim(), color: editor.color },
      });
      setEditor(null);
      onFeedback({ type: "success", text: "Coluna atualizada com sucesso." });
    } catch (error) {
      console.error("Erro ao atualizar estágio:", error);
      onFeedback({
        type: "error",
        text: "Não foi possível atualizar a coluna selecionada.",
      });
    } finally {
      setSavingStageId(null);
    }
  };

  const remove = async (stage: KanbanColumn["stage"]) => {
    const confirmed = window.confirm(
      `Excluir a coluna "${stage.name}"? Ela precisa estar vazia para ser removida.`,
    );
    if (!confirmed) return;

    onFeedback(null);
    setSavingStageId(stage.id);
    try {
      await deleteStage.mutateAsync(stage.id);
      onStageDeleted?.(stage.id);
      onFeedback({ type: "success", text: "Coluna removida do kanban." });
    } catch (error) {
      console.error("Erro ao excluir estágio:", error);
      onFeedback({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Não foi possível excluir a coluna selecionada.",
      });
    } finally {
      setSavingStageId(null);
    }
  };

  return {
    editor,
    savingStageId,
    isCreating: savingStageId === "create",
    openCreate,
    openEdit,
    setName,
    setColor,
    cancel,
    submit,
    remove,
  };
}
