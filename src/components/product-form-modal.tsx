"use client";

import { useEffect, useState } from "react";
import { TrashIcon } from "@/components/icons";
import type { Product } from "@/lib/types/orders";
import { extractDirectImageUrl } from "@/lib/products/extract-image-url";

type Mode = "create" | "edit";

interface Props {
  mode: Mode;
  product: Product | null; // null in create mode
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

const inputClass =
  "w-full px-3 py-2 rounded-xl text-sm border border-border bg-bg-main focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent";

export function ProductFormModal({ mode, product, open, onClose, onSaved }: Props) {
  const [form, setForm] = useState({
    codice_amway: "",
    descrizione: "",
    categoria: "",
    contenuto: "",
    prezzo_cliente: "",
    prezzo_partner: "",
    provvigione: "",
    prezzo_unita: "",
    punti_vp: "",
    volume_vv: "",
    image_url: "",
    attivo: true,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError("");
    setConfirmDelete(false);
    if (mode === "edit" && product) {
      setForm({
        codice_amway: product.codice_amway,
        descrizione: product.descrizione,
        categoria: product.categoria || "",
        contenuto: product.contenuto || "",
        prezzo_cliente: String(product.prezzo_cliente),
        prezzo_partner: String(product.prezzo_partner),
        provvigione: String(product.provvigione),
        prezzo_unita: product.prezzo_unita || "",
        punti_vp: String(product.punti_vp),
        volume_vv: String(product.volume_vv),
        image_url: product.image_url || "",
        attivo: product.attivo,
      });
    } else {
      setForm({
        codice_amway: "",
        descrizione: "",
        categoria: "",
        contenuto: "",
        prezzo_cliente: "",
        prezzo_partner: "",
        provvigione: "",
        prezzo_unita: "",
        punti_vp: "",
        volume_vv: "",
        image_url: "",
        attivo: true,
      });
    }
  }, [open, mode, product]);

  if (!open) return null;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.codice_amway.trim() || !form.descrizione.trim()) {
      setError("Codice e descrizione sono obbligatori");
      return;
    }
    setSaving(true);
    setError("");
    const payload = {
      codice_amway: form.codice_amway.trim(),
      descrizione: form.descrizione.trim(),
      categoria: form.categoria.trim() || null,
      contenuto: form.contenuto.trim() || null,
      prezzo_cliente: parseFloat(form.prezzo_cliente || "0"),
      prezzo_partner: parseFloat(form.prezzo_partner || "0"),
      provvigione: parseFloat(form.provvigione || "0"),
      prezzo_unita: form.prezzo_unita.trim() || null,
      punti_vp: parseFloat(form.punti_vp || "0"),
      volume_vv: parseFloat(form.volume_vv || "0"),
      image_url: form.image_url.trim() || null,
      attivo: form.attivo,
    };

    const url = mode === "edit" && product ? `/api/products/${product.id}` : "/api/products";
    const method = mode === "edit" ? "PATCH" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSaving(false);

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Errore salvataggio");
      return;
    }
    onSaved();
    onClose();
  }

  async function handleDelete() {
    if (!product) return;
    setDeleting(true);
    setError("");
    const res = await fetch(`/api/products/${product.id}`, { method: "DELETE" });
    setDeleting(false);
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Errore eliminazione");
      return;
    }
    const data = await res.json();
    if (data.deactivated) {
      alert(data.reason);
    }
    onSaved();
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center pt-8 md:pt-16 px-4 overflow-y-auto">
      <form
        onSubmit={handleSave}
        className="bg-bg-card border border-border rounded-2xl w-full max-w-2xl shadow-xl mb-8"
      >
        <div className="flex items-center justify-between p-5 border-b border-divider">
          <h3 className="text-lg font-bold text-text-primary">
            {mode === "edit" ? "Modifica prodotto" : "Nuovo prodotto"}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-bg-section flex items-center justify-center text-text-secondary"
            aria-label="Chiudi"
          >
            ✕
          </button>
        </div>

        <div className="p-5 space-y-4">
          {error && (
            <div className="bg-coral-soft text-coral text-sm p-3 rounded-xl">{error}</div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-1">
              <label className="text-xs font-semibold text-text-secondary mb-1 block">
                Codice Amway *
              </label>
              <input
                type="text"
                value={form.codice_amway}
                onChange={(e) => setForm({ ...form, codice_amway: e.target.value })}
                required
                placeholder="es. 101593"
                className={`${inputClass} font-mono`}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-semibold text-text-secondary mb-1 block">
                Descrizione *
              </label>
              <input
                type="text"
                value={form.descrizione}
                onChange={(e) => setForm({ ...form, descrizione: e.target.value })}
                required
                placeholder="es. Nutrilite Vitamina C Plus"
                className={inputClass}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-text-secondary mb-1 block">
                Categoria
              </label>
              <input
                type="text"
                value={form.categoria}
                onChange={(e) => setForm({ ...form, categoria: e.target.value })}
                placeholder="es. Difese immunitarie"
                className={inputClass}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-text-secondary mb-1 block">
                Contenuto
              </label>
              <input
                type="text"
                value={form.contenuto}
                onChange={(e) => setForm({ ...form, contenuto: e.target.value })}
                placeholder="es. 60 compresse"
                className={inputClass}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="text-xs font-semibold text-text-secondary mb-1 block">
                Prezzo cliente €
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.prezzo_cliente}
                onChange={(e) => setForm({ ...form, prezzo_cliente: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-text-secondary mb-1 block">
                Prezzo partner €
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.prezzo_partner}
                onChange={(e) => setForm({ ...form, prezzo_partner: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-text-secondary mb-1 block">
                Provvigione €
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.provvigione}
                onChange={(e) => setForm({ ...form, provvigione: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-text-secondary mb-1 block">
                Punti VP
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.punti_vp}
                onChange={(e) => setForm({ ...form, punti_vp: e.target.value })}
                className={inputClass}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-text-secondary mb-1 block">
                Volume VV
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.volume_vv}
                onChange={(e) => setForm({ ...form, volume_vv: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-text-secondary mb-1 block">
                Prezzo per unità (testo)
              </label>
              <input
                type="text"
                value={form.prezzo_unita}
                onChange={(e) => setForm({ ...form, prezzo_unita: e.target.value })}
                placeholder="es. 10,36 / 1 l"
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-text-secondary mb-1 block">
              URL immagine (opzionale)
            </label>
            <input
              type="url"
              value={form.image_url}
              onChange={(e) => setForm({ ...form, image_url: e.target.value })}
              onPaste={(e) => {
                const pasted = e.clipboardData.getData("text");
                const direct = extractDirectImageUrl(pasted);
                if (direct !== pasted) {
                  e.preventDefault();
                  setForm({ ...form, image_url: direct });
                }
              }}
              placeholder="https://..."
              className={inputClass}
            />
          </div>

          {mode === "edit" && (
            <label className="flex items-center gap-2 text-sm text-text-primary">
              <input
                type="checkbox"
                checked={form.attivo}
                onChange={(e) => setForm({ ...form, attivo: e.target.checked })}
                className="w-4 h-4 accent-accent"
              />
              Prodotto attivo (visibile in catalogo e selezionabile sugli ordini)
            </label>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 p-5 border-t border-divider">
          <div>
            {mode === "edit" && !confirmDelete && (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="inline-flex items-center gap-1.5 text-sm text-coral font-medium hover:opacity-70"
              >
                <TrashIcon /> Elimina
              </button>
            )}
            {mode === "edit" && confirmDelete && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-coral text-white hover:opacity-80 disabled:opacity-50"
                >
                  {deleting ? "..." : "Conferma eliminazione"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="text-sm text-text-secondary hover:text-text-primary"
                >
                  Annulla
                </button>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-sm text-text-secondary hover:bg-bg-section transition-all"
            >
              Annulla
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 rounded-xl text-sm font-semibold bg-accent text-white hover:bg-accent-hover transition-all disabled:opacity-50"
            >
              {saving ? "..." : mode === "edit" ? "Salva modifiche" : "Aggiungi prodotto"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
