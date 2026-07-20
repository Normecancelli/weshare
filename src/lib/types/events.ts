export type EventModalita = "presenza" | "online" | "hybrid";
export type EventVisibilita = "globale" | "gruppo";
export type RsvpStato = "confermato" | "forse" | "annullato";

export interface Evento {
  id: string;
  nome: string;
  descrizione: string | null;
  data_inizio: string;
  data_fine: string | null;
  location: string | null;
  location_url: string | null;
  modalita: EventModalita | null;
  capienza_max: number | null;
  prezzo: number | null;
  link_prenotazione: string | null;
  link_evento: string | null;
  locandina_url: string | null;
  testo_reminder: string | null;
  reminder_sent_7d: boolean;
  reminder_sent_1d: boolean;
  visibilita: EventVisibilita;
  platino_id: string | null;
  creato_da: string;
  created_at: string;
  updated_at: string;
  // join opzionali (aggiunti dalle API)
  my_rsvp?: RsvpStato | null;
  attendees_count?: number;
}

export interface EventAttendee {
  event_id: string;
  user_id: string;
  stato: RsvpStato;
  responded_at: string;
  profile?: {
    nome: string;
    email: string;
    telefono: string | null;
  };
}

export const MODALITA_LABELS: Record<EventModalita, string> = {
  presenza: "In presenza",
  online: "Online",
  hybrid: "Ibrido",
};

export const MODALITA_BADGE: Record<EventModalita, string> = {
  presenza: "bg-[#dcfce7] text-[#166534]",
  online: "bg-accent-glow text-accent",
  hybrid: "bg-[#fef9c3] text-[#854d0e]",
};

export const RSVP_LABELS: Record<RsvpStato, string> = {
  confermato: "Confermato",
  forse: "Forse",
  annullato: "Annullato",
};

export const RSVP_BADGE: Record<RsvpStato, string> = {
  confermato: "bg-[#dcfce7] text-[#166534]",
  forse: "bg-[#fef9c3] text-[#854d0e]",
  annullato: "bg-[#fee2e2] text-[#991b1b]",
};

export const VISIBILITA_LABELS: Record<EventVisibilita, string> = {
  globale: "Tutti",
  gruppo: "Il mio gruppo",
};

export type BookingStato = "confermato" | "in_attesa" | "annullato";

export interface EventProspectBooking {
  id: string;
  event_id: string;
  prospect_id: string;
  stato: BookingStato;
  created_at: string;
}

export interface AttendeeRow {
  tipo: "partner" | "prospect";
  id: string;
  nome: string;
  email: string | null;
  telefono: string | null;
  stato: RsvpStato | BookingStato;
  partnerNome?: string;
}

export const BOOKING_BADGE: Record<BookingStato, string> = {
  confermato: "bg-[#dcfce7] text-[#166534]",
  in_attesa: "bg-[#fef9c3] text-[#854d0e]",
  annullato: "bg-[#fee2e2] text-[#991b1b]",
};

export const BOOKING_LABELS: Record<BookingStato, string> = {
  confermato: "Confermato",
  in_attesa: "In lista d'attesa",
  annullato: "Annullato",
};
