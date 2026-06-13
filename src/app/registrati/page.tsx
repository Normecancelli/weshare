"use client";

import { Suspense, useEffect, useState, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { sanitizeSlug } from "@/lib/auth/slug";

interface Sponsor {
  id: string;
  codice_amway: string;
  nome: string;
  qualifica: string;
}

interface Platino {
  id: string;
  codice_amway: string | null;
  nome: string;
  qualifica: string;
}

const QUALIFICHE = [
  { value: "nessuna", label: "Nuovo iscritto" },
  { value: "silver", label: "Silver" },
  { value: "gold", label: "Gold" },
  { value: "platino", label: "Platino" },
  { value: "smeraldo", label: "Smeraldo" },
  { value: "diamante", label: "Diamante" },
];

const input =
  "w-full px-3 py-2.5 rounded-xl text-sm border border-border bg-bg-main focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent";

export default function RegistratiPage() {
  return (
    <Suspense
      fallback={
        <div className="flex-1 flex items-center justify-center">
          <div className="w-10 h-10 border-3 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <RegistratiInner />
    </Suspense>
  );
}

function RegistratiInner() {
  const router = useRouter();
  const search = useSearchParams();
  const supabase = createClient();
  const sponsorSlug = sanitizeSlug(search.get("sponsor") || "");

  const [sponsor, setSponsor] = useState<Sponsor | null>(null);
  const [sponsorLoading, setSponsorLoading] = useState(true);
  const [sponsorError, setSponsorError] = useState("");

  const [form, setForm] = useState({
    nome: "",
    cognome: "",
    email: "",
    password: "",
    cellulare: "",
    codice_amway: "",
    qualifica: "nessuna",
    data_ingresso: "",
    indirizzo: "",
    citta: "",
  });

  const [platino, setPlatino] = useState<Platino | null>(null);
  const [platinoQuery, setPlatinoQuery] = useState("");
  const [platinoResults, setPlatinoResults] = useState<Platino[]>([]);
  const [platinoOpen, setPlatinoOpen] = useState(false);
  const platinoRef = useRef<HTMLDivElement>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!sponsorSlug) {
      setSponsorError("Manca il riferimento allo sponsor nell'URL.");
      setSponsorLoading(false);
      return;
    }
    fetch(`/api/sponsor/${encodeURIComponent(sponsorSlug)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.sponsor) setSponsor(data.sponsor);
        else setSponsorError(data.error || "Sponsor non trovato");
      })
      .catch(() => setSponsorError("Errore caricamento sponsor"))
      .finally(() => setSponsorLoading(false));
  }, [sponsorSlug]);

  // Debounced platino search
  useEffect(() => {
    if (!platinoOpen) return;
    const handle = setTimeout(async () => {
      const url = `/api/profiles/platino-search${platinoQuery.trim() ? `?q=${encodeURIComponent(platinoQuery.trim())}` : ""}`;
      const res = await fetch(url);
      const data = await res.json();
      setPlatinoResults(data.platini || []);
    }, 200);
    return () => clearTimeout(handle);
  }, [platinoQuery, platinoOpen]);

  // Close autocomplete on outside click
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (
        platinoRef.current &&
        !platinoRef.current.contains(e.target as Node)
      ) {
        setPlatinoOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!sponsor) return;
    if (!form.nome.trim() || !form.cognome.trim() || !form.email.trim() || !form.password) {
      setError("Compila tutti i campi obbligatori");
      return;
    }
    if (form.password.length < 6) {
      setError("La password deve avere almeno 6 caratteri");
      return;
    }
    setSubmitting(true);
    setError("");

    const payload = {
      sponsor_slug: sponsorSlug,
      nome: form.nome,
      cognome: form.cognome,
      email: form.email,
      password: form.password,
      cellulare: form.cellulare,
      codice_amway: form.codice_amway || undefined,
      qualifica: form.qualifica,
      data_ingresso: form.data_ingresso || undefined,
      platino_riferimento_id: platino?.id,
      indirizzo: form.indirizzo || undefined,
      citta: form.citta || undefined,
    };

    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();

    if (!res.ok) {
      setError(data.error || "Errore durante la registrazione");
      setSubmitting(false);
      return;
    }

    // Auto-login con le credenziali appena create
    const { error: signinErr } = await supabase.auth.signInWithPassword({
      email: form.email.trim().toLowerCase(),
      password: form.password,
    });
    if (signinErr) {
      router.push("/login");
      return;
    }
    router.push("/benvenuto");
    router.refresh();
  }

  if (sponsorLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-10 h-10 border-3 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (sponsorError || !sponsor) {
    return (
      <div className="flex-1 flex items-center justify-center bg-bg-main px-4">
        <div className="w-full max-w-md text-center bg-bg-card border border-border rounded-2xl p-8">
          <p className="text-3xl mb-3">⚠️</p>
          <h1 className="text-lg font-bold text-text-primary mb-2">
            Link non valido
          </h1>
          <p className="text-sm text-text-secondary mb-5">{sponsorError}</p>
          <button
            onClick={() => router.push("/login")}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-accent text-white hover:bg-accent-hover transition-all"
          >
            Vai al login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-bg-main px-4 py-8">
      <div className="w-full max-w-xl mx-auto">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-text-primary">WeShare</h1>
          <p className="text-sm text-text-gentle mt-1">powered by Me.To.Do for you®</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-bg-card border border-border rounded-2xl shadow-sm"
        >
          <div className="p-5 border-b border-divider">
            <h2 className="text-lg font-semibold text-text-primary">Registrazione</h2>
            <p className="text-xs text-text-secondary mt-1">
              Sponsor: <span className="font-semibold">{sponsor.nome}</span>
              {" · "}cod. {sponsor.codice_amway}
            </p>
          </div>

          <div className="p-5 space-y-4">
            {error && (
              <div className="bg-coral-soft text-coral text-sm p-3 rounded-xl">{error}</div>
            )}

            {/* Anagrafica */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-text-secondary mb-1 block">
                  Nome *
                </label>
                <input
                  className={input}
                  value={form.nome}
                  onChange={(e) => setForm({ ...form, nome: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-text-secondary mb-1 block">
                  Cognome *
                </label>
                <input
                  className={input}
                  value={form.cognome}
                  onChange={(e) => setForm({ ...form, cognome: e.target.value })}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-text-secondary mb-1 block">
                  Email *
                </label>
                <input
                  type="email"
                  className={input}
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-text-secondary mb-1 block">
                  Cellulare *
                </label>
                <input
                  type="tel"
                  className={input}
                  value={form.cellulare}
                  onChange={(e) => setForm({ ...form, cellulare: e.target.value })}
                  required
                  placeholder="+39 ..."
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-text-secondary mb-1 block">
                Password *
              </label>
              <input
                type="password"
                className={input}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                minLength={6}
                required
                placeholder="Almeno 6 caratteri"
              />
            </div>

            <div className="border-t border-divider pt-4">
              <div className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-3">
                Profilo Amway
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-text-secondary mb-1 block">
                    Codice Amway proprio
                    <span className="text-text-gentle font-normal"> · opzionale</span>
                  </label>
                  <input
                    className={`${input} font-mono`}
                    value={form.codice_amway}
                    onChange={(e) => setForm({ ...form, codice_amway: e.target.value })}
                    placeholder="es. 8044484"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-text-secondary mb-1 block">
                    Qualifica attuale
                  </label>
                  <select
                    className={input}
                    value={form.qualifica}
                    onChange={(e) => setForm({ ...form, qualifica: e.target.value })}
                  >
                    {QUALIFICHE.map((q) => (
                      <option key={q.value} value={q.value}>
                        {q.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-3">
                <label className="text-xs font-semibold text-text-secondary mb-1 block">
                  Data ingresso in Amway
                  <span className="text-text-gentle font-normal"> · vuoto = oggi</span>
                </label>
                <input
                  type="date"
                  className={input}
                  value={form.data_ingresso}
                  onChange={(e) => setForm({ ...form, data_ingresso: e.target.value })}
                />
              </div>

              {/* Platino autocomplete */}
              <div className="mt-3 relative" ref={platinoRef}>
                <label className="text-xs font-semibold text-text-secondary mb-1 block">
                  Platino di riferimento
                  <span className="text-text-gentle font-normal"> · opzionale</span>
                </label>
                {platino ? (
                  <div className="flex items-center gap-2 p-2 bg-accent-glow rounded-xl">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-text-primary">
                        {platino.nome}
                      </div>
                      <div className="text-[11px] text-text-secondary">
                        {platino.qualifica}
                        {platino.codice_amway ? ` · cod. ${platino.codice_amway}` : ""}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setPlatino(null);
                        setPlatinoQuery("");
                      }}
                      className="text-xs text-coral hover:underline"
                    >
                      Cambia
                    </button>
                  </div>
                ) : (
                  <>
                    <input
                      className={input}
                      placeholder="Cerca per nome o codice Amway..."
                      value={platinoQuery}
                      onChange={(e) => {
                        setPlatinoQuery(e.target.value);
                        setPlatinoOpen(true);
                      }}
                      onFocus={() => setPlatinoOpen(true)}
                    />
                    {platinoOpen && (
                      <div className="absolute z-10 left-0 right-0 mt-1 bg-bg-card border border-border rounded-xl shadow-lg max-h-60 overflow-y-auto">
                        {platinoResults.length === 0 ? (
                          <div className="p-3 text-xs text-text-secondary text-center">
                            {platinoQuery.trim()
                              ? "Nessun risultato"
                              : "Inizia a digitare per cercare..."}
                          </div>
                        ) : (
                          platinoResults.map((p) => (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => {
                                setPlatino(p);
                                setPlatinoOpen(false);
                                setPlatinoQuery("");
                              }}
                              className="w-full text-left p-2.5 hover:bg-bg-section border-b border-divider last:border-b-0"
                            >
                              <div className="text-sm font-medium text-text-primary">
                                {p.nome}
                              </div>
                              <div className="text-[11px] text-text-secondary">
                                {p.qualifica}
                                {p.codice_amway ? ` · cod. ${p.codice_amway}` : ""}
                              </div>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            <div className="border-t border-divider pt-4">
              <div className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-3">
                Indirizzo · opzionale
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  className={input}
                  value={form.indirizzo}
                  onChange={(e) => setForm({ ...form, indirizzo: e.target.value })}
                  placeholder="Via, numero"
                />
                <input
                  className={input}
                  value={form.citta}
                  onChange={(e) => setForm({ ...form, citta: e.target.value })}
                  placeholder="Città"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 p-5 border-t border-divider">
            <button
              type="button"
              onClick={() => router.push("/login")}
              className="px-4 py-2 rounded-xl text-sm text-text-secondary hover:bg-bg-section transition-all"
            >
              Annulla
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 rounded-xl text-sm font-semibold bg-accent text-white hover:bg-accent-hover transition-all disabled:opacity-50"
            >
              {submitting ? "Registrazione..." : "Crea account"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
