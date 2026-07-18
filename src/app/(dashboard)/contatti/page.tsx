"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { QrCode } from "lucide-react";
import { ContactQrCard } from "@/components/prospects/contact-qr-card";
import {
  type Prospect,
  type ProspectStato,
  SOURCE_LABELS,
  STATO_LABELS,
  STATO_BADGE,
} from "@/lib/types/prospects";

const inputClass =
  "w-full px-4 py-2.5 rounded-xl text-sm border border-border bg-bg-main focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent";

const STATO_FILTERS: (ProspectStato | "tutti")[] = [
  "tutti",
  "nuovo_contatto",
  "primo_appt",
  "secondo_appt",
  "follow_up",
  "convertito_cliente",
  "convertito_partner",
];

export default function ContattiPage() {
  const router = useRouter();
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statoFilter, setStatoFilter] = useState<ProspectStato | "tutti">("tutti");
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    nome: "",
    telefono: "",
    email: "",
    citta: "",
    source: "contatto_personale",
    note: "",
  });
  const [mySlug, setMySlug] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);

  useEffect(() => {
    fetchProspects();
    fetch("/api/profile")
      .then((r) => r.json())
      .then((d) => setMySlug(d.profile?.invite_url_slug || d.profile?.codice_amway || null))
      .catch(() => {});
  }, []);

  async function fetchProspects() {
    setLoading(true);
    const res = await fetch("/api/prospects");
    const data = await res.json();
    setProspects(data.prospects || []);
    setLoading(false);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!formData.nome.trim()) return;
    setSaving(true);
    const res = await fetch("/api/prospects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formData),
    });
    if (res.ok) {
      setFormData({ nome: "", telefono: "", email: "", citta: "", source: "contatto_personale", note: "" });
      setShowForm(false);
      fetchProspects();
    }
    setSaving(false);
  }

  const filtered = prospects.filter((p) => {
    if (statoFilter !== "tutti" && p.stato !== statoFilter) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      p.nome.toLowerCase().includes(q) ||
      (p.telefono && p.telefono.includes(q)) ||
      (p.email && p.email.toLowerCase().includes(q))
    );
  });

  function getInitials(p: Prospect) {
    return p.nome.trim().slice(0, 2).toUpperCase();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-10 h-10 border-3 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Contatti</h2>
          <p className="text-text-secondary text-sm mt-1">
            {prospects.length} contatti nella pipeline
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push("/contatti/analytics")}
            className="px-4 py-2.5 rounded-xl text-sm font-semibold bg-bg-section text-text-primary hover:bg-accent-glow transition-all"
          >
            Analytics
          </button>
          <button
            onClick={() => router.push("/contatti/follow-up")}
            className="px-4 py-2.5 rounded-xl text-sm font-semibold bg-bg-section text-text-primary hover:bg-accent-glow transition-all"
          >
            Follow-up
          </button>
          <button
            onClick={() => setShowQr(true)}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold bg-bg-section text-text-primary hover:bg-accent-glow transition-all"
          >
            <QrCode size={16} strokeWidth={2} />
            My QrCode
          </button>
          <button
            onClick={() => setShowForm(!showForm)}
            className="px-4 py-2.5 rounded-xl text-sm font-semibold bg-accent text-white hover:bg-accent-hover transition-all"
          >
            {showForm ? "Annulla" : "+ Nuovo Contatto"}
          </button>
        </div>
      </div>

      {showForm && (
        <form
          onSubmit={handleCreate}
          className="bg-bg-card border border-border rounded-2xl p-4 md:p-6 mb-6"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
            <input type="text" placeholder="Nome *" value={formData.nome} onChange={(e) => setFormData({ ...formData, nome: e.target.value })} required className={inputClass} />
            <input type="tel" placeholder="Telefono" value={formData.telefono} onChange={(e) => setFormData({ ...formData, telefono: e.target.value })} className={inputClass} />
            <input type="email" placeholder="Email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} className={inputClass} />
            <input type="text" placeholder="Città" value={formData.citta} onChange={(e) => setFormData({ ...formData, citta: e.target.value })} className={inputClass} />
            <select value={formData.source} onChange={(e) => setFormData({ ...formData, source: e.target.value })} className={inputClass}>
              {Object.entries(SOURCE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <input type="text" placeholder="Note" value={formData.note} onChange={(e) => setFormData({ ...formData, note: e.target.value })} className={inputClass} />
          </div>
          <button type="submit" disabled={saving} className="px-6 py-2.5 rounded-xl text-sm font-semibold bg-accent text-white hover:bg-accent-hover transition-all disabled:opacity-50">
            {saving ? "Salvataggio..." : "Salva contatto"}
          </button>
        </form>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        {STATO_FILTERS.map((s) => (
          <button
            key={s}
            onClick={() => setStatoFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              statoFilter === s
                ? "bg-accent text-white"
                : "bg-bg-section text-text-secondary hover:text-text-primary"
            }`}
          >
            {s === "tutti" ? "Tutti" : STATO_LABELS[s]}
          </button>
        ))}
      </div>

      <div className="relative max-w-sm mb-6">
        <input
          type="text"
          placeholder="Cerca contatto..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm border border-border bg-bg-card text-text-primary placeholder-text-gentle focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-all"
        />
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-gentle">🔍</span>
      </div>

      {/* Desktop table */}
      <div className="hidden md:block bg-bg-card border border-border rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-divider text-left text-xs uppercase tracking-wide text-text-secondary">
              <th className="px-4 py-3 font-semibold">Nome</th>
              <th className="px-4 py-3 font-semibold">Contatti</th>
              <th className="px-4 py-3 font-semibold">Provenienza</th>
              <th className="px-4 py-3 font-semibold">Stato</th>
              <th className="px-4 py-3 font-semibold">Prossima azione</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr
                key={p.id}
                onClick={() => router.push(`/contatti/${p.id}`)}
                className="border-b border-divider last:border-0 hover:bg-bg-section/50 transition-colors cursor-pointer"
              >
                <td className="px-4 py-3 font-semibold text-text-primary">{p.nome}</td>
                <td className="px-4 py-3 text-text-secondary">
                  <div className="flex flex-col">
                    {p.telefono && <span>{p.telefono}</span>}
                    {p.email && <span className="text-xs">{p.email}</span>}
                  </div>
                </td>
                <td className="px-4 py-3 text-text-secondary">{SOURCE_LABELS[p.source]}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 rounded-md text-xs font-semibold ${STATO_BADGE[p.stato]}`}>
                    {STATO_LABELS[p.stato]}
                  </span>
                </td>
                <td className="px-4 py-3 text-text-secondary">
                  {p.prossima_data_reminder
                    ? new Date(p.prossima_data_reminder).toLocaleDateString("it-IT")
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {filtered.map((p) => (
          <button
            key={p.id}
            onClick={() => router.push(`/contatti/${p.id}`)}
            className="w-full text-left bg-bg-card border border-border rounded-xl p-4 flex items-center gap-4 hover:shadow-md hover:border-accent/30 transition-all"
          >
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-accent to-accent-hover flex items-center justify-center text-white text-sm font-bold shrink-0">
              {getInitials(p)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm text-text-primary">{p.nome}</div>
              <div className="text-xs text-text-secondary flex flex-wrap gap-x-3">
                {p.telefono && <span>{p.telefono}</span>}
                {p.citta && <span>{p.citta}</span>}
              </div>
            </div>
            <span className={`px-2 py-1 rounded-md text-xs font-semibold shrink-0 ${STATO_BADGE[p.stato]}`}>
              {STATO_LABELS[p.stato]}
            </span>
          </button>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-text-secondary text-sm">
          {prospects.length === 0
            ? "Nessun contatto. Aggiungine uno con il bottone qui sopra."
            : "Nessun contatto trovato con i filtri attivi."}
        </div>
      )}

      {showQr && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center pt-8 md:pt-16 px-4 overflow-y-auto">
          <div className="bg-bg-card border border-border rounded-2xl w-full max-w-md shadow-xl mb-8">
            <div className="flex items-center justify-between p-5 border-b border-divider">
              <h3 className="text-lg font-bold text-text-primary">My QrCode</h3>
              <button onClick={() => setShowQr(false)} className="w-8 h-8 rounded-lg hover:bg-bg-section flex items-center justify-center text-text-secondary transition-all">✕</button>
            </div>
            <div className="p-5">
              <ContactQrCard slug={mySlug} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
