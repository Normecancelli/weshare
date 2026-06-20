"use client";

import { useEffect, useState } from "react";
import {
  type Prospect,
  type ProspectStato,
  SOURCE_LABELS,
  STATO_LABELS,
  STATO_BADGE,
  SUB_TAG_LABELS,
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

  // Edit modal state
  const [editProspect, setEditProspect] = useState<Prospect | null>(null);
  const [editForm, setEditForm] = useState({
    nome: "",
    telefono: "",
    email: "",
    citta: "",
    source: "contatto_personale" as string,
    note: "",
    stato: "nuovo_contatto" as ProspectStato,
    sub_tag_follow_up: "" as string,
    sub_tag_custom: "",
    cadenza_giorni: 14,
    prossima_data_reminder: "",
  });
  const [editSaving, setEditSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetchProspects();
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

  function openEdit(p: Prospect) {
    setEditProspect(p);
    setEditForm({
      nome: p.nome,
      telefono: p.telefono || "",
      email: p.email || "",
      citta: p.citta || "",
      source: p.source,
      note: p.note || "",
      stato: p.stato,
      sub_tag_follow_up: p.sub_tag_follow_up || "",
      sub_tag_custom: p.sub_tag_custom || "",
      cadenza_giorni: p.cadenza_giorni,
      prossima_data_reminder: p.prossima_data_reminder || "",
    });
    setConfirmDelete(false);
  }

  function closeEdit() {
    setEditProspect(null);
    setConfirmDelete(false);
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editProspect || !editForm.nome.trim()) return;
    setEditSaving(true);
    const payload = {
      ...editForm,
      sub_tag_follow_up:
        editForm.stato === "follow_up" ? editForm.sub_tag_follow_up || null : null,
      sub_tag_custom:
        editForm.stato === "follow_up" && editForm.sub_tag_follow_up === "custom"
          ? editForm.sub_tag_custom
          : null,
      prossima_data_reminder: editForm.prossima_data_reminder || null,
    };
    const res = await fetch(`/api/prospects/${editProspect.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      closeEdit();
      fetchProspects();
    }
    setEditSaving(false);
  }

  async function handleDelete() {
    if (!editProspect) return;
    setDeleting(true);
    const res = await fetch(`/api/prospects/${editProspect.id}`, { method: "DELETE" });
    if (res.ok) {
      closeEdit();
      fetchProspects();
    }
    setDeleting(false);
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
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2.5 rounded-xl text-sm font-semibold bg-accent text-white hover:bg-accent-hover transition-all"
        >
          {showForm ? "Annulla" : "+ Nuovo Contatto"}
        </button>
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
                onClick={() => openEdit(p)}
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
            onClick={() => openEdit(p)}
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

      {/* Edit modal */}
      {editProspect && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center pt-8 md:pt-16 px-4 overflow-y-auto">
          <div className="bg-bg-card border border-border rounded-2xl w-full max-w-lg shadow-xl mb-8">
            <div className="flex items-center justify-between p-5 border-b border-divider">
              <h3 className="text-lg font-bold text-text-primary">Modifica contatto</h3>
              <button onClick={closeEdit} className="w-8 h-8 rounded-lg hover:bg-bg-section flex items-center justify-center text-text-secondary transition-all">✕</button>
            </div>

            <form onSubmit={handleUpdate} className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-text-secondary mb-1 block">Nome *</label>
                  <input type="text" value={editForm.nome} onChange={(e) => setEditForm({ ...editForm, nome: e.target.value })} required className={inputClass} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-text-secondary mb-1 block">Telefono</label>
                  <input type="tel" value={editForm.telefono} onChange={(e) => setEditForm({ ...editForm, telefono: e.target.value })} className={inputClass} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-text-secondary mb-1 block">Email</label>
                  <input type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} className={inputClass} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-text-secondary mb-1 block">Città</label>
                  <input type="text" value={editForm.citta} onChange={(e) => setEditForm({ ...editForm, citta: e.target.value })} className={inputClass} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-text-secondary mb-1 block">Provenienza</label>
                  <select value={editForm.source} onChange={(e) => setEditForm({ ...editForm, source: e.target.value })} className={inputClass}>
                    {Object.entries(SOURCE_LABELS).map(([k, v]) => (<option key={k} value={k}>{v}</option>))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-text-secondary mb-1 block">Stato pipeline</label>
                  <select value={editForm.stato} onChange={(e) => setEditForm({ ...editForm, stato: e.target.value as ProspectStato })} className={inputClass}>
                    {Object.entries(STATO_LABELS).map(([k, v]) => (<option key={k} value={k}>{v}</option>))}
                  </select>
                </div>
              </div>

              {editForm.stato === "follow_up" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-divider pt-4">
                  <div>
                    <label className="text-xs font-semibold text-text-secondary mb-1 block">Motivo follow-up</label>
                    <select value={editForm.sub_tag_follow_up} onChange={(e) => setEditForm({ ...editForm, sub_tag_follow_up: e.target.value })} className={inputClass}>
                      <option value="">— seleziona —</option>
                      {Object.entries(SUB_TAG_LABELS).map(([k, v]) => (<option key={k} value={k}>{v}</option>))}
                    </select>
                  </div>
                  {editForm.sub_tag_follow_up === "custom" && (
                    <div>
                      <label className="text-xs font-semibold text-text-secondary mb-1 block">Specifica</label>
                      <input type="text" value={editForm.sub_tag_custom} onChange={(e) => setEditForm({ ...editForm, sub_tag_custom: e.target.value })} className={inputClass} />
                    </div>
                  )}
                  <div>
                    <label className="text-xs font-semibold text-text-secondary mb-1 block">Cadenza (giorni)</label>
                    <input type="number" min={1} value={editForm.cadenza_giorni} onChange={(e) => setEditForm({ ...editForm, cadenza_giorni: parseInt(e.target.value) || 14 })} className={inputClass} />
                  </div>
                </div>
              )}

              <div>
                <label className="text-xs font-semibold text-text-secondary mb-1 block">Prossima azione (data)</label>
                <input type="date" value={editForm.prossima_data_reminder} onChange={(e) => setEditForm({ ...editForm, prossima_data_reminder: e.target.value })} className={inputClass} />
              </div>

              <div>
                <label className="text-xs font-semibold text-text-secondary mb-1 block">Note</label>
                <textarea value={editForm.note} onChange={(e) => setEditForm({ ...editForm, note: e.target.value })} rows={2} className={`${inputClass} resize-none`} />
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-divider">
                <div>
                  {!confirmDelete ? (
                    <button type="button" onClick={() => setConfirmDelete(true)} className="text-sm text-coral font-medium hover:opacity-70 transition-opacity">Elimina contatto</button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={handleDelete} disabled={deleting} className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-coral text-white hover:opacity-80 transition-all disabled:opacity-50">
                        {deleting ? "..." : "Conferma eliminazione"}
                      </button>
                      <button type="button" onClick={() => setConfirmDelete(false)} className="text-sm text-text-secondary hover:text-text-primary transition-colors">Annulla</button>
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={closeEdit} className="px-4 py-2 rounded-xl text-sm text-text-secondary hover:bg-bg-section transition-all">Annulla</button>
                  <button type="submit" disabled={editSaving} className="px-5 py-2 rounded-xl text-sm font-semibold bg-accent text-white hover:bg-accent-hover transition-all disabled:opacity-50">
                    {editSaving ? "..." : "Salva"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
