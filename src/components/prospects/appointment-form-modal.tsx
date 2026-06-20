"use client";

import { useState } from "react";
import type { ProspectAppointment } from "@/lib/types/prospects";

const inputClass =
  "w-full px-4 py-2.5 rounded-xl text-sm border border-border bg-bg-main focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent";

// Format an ISO timestamp to the value a datetime-local input expects.
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60000);
  return local.toISOString().slice(0, 16);
}

type Props = {
  prospectId: string;
  appointment?: ProspectAppointment | null;
  defaultTitolo: string;
  onSaved: () => void;
  onClose: () => void;
};

export function AppointmentFormModal({
  prospectId,
  appointment,
  defaultTitolo,
  onSaved,
  onClose,
}: Props) {
  const isEdit = !!appointment;
  const [form, setForm] = useState({
    titolo: appointment?.titolo || defaultTitolo,
    data_ora: appointment ? toLocalInput(appointment.data_ora) : "",
    durata_min: appointment?.durata_min ?? 60,
    location: appointment?.location || "",
    note: appointment?.note || "",
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.data_ora) return;
    setSaving(true);
    const payload = {
      titolo: form.titolo,
      data_ora: new Date(form.data_ora).toISOString(),
      durata_min: form.durata_min,
      location: form.location,
      note: form.note,
    };
    const url = isEdit
      ? `/api/prospects/${prospectId}/appointments/${appointment!.id}`
      : `/api/prospects/${prospectId}/appointments`;
    const res = await fetch(url, {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      onSaved();
      onClose();
    }
    setSaving(false);
  }

  async function handleDelete() {
    if (!appointment) return;
    setDeleting(true);
    const res = await fetch(
      `/api/prospects/${prospectId}/appointments/${appointment.id}`,
      { method: "DELETE" }
    );
    if (res.ok) {
      onSaved();
      onClose();
    }
    setDeleting(false);
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center pt-8 md:pt-16 px-4 overflow-y-auto">
      <div className="bg-bg-card border border-border rounded-2xl w-full max-w-md shadow-xl mb-8">
        <div className="flex items-center justify-between p-5 border-b border-divider">
          <h3 className="text-lg font-bold text-text-primary">
            {isEdit ? "Modifica appuntamento" : "Nuovo appuntamento"}
          </h3>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-bg-section flex items-center justify-center text-text-secondary transition-all">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="text-xs font-semibold text-text-secondary mb-1 block">Titolo</label>
            <input type="text" value={form.titolo} onChange={(e) => setForm({ ...form, titolo: e.target.value })} className={inputClass} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-text-secondary mb-1 block">Data e ora *</label>
              <input type="datetime-local" required value={form.data_ora} onChange={(e) => setForm({ ...form, data_ora: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className="text-xs font-semibold text-text-secondary mb-1 block">Durata (min)</label>
              <input type="number" min={15} step={15} value={form.durata_min} onChange={(e) => setForm({ ...form, durata_min: parseInt(e.target.value) || 60 })} className={inputClass} />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-text-secondary mb-1 block">Luogo</label>
            <input type="text" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="es. Bar Centrale, Zoom..." className={inputClass} />
          </div>
          <div>
            <label className="text-xs font-semibold text-text-secondary mb-1 block">Note</label>
            <textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} rows={2} className={`${inputClass} resize-none`} />
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-divider">
            <div>
              {isEdit && (
                <button type="button" onClick={handleDelete} disabled={deleting} className="text-sm text-coral font-medium hover:opacity-70 transition-opacity disabled:opacity-50">
                  {deleting ? "..." : "Elimina"}
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-text-secondary hover:bg-bg-section transition-all">Annulla</button>
              <button type="submit" disabled={saving} className="px-5 py-2 rounded-xl text-sm font-semibold bg-accent text-white hover:bg-accent-hover transition-all disabled:opacity-50">
                {saving ? "..." : "Salva"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
