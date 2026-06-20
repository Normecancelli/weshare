"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  type Prospect,
  type ProspectStato,
  type ProspectAppointment,
  type ProspectMessage,
  SOURCE_LABELS,
  STATO_LABELS,
  STATO_BADGE,
  SUB_TAG_LABELS,
} from "@/lib/types/prospects";
import { buildGoogleCalendarUrl } from "@/lib/prospects/links";
import { AppointmentFormModal } from "@/components/prospects/appointment-form-modal";
import { MessageTemplateModal } from "@/components/prospects/message-template-modal";
import { ConvertModal } from "@/components/prospects/convert-modal";

const inputClass =
  "w-full px-4 py-2.5 rounded-xl text-sm border border-border bg-bg-main focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent";

export default function ContattoDetailPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();

  const [prospect, setProspect] = useState<Prospect | null>(null);
  const [appointments, setAppointments] = useState<ProspectAppointment[]>([]);
  const [messages, setMessages] = useState<ProspectMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
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

  const [showApptForm, setShowApptForm] = useState(false);
  const [editAppt, setEditAppt] = useState<ProspectAppointment | null>(null);
  const [msgModal, setMsgModal] = useState<"email" | "whatsapp" | null>(null);
  const [showConvert, setShowConvert] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/prospects/${id}`);
    if (!res.ok) {
      setError("Contatto non trovato");
      setLoading(false);
      return;
    }
    const data = await res.json();
    const p: Prospect = data.prospect;
    setProspect(p);
    setForm({
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
    const [aRes, mRes] = await Promise.all([
      fetch(`/api/prospects/${id}/appointments`),
      fetch(`/api/prospects/${id}/messages`),
    ]);
    setAppointments((await aRes.json()).appointments || []);
    setMessages((await mRes.json()).messages || []);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchAll();
  }, [fetchAll]);

  async function handleSave() {
    if (!prospect || !form.nome.trim()) return;
    setSaving(true);
    const payload = {
      ...form,
      sub_tag_follow_up:
        form.stato === "follow_up" ? form.sub_tag_follow_up || null : null,
      sub_tag_custom:
        form.stato === "follow_up" && form.sub_tag_follow_up === "custom"
          ? form.sub_tag_custom
          : null,
      prossima_data_reminder: form.prossima_data_reminder || null,
    };
    const res = await fetch(`/api/prospects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) await fetchAll();
    setSaving(false);
  }

  function formatDateTime(iso: string) {
    return new Date(iso).toLocaleString("it-IT", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-10 h-10 border-3 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !prospect) {
    return (
      <div className="text-center py-12">
        <p className="text-text-secondary text-sm mb-4">{error || "Errore"}</p>
        <button onClick={() => router.push("/contatti")} className="text-accent font-semibold text-sm">
          ← Torna ai contatti
        </button>
      </div>
    );
  }

  return (
    <div>
      <button onClick={() => router.push("/contatti")} className="text-sm text-text-secondary hover:text-text-primary mb-4 transition-colors">
        ← Contatti
      </button>

      <div className="flex items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-accent to-accent-hover flex items-center justify-center text-white text-base font-bold shrink-0">
            {prospect.nome.trim().slice(0, 2).toUpperCase()}
          </div>
          <div>
            <h2 className="text-2xl font-bold tracking-tight">{prospect.nome}</h2>
            <span className={`inline-block mt-1 px-2 py-0.5 rounded-md text-xs font-semibold ${STATO_BADGE[prospect.stato]}`}>
              {STATO_LABELS[prospect.stato]}
            </span>
          </div>
        </div>
        {prospect.convertito_a ? (
          <span className="text-xs font-semibold text-success">
            ✓ Convertito a {prospect.convertito_a}
          </span>
        ) : (
          <button onClick={() => setShowConvert(true)} className="px-4 py-2.5 rounded-xl text-sm font-semibold bg-success text-white hover:opacity-90 transition-all">
            Converti
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-6">
        {/* LEFT: editable info */}
        <div className="bg-bg-card border border-border rounded-2xl p-5 space-y-4">
          <h3 className="text-sm font-bold uppercase tracking-wide text-text-secondary">Dati e pipeline</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-text-secondary mb-1 block">Nome *</label>
              <input type="text" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className="text-xs font-semibold text-text-secondary mb-1 block">Telefono</label>
              <input type="tel" value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className="text-xs font-semibold text-text-secondary mb-1 block">Email</label>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className="text-xs font-semibold text-text-secondary mb-1 block">Città</label>
              <input type="text" value={form.citta} onChange={(e) => setForm({ ...form, citta: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className="text-xs font-semibold text-text-secondary mb-1 block">Provenienza</label>
              <select value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} className={inputClass}>
                {Object.entries(SOURCE_LABELS).map(([k, v]) => (<option key={k} value={k}>{v}</option>))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-text-secondary mb-1 block">Stato pipeline</label>
              <select value={form.stato} onChange={(e) => setForm({ ...form, stato: e.target.value as ProspectStato })} className={inputClass}>
                {Object.entries(STATO_LABELS).map(([k, v]) => (<option key={k} value={k}>{v}</option>))}
              </select>
            </div>
          </div>

          {form.stato === "follow_up" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-divider pt-4">
              <div>
                <label className="text-xs font-semibold text-text-secondary mb-1 block">Motivo follow-up</label>
                <select value={form.sub_tag_follow_up} onChange={(e) => setForm({ ...form, sub_tag_follow_up: e.target.value })} className={inputClass}>
                  <option value="">— seleziona —</option>
                  {Object.entries(SUB_TAG_LABELS).map(([k, v]) => (<option key={k} value={k}>{v}</option>))}
                </select>
              </div>
              {form.sub_tag_follow_up === "custom" && (
                <div>
                  <label className="text-xs font-semibold text-text-secondary mb-1 block">Specifica</label>
                  <input type="text" value={form.sub_tag_custom} onChange={(e) => setForm({ ...form, sub_tag_custom: e.target.value })} className={inputClass} />
                </div>
              )}
              <div>
                <label className="text-xs font-semibold text-text-secondary mb-1 block">Cadenza (giorni)</label>
                <input type="number" min={1} value={form.cadenza_giorni} onChange={(e) => setForm({ ...form, cadenza_giorni: parseInt(e.target.value) || 14 })} className={inputClass} />
              </div>
            </div>
          )}

          <div>
            <label className="text-xs font-semibold text-text-secondary mb-1 block">Prossima azione (data)</label>
            <input type="date" value={form.prossima_data_reminder} onChange={(e) => setForm({ ...form, prossima_data_reminder: e.target.value })} className={inputClass} />
          </div>
          <div>
            <label className="text-xs font-semibold text-text-secondary mb-1 block">Note</label>
            <textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} rows={2} className={`${inputClass} resize-none`} />
          </div>

          {/* Quick message actions */}
          <div className="flex gap-2 border-t border-divider pt-4">
            <button type="button" onClick={() => setMsgModal("email")} className="flex-1 px-3 py-2 rounded-xl text-sm font-semibold bg-bg-section text-text-primary hover:bg-accent-glow transition-all">✉️ Email</button>
            <button type="button" onClick={() => setMsgModal("whatsapp")} className="flex-1 px-3 py-2 rounded-xl text-sm font-semibold bg-[#25D366] text-white hover:opacity-90 transition-all">WhatsApp</button>
          </div>

          <div className="flex justify-end">
            <button type="button" onClick={handleSave} disabled={saving} className="px-5 py-2 rounded-xl text-sm font-semibold bg-accent text-white hover:bg-accent-hover transition-all disabled:opacity-50">
              {saving ? "Salvataggio..." : "Salva modifiche"}
            </button>
          </div>
        </div>

        {/* RIGHT: appointments + messages */}
        <div className="space-y-6">
          <div className="bg-bg-card border border-border rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold uppercase tracking-wide text-text-secondary">Appuntamenti</h3>
              <button type="button" onClick={() => { setEditAppt(null); setShowApptForm(true); }} className="text-sm font-semibold text-accent hover:opacity-70 transition-opacity">+ Nuovo</button>
            </div>
            {appointments.length === 0 ? (
              <p className="text-sm text-text-secondary py-2">Nessun appuntamento.</p>
            ) : (
              <div className="space-y-2">
                {appointments.map((a) => (
                  <div key={a.id} className="p-3 bg-bg-main rounded-xl border-l-4 border-accent">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold text-sm text-text-primary">{a.titolo}</p>
                        <p className="text-xs text-text-secondary">{formatDateTime(a.data_ora)}{a.location ? ` · ${a.location}` : ""}</p>
                      </div>
                      <button type="button" onClick={() => { setEditAppt(a); setShowApptForm(true); }} className="text-xs text-text-secondary hover:text-accent shrink-0">Modifica</button>
                    </div>
                    <a href={buildGoogleCalendarUrl(a)} target="_blank" rel="noopener noreferrer" className="inline-block mt-2 text-xs font-semibold text-accent hover:underline">
                      📅 Aggiungi a Google Calendar
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-bg-card border border-border rounded-2xl p-5">
            <h3 className="text-sm font-bold uppercase tracking-wide text-text-secondary mb-3">Contatti recenti</h3>
            {messages.length === 0 ? (
              <p className="text-sm text-text-secondary py-2">Nessun messaggio inviato.</p>
            ) : (
              <div className="space-y-2">
                {messages.slice(0, 8).map((m) => (
                  <div key={m.id} className="flex items-center gap-3 text-sm">
                    <span className="text-text-gentle">{m.tipo === "email" ? "✉️" : "💬"}</span>
                    <span className="text-text-secondary">{formatDateTime(m.created_at)}</span>
                    {m.template_id && <span className="text-xs text-text-gentle">· {m.template_id}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {showApptForm && (
        <AppointmentFormModal
          prospectId={id}
          appointment={editAppt}
          defaultTitolo={`Appuntamento con ${prospect.nome}`}
          onSaved={fetchAll}
          onClose={() => setShowApptForm(false)}
        />
      )}

      {msgModal && (
        <MessageTemplateModal
          prospectId={id}
          tipo={msgModal}
          nome={prospect.nome}
          email={prospect.email}
          telefono={prospect.telefono}
          onSent={fetchAll}
          onClose={() => setMsgModal(null)}
        />
      )}

      {showConvert && (
        <ConvertModal
          prospect={prospect}
          onConverted={fetchAll}
          onClose={() => setShowConvert(false)}
        />
      )}
    </div>
  );
}
