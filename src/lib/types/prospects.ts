// Shared TypeScript types for the prospects (contatti/lead) module

export type ProspectSource =
  | "contatto_personale"
  | "lista"
  | "social"
  | "referenza"
  | "altro";

export type ProspectStato =
  | "nuovo_contatto"
  | "primo_appt"
  | "secondo_appt"
  | "convertito_cliente"
  | "convertito_partner"
  | "follow_up";

export type ProspectSubTag =
  | "interessato_non_ora"
  | "necessita_info"
  | "ha_detto_no"
  | "custom";

export interface Prospect {
  id: string;
  partner_id: string;
  nome: string;
  telefono: string | null;
  email: string | null;
  citta: string | null;
  source: ProspectSource;
  note: string | null;
  stato: ProspectStato;
  sub_tag_follow_up: ProspectSubTag | null;
  sub_tag_custom: string | null;
  cadenza_giorni: number;
  prossima_data_reminder: string | null;
  // Conversion columns (Phase 3 — present in DB, unused in Phase 1 UI)
  convertito_a: "cliente" | "partner" | null;
  customer_id: string | null;
  profile_id_nuovo_partner: string | null;
  data_conversione: string | null;
  created_at: string;
  updated_at: string;
}

export const SOURCE_LABELS: Record<ProspectSource, string> = {
  contatto_personale: "Contatto personale",
  lista: "Lista nomi",
  social: "Social",
  referenza: "Referenza",
  altro: "Altro",
};

export const STATO_LABELS: Record<ProspectStato, string> = {
  nuovo_contatto: "Nuovo contatto",
  primo_appt: "Primo appuntamento",
  secondo_appt: "Secondo appuntamento",
  convertito_cliente: "Convertito a cliente",
  convertito_partner: "Convertito a partner",
  follow_up: "Follow-up",
};

export const SUB_TAG_LABELS: Record<ProspectSubTag, string> = {
  interessato_non_ora: "Interessato ma non ora",
  necessita_info: "Necessita più info",
  ha_detto_no: "Ha detto no",
  custom: "Altro (personalizzato)",
};

// Tailwind badge classes per pipeline state (reuses existing theme tokens)
export const STATO_BADGE: Record<ProspectStato, string> = {
  nuovo_contatto: "bg-bg-section text-text-secondary",
  primo_appt: "bg-accent-glow text-accent",
  secondo_appt: "bg-accent-glow text-accent",
  convertito_cliente: "bg-[#dcfce7] text-[#166534]",
  convertito_partner: "bg-[#ffedd5] text-[#9a3412]",
  follow_up: "bg-[#fef9c3] text-[#854d0e]",
};
