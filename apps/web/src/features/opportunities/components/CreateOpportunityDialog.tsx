import { Plus } from "lucide-react";
import { useState, type FormEvent } from "react";
import {
  Button,
  Dialog,
  Input,
  Select,
  Textarea,
} from "../../../components/ui";
import { useCompanyOptions } from "../../companies/hooks";
import { useAgents } from "../../operations/hooks";
import { useCreateOpportunity, useStages } from "../hooks";

const FORM_ID = "create-opportunity-form";

interface CreateOpportunityDialogProps {
  open: boolean;
  onClose: () => void;
  /** Quando informado, a empresa fica fixa e o seletor é ocultado. */
  companyId?: string;
}

export function CreateOpportunityDialog({
  open,
  onClose,
  companyId: fixedCompanyId,
}: CreateOpportunityDialogProps) {
  const stagesQuery = useStages();
  const agentsQuery = useAgents();
  const companiesQuery = useCompanyOptions();
  const create = useCreateOpportunity();

  const [companyId, setCompanyId] = useState("");
  const [stageId, setStageId] = useState("");
  const [agentId, setAgentId] = useState("");
  const [estimatedValue, setEstimatedValue] = useState("");
  const [notes, setNotes] = useState("");

  const stages = stagesQuery.data ?? [];
  const agents = agentsQuery.data ?? [];
  const companies = companiesQuery.data ?? [];
  const effectiveStageId = stageId || stages[0]?.id || "";

  const handleClose = () => {
    create.reset();
    onClose();
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    await create.mutateAsync({
      companyId: fixedCompanyId ?? companyId,
      stageId: effectiveStageId,
      agentId: agentId || undefined,
      estimatedValue: estimatedValue ? parseFloat(estimatedValue) : undefined,
      notes: notes || undefined,
    });
    setCompanyId("");
    setAgentId("");
    setEstimatedValue("");
    setNotes("");
    handleClose();
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title="Nova oportunidade"
      description="Adicione um novo card ao pipeline comercial."
      footer={
        <>
          <Button variant="ghost" onClick={handleClose}>
            Cancelar
          </Button>
          <Button
            type="submit"
            form={FORM_ID}
            loading={create.isPending}
            icon={<Plus />}
          >
            {create.isPending ? "Criando..." : "Criar oportunidade"}
          </Button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={handleSubmit} className="space-y-4">
        {create.isError && (
          <p className="rounded-md bg-danger-50 p-3 text-sm text-danger-700">
            {create.error instanceof Error
              ? create.error.message
              : "Erro ao criar oportunidade"}
          </p>
        )}
        {!fixedCompanyId && (
          <Select
            label="Empresa *"
            value={companyId}
            onChange={(e) => setCompanyId(e.target.value)}
            required
          >
            <option value="">Selecione uma empresa</option>
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.alias || company.name}
              </option>
            ))}
          </Select>
        )}
        <Select
          label="Estágio *"
          value={effectiveStageId}
          onChange={(e) => setStageId(e.target.value)}
          required
        >
          {stages.map((stage) => (
            <option key={stage.id} value={stage.id}>
              {stage.name}
            </option>
          ))}
        </Select>
        <Select
          label="Responsável"
          value={agentId}
          onChange={(e) => setAgentId(e.target.value)}
        >
          <option value="">Nenhum</option>
          {agents.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.name}
            </option>
          ))}
        </Select>
        <Input
          label="Valor estimado (R$)"
          type="number"
          step="0.01"
          min="0"
          placeholder="0,00"
          value={estimatedValue}
          onChange={(e) => setEstimatedValue(e.target.value)}
        />
        <Textarea
          label="Observações"
          placeholder="Notas sobre a oportunidade..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </form>
    </Dialog>
  );
}
