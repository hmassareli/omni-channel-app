import { Plus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button, Dialog, Input, Textarea } from "../../../components/ui";
import { useCreateCompany } from "../hooks";

const FORM_ID = "create-company-form";

function formatCNPJInput(value: string) {
  return value
    .replace(/\D/g, "")
    .replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5")
    .slice(0, 18);
}

const EMPTY = {
  cnpj: "",
  sector: "",
  annualRevenue: "",
  employeeCount: "",
  creditLimit: "",
  billingAddress: "",
  shippingAddress: "",
  apparentWealthSigns: "",
};

export function CreateCompanyDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [form, setForm] = useState(EMPTY);
  const create = useCreateCompany();

  const set = (field: keyof typeof EMPTY) => (value: string) =>
    setForm((cur) => ({ ...cur, [field]: value }));

  const handleClose = () => {
    create.reset();
    onClose();
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    await create.mutateAsync({
      cnpj: form.cnpj,
      sector: form.sector || undefined,
      annualRevenue: form.annualRevenue || undefined,
      employeeCount: form.employeeCount ? Number(form.employeeCount) : undefined,
      creditLimit: form.creditLimit ? Number(form.creditLimit) : undefined,
      billingAddress: form.billingAddress || undefined,
      shippingAddress: form.shippingAddress || undefined,
      apparentWealthSigns: form.apparentWealthSigns
        .split(/\r?\n|,/)
        .map((value) => value.trim())
        .filter(Boolean),
    });
    setForm(EMPTY);
    handleClose();
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title="Nova empresa"
      description="Os dados cadastrais serão buscados automaticamente pelo CNPJ."
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
            {create.isPending ? "Criando..." : "Criar empresa"}
          </Button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={handleSubmit} className="space-y-4">
        {create.isError && (
          <p className="rounded-md bg-danger-50 p-3 text-sm text-danger-700">
            {create.error instanceof Error
              ? create.error.message
              : "Erro ao criar empresa"}
          </p>
        )}
        <Input
          label="CNPJ"
          value={form.cnpj}
          onChange={(e) => set("cnpj")(formatCNPJInput(e.target.value))}
          placeholder="00.000.000/0000-00"
          maxLength={18}
          required
        />
        <Input
          label="Setor"
          value={form.sector}
          onChange={(e) => set("sector")(e.target.value)}
          placeholder="Ex.: Serviços jurídicos"
        />
        <Input
          label="Faturamento anual"
          value={form.annualRevenue}
          onChange={(e) => set("annualRevenue")(e.target.value)}
          placeholder="Ex.: R$ 5M - R$ 10M"
        />
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Funcionários"
            type="number"
            min="1"
            value={form.employeeCount}
            onChange={(e) => set("employeeCount")(e.target.value)}
            placeholder="Ex.: 120"
          />
          <Input
            label="Limite de crédito"
            type="number"
            min="0"
            step="0.01"
            value={form.creditLimit}
            onChange={(e) => set("creditLimit")(e.target.value)}
            placeholder="Ex.: 50000"
          />
        </div>
        <Textarea
          label="Endereço de cobrança"
          value={form.billingAddress}
          onChange={(e) => set("billingAddress")(e.target.value)}
          placeholder="Ex.: Av. Paulista, 1000, Bela Vista, São Paulo - SP"
        />
        <Textarea
          label="Endereço de entrega"
          value={form.shippingAddress}
          onChange={(e) => set("shippingAddress")(e.target.value)}
          placeholder="Ex.: Centro de distribuição ou filial de recebimento"
        />
        <Textarea
          label="Sinais de riqueza aparente"
          value={form.apparentWealthSigns}
          onChange={(e) => set("apparentWealthSigns")(e.target.value)}
          placeholder="Um por linha ou separados por vírgula"
        />
      </form>
    </Dialog>
  );
}
