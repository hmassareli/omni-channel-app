// Formatadores compartilhados (pt-BR)

export function formatCurrency(
  value: number | string | null | undefined,
  options?: { maximumFractionDigits?: number },
): string {
  const n = Number(value);
  if (!value || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    ...options,
  }).format(n);
}

export function formatCNPJ(cnpj: string | null | undefined): string {
  if (!cnpj) return "—";
  return cnpj.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
}

/** "Hoje às 10:30", "Ontem às 10:30" ou data completa. */
export function formatDateTime(dateValue: string | Date): string {
  const date = new Date(dateValue);
  const diffHours = (Date.now() - date.getTime()) / (1000 * 60 * 60);
  const time = date.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
  if (diffHours < 24) return `Hoje às ${time}`;
  if (diffHours < 48) return `Ontem às ${time}`;
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function getInitials(name?: string | null, fallback = "?"): string {
  if (!name) return fallback;
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return fallback;
  return parts
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}
