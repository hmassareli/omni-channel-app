export function formatPhone(waId: string): string {
  const match = waId.match(/^(\d{2})(\d{2})(\d{5})(\d{4})$/);
  return match ? `+${match[1]} (${match[2]}) ${match[3]}-${match[4]}` : waId;
}

/** Horário curto de uma conversa: hora, "Ontem", dia da semana ou dd/mm. */
export function formatChatTime(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  const diffDays = Math.floor(
    (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24),
  );

  if (diffDays === 0) {
    return date.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  if (diffDays === 1) return "Ontem";
  if (diffDays < 7) return date.toLocaleDateString("pt-BR", { weekday: "short" });
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}
