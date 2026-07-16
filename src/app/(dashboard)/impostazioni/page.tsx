"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { Avatar } from "@/components/avatar";

const inputClass =
  "w-full px-4 py-2.5 rounded-xl text-sm border border-border bg-bg-main focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent";
const labelClass = "block text-xs font-semibold text-text-secondary uppercase tracking-wide mb-1";
const cardClass = "bg-bg-card rounded-2xl border border-divider p-5 space-y-4";

const QUALIFICHE = [
  { value: "nessuna", label: "Nuovo iscritto" },
  { value: "silver", label: "Silver" },
  { value: "gold", label: "Gold" },
  { value: "platino", label: "Platino" },
  { value: "smeraldo", label: "Smeraldo" },
  { value: "diamante", label: "Diamante" },
];

interface RiferimentoProfilo {
  id: string;
  codice_amway: string | null;
  nome: string;
  qualifica: string;
}

interface Profile {
  id: string;
  nome: string;
  email: string;
  telefono: string | null;
  indirizzo: string | null;
  cap: string | null;
  citta: string | null;
  codice_amway: string | null;
  codice_attivita: string | null;
  qualifica: string | null;
  data_ingresso: string | null;
  platino_riferimento_id: string | null;
  diamante_riferimento_id: string | null;
  preferenze_notifiche: Record<string, boolean>;
  avatar_url: string | null;
}

function useRiferimentoAutocomplete(soloD: boolean) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<RiferimentoProfilo[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handle = setTimeout(async () => {
      const url = `/api/profiles/platino-search?${soloD ? "solo=diamante&" : ""}q=${encodeURIComponent(query.trim())}`;
      const res = await fetch(url);
      const data = await res.json();
      setResults(data.platini || []);
    }, 200);
    return () => clearTimeout(handle);
  }, [query, open, soloD]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return { query, setQuery, results, open, setOpen, ref };
}

export default function ImpostazioniPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const [form, setForm] = useState({
    nome: "",
    telefono: "",
    indirizzo: "",
    cap: "",
    citta: "",
    codice_attivita: "",
    qualifica: "nessuna",
    data_ingresso: "",
    platino_riferimento_id: "",
    diamante_riferimento_id: "",
    preferenze_notifiche: {
      reminder_eventi: true,
      riepilogo_settimanale: true,
      date_clienti: true,
    } as Record<string, boolean>,
  });

  const [platinoNome, setPlatinoNome] = useState("");
  const [diamanteNome, setDiamanteNome] = useState("");
  const platinoAc = useRiferimentoAutocomplete(false);
  const diamanteAc = useRiferimentoAutocomplete(true);

  const avatarFileRef = useRef<HTMLInputElement>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);

  const router = useRouter();
  const [hasAnthropicKey, setHasAnthropicKey] = useState(false);
  const [aiGenerationsRemaining, setAiGenerationsRemaining] = useState<number | null>(5);
  const [anthropicKeyInput, setAnthropicKeyInput] = useState("");
  const [savingKey, setSavingKey] = useState(false);

  async function handleAvatarUpload(file: File) {
    setAvatarUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/profile/avatar", { method: "POST", body: fd });
    const data = await res.json();
    if (res.ok) {
      setProfile((p) => (p ? { ...p, avatar_url: data.avatar_url } : p));
      showToast("Foto aggiornata");
    } else {
      showToast(data.error || "Errore upload foto");
    }
    setAvatarUploading(false);
  }

  async function handleAvatarRemove() {
    setAvatarUploading(true);
    await fetch("/api/profile/avatar", { method: "DELETE" });
    setProfile((p) => (p ? { ...p, avatar_url: null } : p));
    setAvatarUploading(false);
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => r.json())
      .then((d) => {
        const p: Profile = d.profile;
        setProfile(p);
        setForm({
          nome: p.nome || "",
          telefono: p.telefono || "",
          indirizzo: p.indirizzo || "",
          cap: p.cap || "",
          citta: p.citta || "",
          codice_attivita: p.codice_attivita || "",
          qualifica: p.qualifica || "nessuna",
          data_ingresso: p.data_ingresso ? p.data_ingresso.slice(0, 10) : "",
          platino_riferimento_id: p.platino_riferimento_id || "",
          diamante_riferimento_id: p.diamante_riferimento_id || "",
          preferenze_notifiche: {
            reminder_eventi: true,
            riepilogo_settimanale: true,
            date_clienti: true,
            ...(p.preferenze_notifiche || {}),
          },
        });
        setHasAnthropicKey(d.hasAnthropicKey);
        setAiGenerationsRemaining(d.aiGenerationsRemaining);
        setLoading(false);
      });
  }, []);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function toggleNotifica(key: string) {
    setForm((f) => ({
      ...f,
      preferenze_notifiche: { ...f.preferenze_notifiche, [key]: !f.preferenze_notifiche[key] },
    }));
  }

  async function handleSalva() {
    setSaving(true);
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nome: form.nome,
        telefono: form.telefono || null,
        indirizzo: form.indirizzo || null,
        cap: form.cap || null,
        citta: form.citta || null,
        codice_attivita: form.codice_attivita || null,
        qualifica: form.qualifica,
        data_ingresso: form.data_ingresso || null,
        platino_riferimento_id: form.platino_riferimento_id || null,
        diamante_riferimento_id: form.diamante_riferimento_id || null,
        preferenze_notifiche: form.preferenze_notifiche,
      }),
    });
    setSaving(false);
    showToast(res.ok ? "Modifiche salvate" : "Errore durante il salvataggio");
  }

  async function handleSalvaChiave() {
    if (!anthropicKeyInput.trim()) return;
    setSavingKey(true);
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ anthropic_api_key: anthropicKeyInput.trim() }),
    });
    setSavingKey(false);
    if (res.ok) {
      setHasAnthropicKey(true);
      setAiGenerationsRemaining(null);
      setAnthropicKeyInput("");
      showToast("Chiave AI salvata");
    } else {
      showToast("Errore salvataggio chiave");
    }
  }

  async function handleRimuoviChiave() {
    setSavingKey(true);
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ anthropic_api_key: null }),
    });
    setSavingKey(false);
    if (res.ok) {
      const fresh = await fetch("/api/profile").then((r) => r.json());
      setHasAnthropicKey(fresh.hasAnthropicKey);
      setAiGenerationsRemaining(fresh.aiGenerationsRemaining);
      showToast("Chiave AI rimossa");
    }
  }

  async function handleLogout() {
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  if (loading || !profile) {
    return <div className="p-6 text-text-secondary text-sm">Caricamento…</div>;
  }

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-5">
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-[#0B2545] text-white text-sm px-4 py-2 rounded-xl shadow-lg">
          {toast}
        </div>
      )}

      <h1 className="text-xl font-bold text-text-primary">Impostazioni</h1>

      {/* Foto profilo */}
      <div className={cardClass}>
        <h2 className="font-semibold text-text-primary">Foto profilo</h2>
        <div className="flex items-center gap-4">
          <Avatar profile={profile} size="lg" />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={avatarUploading}
              onClick={() => avatarFileRef.current?.click()}
              className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-xl border border-border hover:bg-bg-section transition-colors disabled:opacity-50"
            >
              <Upload size={14} strokeWidth={1.75} />
              Carica nuova foto
            </button>
            {profile.avatar_url && (
              <button
                type="button"
                disabled={avatarUploading}
                onClick={handleAvatarRemove}
                className="text-sm text-text-secondary hover:text-text-primary px-4 py-2 rounded-xl border border-border transition-colors disabled:opacity-50"
              >
                Rimuovi
              </button>
            )}
          </div>
          <input
            ref={avatarFileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleAvatarUpload(e.target.files[0])}
          />
        </div>
      </div>

      {/* Dati personali */}
      <div className={cardClass}>
        <h2 className="font-semibold text-text-primary">Dati personali</h2>
        <div>
          <label className={labelClass}>Nome e cognome</label>
          <input className={inputClass} value={form.nome} onChange={(e) => set("nome", e.target.value)} />
        </div>
        <div>
          <label className={labelClass}>Cellulare</label>
          <input className={inputClass} value={form.telefono} onChange={(e) => set("telefono", e.target.value)} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Indirizzo</label>
            <input className={inputClass} value={form.indirizzo} onChange={(e) => set("indirizzo", e.target.value)} />
          </div>
          <div>
            <label className={labelClass}>CAP</label>
            <input className={inputClass} value={form.cap} onChange={(e) => set("cap", e.target.value)} />
          </div>
        </div>
        <div>
          <label className={labelClass}>Città</label>
          <input className={inputClass} value={form.citta} onChange={(e) => set("citta", e.target.value)} />
        </div>
      </div>

      {/* Profilo Amway */}
      <div className={cardClass}>
        <h2 className="font-semibold text-text-primary">Profilo Amway</h2>
        <div>
          <label className={labelClass}>Codice Amway</label>
          <input className={`${inputClass} opacity-60`} value={profile.codice_amway || "—"} disabled />
        </div>
        <div>
          <label className={labelClass}>Codice attività</label>
          <input className={inputClass} value={form.codice_attivita} onChange={(e) => set("codice_attivita", e.target.value)} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Qualifica</label>
            <select className={inputClass} value={form.qualifica} onChange={(e) => set("qualifica", e.target.value)}>
              {QUALIFICHE.map((q) => (
                <option key={q.value} value={q.value}>{q.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Data ingresso</label>
            <input type="date" className={inputClass} value={form.data_ingresso} onChange={(e) => set("data_ingresso", e.target.value)} />
          </div>
        </div>

        <div ref={platinoAc.ref} className="relative">
          <label className={labelClass}>Platino di riferimento</label>
          <input
            className={inputClass}
            placeholder="Cerca per nome o codice…"
            autoComplete="nope"
            value={platinoAc.open ? platinoAc.query : platinoNome}
            onFocus={() => platinoAc.setOpen(true)}
            onChange={(e) => { platinoAc.setQuery(e.target.value); platinoAc.setOpen(true); }}
          />
          {platinoAc.open && platinoAc.results.length > 0 && (
            <div className="absolute z-10 w-full mt-1 bg-white border border-border rounded-xl shadow-lg max-h-48 overflow-auto">
              {platinoAc.results.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="w-full text-left px-4 py-2 text-sm hover:bg-bg-section"
                  onClick={() => {
                    set("platino_riferimento_id", p.id);
                    setPlatinoNome(p.nome);
                    platinoAc.setOpen(false);
                  }}
                >
                  {p.nome} {p.codice_amway ? `(${p.codice_amway})` : ""}
                </button>
              ))}
            </div>
          )}
        </div>

        <div ref={diamanteAc.ref} className="relative">
          <label className={labelClass}>Diamante di riferimento</label>
          <input
            className={inputClass}
            placeholder="Cerca per nome o codice…"
            autoComplete="nope"
            value={diamanteAc.open ? diamanteAc.query : diamanteNome}
            onFocus={() => diamanteAc.setOpen(true)}
            onChange={(e) => { diamanteAc.setQuery(e.target.value); diamanteAc.setOpen(true); }}
          />
          {diamanteAc.open && diamanteAc.results.length > 0 && (
            <div className="absolute z-10 w-full mt-1 bg-white border border-border rounded-xl shadow-lg max-h-48 overflow-auto">
              {diamanteAc.results.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="w-full text-left px-4 py-2 text-sm hover:bg-bg-section"
                  onClick={() => {
                    set("diamante_riferimento_id", p.id);
                    setDiamanteNome(p.nome);
                    diamanteAc.setOpen(false);
                  }}
                >
                  {p.nome} {p.codice_amway ? `(${p.codice_amway})` : ""}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Notifiche email */}
      <div className={cardClass}>
        <h2 className="font-semibold text-text-primary">Notifiche email</h2>
        {[
          { key: "reminder_eventi", label: "Reminder eventi 72h e 24h prima" },
          { key: "riepilogo_settimanale", label: "Riepilogo settimanale" },
          { key: "date_clienti", label: "Compleanni / date da ricordare clienti" },
        ].map((n) => (
          <label key={n.key} className="flex items-center gap-2 cursor-pointer text-sm text-text-primary">
            <input
              type="checkbox"
              className="accent-accent"
              checked={!!form.preferenze_notifiche[n.key]}
              onChange={() => toggleNotifica(n.key)}
            />
            {n.label}
          </label>
        ))}
      </div>

      {/* Chiave AI personale */}
      <div className={cardClass}>
        <h2 className="font-semibold text-text-primary">Chiave AI personale</h2>
        <p className="text-sm text-text-secondary">
          {hasAnthropicKey
            ? "Generazioni illimitate — chiave personale attiva."
            : `Hai usato ${5 - (aiGenerationsRemaining ?? 0)}/5 generazioni gratuite.`}
        </p>
        {hasAnthropicKey ? (
          <button
            type="button"
            disabled={savingKey}
            onClick={handleRimuoviChiave}
            className="text-sm text-text-secondary hover:text-text-primary px-4 py-2 rounded-xl border border-border transition-colors disabled:opacity-50"
          >
            Rimuovi chiave
          </button>
        ) : (
          <div className="space-y-2">
            <input
              type="password"
              autoComplete="new-password"
              className={inputClass}
              placeholder="sk-ant-api03-…"
              value={anthropicKeyInput}
              onChange={(e) => setAnthropicKeyInput(e.target.value)}
            />
            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled={savingKey || !anthropicKeyInput.trim()}
                onClick={handleSalvaChiave}
                className="bg-accent hover:bg-accent-hover text-white font-semibold px-4 py-2 rounded-xl text-sm transition-colors disabled:opacity-50"
              >
                Salva chiave
              </button>
              <a
                href="https://console.anthropic.com/settings/keys"
                target="_blank"
                rel="noopener"
                className="text-xs text-accent hover:underline"
              >
                Crea una chiave su console.anthropic.com
              </a>
            </div>
          </div>
        )}
      </div>

      {/* Account */}
      <div className={cardClass}>
        <h2 className="font-semibold text-text-primary">Account</h2>
        <div>
          <label className={labelClass}>Email</label>
          <input className={`${inputClass} opacity-60`} value={profile.email} disabled />
          <p className="text-xs text-text-secondary mt-1">Per cambiare contatta admin.</p>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => router.push("/auth/update-password")}
            className="text-sm text-text-secondary hover:text-text-primary px-4 py-2 rounded-xl border border-border transition-colors"
          >
            Cambia password
          </button>
          <button
            type="button"
            onClick={handleLogout}
            className="text-sm text-[#991b1b] hover:bg-[#fee2e2] px-4 py-2 rounded-xl border border-border transition-colors"
          >
            Esci
          </button>
        </div>
      </div>

      <button
        onClick={handleSalva}
        disabled={saving}
        className="bg-accent hover:bg-accent-hover text-white font-semibold px-6 py-2.5 rounded-xl text-sm transition-colors disabled:opacity-50"
      >
        {saving ? "Salvataggio…" : "Salva modifiche"}
      </button>
    </div>
  );
}
