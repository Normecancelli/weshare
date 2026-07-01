import type { Evento } from "@/lib/types/events";

function formatDateIT(iso: string): string {
  return new Date(iso).toLocaleDateString("it-IT", {
    weekday: "long", day: "numeric", month: "long",
  });
}

function formatTimeIT(iso: string): string {
  return new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
}

export function buildWaLink(telefono: string, nome: string, evento: Evento): string {
  const lines = [
    `Ciao ${nome}! 👋`,
    `Ti ricordo l'evento *${evento.nome}*`,
    `📅 ${formatDateIT(evento.data_inizio)} alle ${formatTimeIT(evento.data_inizio)}`,
  ];
  if (evento.location) lines.push(`📍 ${evento.location}`);
  if (evento.link_evento) lines.push(`🔗 ${evento.link_evento}`);
  lines.push("Ti aspettiamo! 🙌");

  const text = encodeURIComponent(lines.join("\n"));
  const phone = telefono.replace(/\D/g, "");
  const fullPhone = phone.startsWith("39") ? phone : `39${phone}`;
  return `https://wa.me/${fullPhone}?text=${text}`;
}

export function buildBroadcastText(evento: Evento, postiRimasti: number | null): string {
  const lines = [
    `📢 *${evento.nome}*`,
    "",
  ];
  if (evento.descrizione) lines.push(evento.descrizione, "");
  lines.push(`📅 ${formatDateIT(evento.data_inizio)} alle ${formatTimeIT(evento.data_inizio)}`);
  if (evento.location) lines.push(`📍 ${evento.location}`);
  if (postiRimasti !== null && postiRimasti > 0) {
    lines.push(`🎟️ Posti disponibili: ${postiRimasti}`);
  }
  const link = evento.link_prenotazione || evento.link_evento;
  if (link) lines.push(`🔗 ${link}`);
  lines.push(
    "",
    `👉 Iscriviti su WeShare: https://weshare.growset.it/eventi/${evento.id}`,
    "",
    "_WeShare · powered by Me.To.Do for you®_"
  );
  return lines.join("\n");
}
