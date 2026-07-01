"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Upload, X } from "lucide-react";
import type { Evento, EventModalita, EventVisibilita } from "@/lib/types/events";

const inputClass =
  "w-full px-4 py-2.5 rounded-xl text-sm border border-border bg-bg-main focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent";
const labelClass = "block text-xs font-semibold text-text-secondary uppercase tracking-wide mb-1";

interface EventFormProps {
  initial?: Partial<Evento>;
  onSubmit: (data: Partial<Evento>) => Promise<{ id: string }>;
  submitLabel: string;
}

async function resizeImage(file: File, maxPx = 1200): Promise<Blob> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((b) => resolve(b!), "image/jpeg", 0.85);
    };
    img.src = URL.createObjectURL(file);
  });
}

export function EventForm({ initial, onSubmit, submitLabel }: EventFormProps) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(initial?.locandina_url || null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [form, setForm] = useState({
    nome: initial?.nome || "",
    descrizione: initial?.descrizione || "",
    data_inizio: initial?.data_inizio ? initial.data_inizio.slice(0, 16) : "",
    data_fine: initial?.data_fine ? initial.data_fine.slice(0, 16) : "",
    location: initial?.location || "",
    location_url: initial?.location_url || "",
    modalita: (initial?.modalita || "") as EventModalita | "",
    capienza_max: initial?.capienza_max?.toString() || "",
    prezzo: initial?.prezzo?.toString() || "",
    link_prenotazione: initial?.link_prenotazione || "",
    link_evento: initial?.link_evento || "",
    visibilita: (initial?.visibilita || "gruppo") as EventVisibilita,
    platino_id: initial?.platino_id || "",
    testo_reminder: initial?.testo_reminder || "",
  });

  function set(key: string, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleCoverChange(file: File) {
    const resized = await resizeImage(file);
    const preview = URL.createObjectURL(resized);
    setCoverPreview(preview);
    setCoverFile(new File([resized], "cover.jpg", { type: "image/jpeg" }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.nome.trim() || !form.data_inizio) {
      setError("Nome e data di inizio sono obbligatori.");
      return;
    }
    setSaving(true);
    try {
      const payload: Partial<Evento> = {
        nome: form.nome.trim(),
        descrizione: form.descrizione.trim() || null,
        data_inizio: new Date(form.data_inizio).toISOString(),
        data_fine: form.data_fine ? new Date(form.data_fine).toISOString() : null,
        location: form.location.trim() || null,
        location_url: form.location_url.trim() || null,
        modalita: (form.modalita || null) as EventModalita | null,
        capienza_max: form.capienza_max ? Number(form.capienza_max) : null,
        prezzo: form.prezzo ? Number(form.prezzo) : null,
        link_prenotazione: form.link_prenotazione.trim() || null,
        link_evento: form.link_evento.trim() || null,
        visibilita: form.visibilita,
        platino_id: form.platino_id || null,
        testo_reminder: form.testo_reminder.trim() || null,
      };

      const { id } = await onSubmit(payload);

      // Upload locandina se presente
      if (coverFile) {
        const fd = new FormData();
        fd.append("file", coverFile);
        await fetch(`/api/events/${id}/cover`, { method: "POST", body: fd });
      }

      router.push(`/eventi/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Si è verificato un errore.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Locandina */}
      <div>
        <label className={labelClass}>Locandina</label>
        {coverPreview ? (
          <div className="relative w-full max-w-sm">
            <img src={coverPreview} className="w-full rounded-xl object-cover max-h-48" alt="Preview" />
            <button
              type="button"
              onClick={() => { setCoverPreview(null); setCoverFile(null); }}
              className="absolute top-2 right-2 bg-white rounded-full p-1 shadow"
            >
              <X size={14} strokeWidth={2} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="w-full max-w-sm h-32 border-2 border-dashed border-border rounded-xl flex flex-col items-center justify-center gap-2 text-text-secondary hover:border-accent/50 transition-colors"
          >
            <Upload size={20} strokeWidth={1.75} />
            <span className="text-xs">Clicca o trascina un&apos;immagine</span>
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && handleCoverChange(e.target.files[0])}
        />
      </div>

      {/* Nome */}
      <div>
        <label className={labelClass}>Nome evento *</label>
        <input className={inputClass} value={form.nome} onChange={(e) => set("nome", e.target.value)} required />
      </div>

      {/* Descrizione */}
      <div>
        <label className={labelClass}>Descrizione</label>
        <textarea className={inputClass} rows={3} value={form.descrizione} onChange={(e) => set("descrizione", e.target.value)} />
      </div>

      {/* Date */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Data e ora inizio *</label>
          <input type="datetime-local" className={inputClass} value={form.data_inizio} onChange={(e) => set("data_inizio", e.target.value)} required />
        </div>
        <div>
          <label className={labelClass}>Data e ora fine</label>
          <input type="datetime-local" className={inputClass} value={form.data_fine} onChange={(e) => set("data_fine", e.target.value)} />
        </div>
      </div>

      {/* Location */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Luogo</label>
          <input className={inputClass} placeholder="es. Hotel Milano, Sala A" value={form.location} onChange={(e) => set("location", e.target.value)} />
        </div>
        <div>
          <label className={labelClass}>Link Maps</label>
          <input className={inputClass} type="url" placeholder="https://maps.google.com/..." value={form.location_url} onChange={(e) => set("location_url", e.target.value)} />
        </div>
      </div>

      {/* Modalità + Capienza */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className={labelClass}>Modalità</label>
          <select className={inputClass} value={form.modalita} onChange={(e) => set("modalita", e.target.value)}>
            <option value="">— Seleziona —</option>
            <option value="presenza">In presenza</option>
            <option value="online">Online</option>
            <option value="hybrid">Ibrido</option>
          </select>
        </div>
        <div>
          <label className={labelClass}>Capienza max</label>
          <input className={inputClass} type="number" min={1} value={form.capienza_max} onChange={(e) => set("capienza_max", e.target.value)} />
        </div>
        <div>
          <label className={labelClass}>Prezzo (€)</label>
          <input className={inputClass} type="number" min={0} step={0.01} value={form.prezzo} onChange={(e) => set("prezzo", e.target.value)} />
        </div>
      </div>

      {/* Link */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Link prenotazione</label>
          <input className={inputClass} type="url" placeholder="https://..." value={form.link_prenotazione} onChange={(e) => set("link_prenotazione", e.target.value)} />
        </div>
        <div>
          <label className={labelClass}>Link evento (Zoom/Meet)</label>
          <input className={inputClass} type="url" placeholder="https://zoom.us/..." value={form.link_evento} onChange={(e) => set("link_evento", e.target.value)} />
        </div>
      </div>

      {/* Visibilità */}
      <div>
        <label className={labelClass}>Visibilità</label>
        <div className="flex gap-3">
          {(["globale", "gruppo"] as EventVisibilita[]).map((v) => (
            <label key={v} className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="visibilita"
                value={v}
                checked={form.visibilita === v}
                onChange={() => set("visibilita", v)}
                className="accent-accent"
              />
              <span className="text-sm text-text-primary">
                {v === "globale" ? "Tutti" : "Solo il mio gruppo"}
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* Testo reminder personalizzato */}
      <div>
        <label className={labelClass}>Messaggio personalizzato nei reminder</label>
        <textarea
          className={inputClass}
          rows={2}
          placeholder="Es: Ricordati di portare il catalogo e i campioni SA8!"
          value={form.testo_reminder}
          onChange={(e) => set("testo_reminder", e.target.value)}
        />
        <p className="text-xs text-text-secondary mt-1">Verrà aggiunto in evidenza nelle email di reminder.</p>
      </div>

      {error && (
        <div className="bg-[#fee2e2] text-[#991b1b] text-sm px-4 py-2.5 rounded-xl">
          {error}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={saving}
          className="bg-accent hover:bg-accent-hover text-white font-semibold px-6 py-2.5 rounded-xl text-sm transition-colors disabled:opacity-50"
        >
          {saving ? "Salvataggio…" : submitLabel}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="text-text-secondary hover:text-text-primary text-sm px-4 py-2.5 rounded-xl border border-border transition-colors"
        >
          Annulla
        </button>
      </div>
    </form>
  );
}
