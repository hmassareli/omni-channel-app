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

/** Hora relativa curta para listas: "agora", "5 min", "14:32", "ontem", "12/10". */
export function formatRelativeTime(dateValue: string | Date): string {
  const date = new Date(dateValue);
  const diffMin = Math.floor((Date.now() - date.getTime()) / 60_000);
  if (diffMin < 1) return "agora";
  if (diffMin < 60) return `${diffMin} min`;
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return formatClock(date);
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "ontem";
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export function formatClock(dateValue: string | Date): string {
  return new Date(dateValue).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Rótulo de dia: "Hoje", "Ontem" ou "12 de outubro de 2026". */
export function formatDayLabel(dateValue: string | Date): string {
  const date = new Date(dateValue);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return "Hoje";
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "Ontem";
  return date.toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** Duração em segundos: "45 s", "2 min 30 s", "1 h 5 min". null -> "—". */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || Number.isNaN(seconds)) return "—";
  const total = Math.round(seconds);
  if (total < 60) return `${total} s`;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return m > 0 ? `${h} h ${m} min` : `${h} h`;
  return s > 0 ? `${m} min ${s} s` : `${m} min`;
}

/** Tempo decorrido por extenso: "há instantes", "há 5 min", "há 3 h", "há 2 dias", "há 4 meses". */
export function formatTimeAgo(dateValue: string | Date): string {
  const diffMin = Math.floor((Date.now() - new Date(dateValue).getTime()) / 60_000);
  if (diffMin < 1) return "há instantes";
  if (diffMin < 60) return `há ${diffMin} min`;
  const hours = Math.floor(diffMin / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return days === 1 ? "há 1 dia" : `há ${days} dias`;
  const months = Math.floor(days / 30);
  if (months < 12) return months === 1 ? "há 1 mês" : `há ${months} meses`;
  const years = Math.floor(days / 365);
  return years <= 1 ? "há 1 ano" : `há ${years} anos`;
}

/** Milissegundos desde a data (para comparar com limites, ex. 24 h). */
export function msSince(dateValue: string | Date): number {
  return Date.now() - new Date(dateValue).getTime();
}
