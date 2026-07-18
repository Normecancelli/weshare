// src/app/contatto/[slug]/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { sanitizeSlug } from "@/lib/auth/slug";
import { InlineMessage } from "@/components/ui/inline-message";

interface Sponsor {
  nome: string;
  qualifica: string;
}

const inputClass =
  "w-full px-4 py-2.5 rounded-xl text-sm border border-border bg-bg-main focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent";

export default function ContattoLandingPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const cleanSlug = sanitizeSlug(slug);

  const [loading, setLoading] = useState(true);
  const [sponsor, setSponsor] = useState<Sponsor | null>(null);
  const [error, setError] = useState("");

  const [form, setForm] = useState({ nome: "", cognome: "", telefono: "", email: "", website: "" });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  useEffect(() => {
    if (!cleanSlug) {
      setError("Link non valido");
      setLoading(false);
      return;
    }
    fetch(`/api/sponsor/${encodeURIComponent(cleanSlug)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.sponsor) {
          setSponsor({ nome: data.sponsor.nome, qualifica: data.sponsor.qualifica });
        } else {
          setError("Link non valido. Verifica di aver scansionato il codice corretto.");
        }
      })
      .catch(() => setError("Errore di caricamento. Riprova tra poco."))
      .finally(() => setLoading(false));
  }, [cleanSlug]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nome.trim() || (!form.telefono.trim() && !form.email.trim())) {
      setSubmitError("Inserisci il nome e almeno un contatto (telefono o email)");
      return;
    }
    setSubmitting(true);
    setSubmitError("");
    const res = await fetch(`/api/contatto/${encodeURIComponent(cleanSlug)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (res.ok && data.url) {
      router.push(data.url);
    } else {
      setSubmitError(data.error || "Errore durante l'invio, riprova.");
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-10 h-10 border-3 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !sponsor) {
    return (
      <div className="flex-1 flex items-center justify-center bg-bg-main px-4">
        <div className="w-full max-w-md text-center bg-bg-card border border-border rounded-2xl p-8">
          <h1 className="text-lg font-bold text-text-primary mb-2">Link non valido</h1>
          <p className="text-sm text-text-secondary">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex items-center justify-center bg-bg-main px-4 py-10 overflow-y-auto">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-text-primary">WeShare</h1>
          <p className="text-sm text-text-gentle mt-1">powered by Me.To.Do for you®</p>
        </div>

        <div className="bg-bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
          <div className="bg-gradient-to-br from-accent-glow to-coral-soft p-6 text-center border-b border-divider">
            <p className="text-xs uppercase tracking-wide text-text-secondary mb-2">Sei stato invitato da</p>
            <div className="text-lg font-bold text-text-primary">{sponsor.nome}</div>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-3">
            <h2 className="text-base font-semibold text-text-primary mb-1">Lascia i tuoi contatti</h2>
            <p className="text-sm text-text-secondary mb-3">
              Compila il form per ricevere eventi e contenuti selezionati per te.
            </p>
            {submitError && <InlineMessage variant="error">{submitError}</InlineMessage>}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input type="text" placeholder="Nome *" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required className={inputClass} />
              <input type="text" placeholder="Cognome" value={form.cognome} onChange={(e) => setForm({ ...form, cognome: e.target.value })} className={inputClass} />
              <input type="tel" placeholder="Telefono" value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} className={inputClass} />
              <input type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputClass} />
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
            <button type="submit" disabled={submitting} className="w-full py-3 rounded-xl text-sm font-semibold bg-accent text-white hover:bg-accent-hover transition-all disabled:opacity-50">
              {submitting ? "Invio..." : "Invia"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
