"use client";

import { useState } from "react";
import { InlineMessage } from "@/components/ui/inline-message";

const inputClass =
  "w-full px-4 py-2.5 rounded-xl text-sm border border-border bg-bg-main focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent";

export interface BookingFormValues {
  nome: string;
  cognome: string;
  telefono: string;
  email: string;
  website: string;
}

interface Props {
  initial?: Partial<Pick<BookingFormValues, "nome" | "cognome" | "telefono" | "email">>;
  showCognome?: boolean;
  onSubmit: (values: BookingFormValues) => Promise<void>;
}

export function BookingForm({ initial, showCognome = true, onSubmit }: Props) {
  const [form, setForm] = useState<BookingFormValues>({
    nome: initial?.nome || "",
    cognome: initial?.cognome || "",
    telefono: initial?.telefono || "",
    email: initial?.email || "",
    website: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nome.trim() || (!form.telefono.trim() && !form.email.trim())) {
      setError("Inserisci il nome e almeno un contatto (telefono o email)");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await onSubmit(form);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore durante l'invio, riprova.");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {error && <InlineMessage variant="error">{error}</InlineMessage>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <input
          type="text" placeholder="Nome *" value={form.nome}
          onChange={(e) => setForm({ ...form, nome: e.target.value })}
          required className={inputClass}
        />
        {showCognome && (
          <input
            type="text" placeholder="Cognome" value={form.cognome}
            onChange={(e) => setForm({ ...form, cognome: e.target.value })}
            className={inputClass}
          />
        )}
        <input
          type="tel" placeholder="Telefono" value={form.telefono}
          onChange={(e) => setForm({ ...form, telefono: e.target.value })}
          className={inputClass}
        />
        <input
          type="email" placeholder="Email" value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          className={inputClass}
        />
      </div>
      <input
        type="text"
        value={form.website}
        onChange={(e) => setForm({ ...form, website: e.target.value })}
        tabIndex={-1}
        autoComplete="off"
        className="absolute -left-[9999px] w-px h-px opacity-0"
        aria-hidden="true"
      />
      <button
        type="submit" disabled={submitting}
        className="w-full py-3 rounded-xl text-sm font-semibold bg-accent text-white hover:bg-accent-hover transition-all disabled:opacity-50"
      >
        {submitting ? "Invio..." : "Prenota il tuo posto"}
      </button>
    </form>
  );
}
