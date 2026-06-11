"use client";

import { useState } from "react";

interface ExtractedMatch {
  product_id: string;
  codice_amway: string;
  descrizione: string;
  contenuto: string | null;
  quantita: number;
  matched_text: string;
  confidence: "alta" | "media" | "bassa";
  note: string | null;
  // local UI state
  selected: boolean;
}

interface ParseResponse {
  matches: Omit<ExtractedMatch, "selected">[];
  unmatched: string[];
}

export interface ExtractedItem {
  product_id: string;
  codice_amway: string;
  descrizione: string;
  contenuto: string | null;
  quantita: number;
}

interface Props {
  // Chiamato quando l'utente conferma il batch. Il parent decide se
  // aggiungere localmente al carrello (nuovo ordine) o postare al
  // server (bozza esistente). Può essere async.
  onAddItems: (items: ExtractedItem[]) => Promise<void> | void;
}

type ImageMedia = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

interface AttachedImage {
  data: string; // base64 senza prefisso data:
  media_type: ImageMedia;
  preview: string; // dataURL per anteprima
}

export function WhatsAppExtractor({ onAddItems }: Props) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [image, setImage] = useState<AttachedImage | null>(null);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState("");
  const [matches, setMatches] = useState<ExtractedMatch[]>([]);
  const [unmatched, setUnmatched] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const [addedSummary, setAddedSummary] = useState<string | null>(null);

  async function handlePickImage(file: File) {
    setError("");
    const allowed: Record<string, ImageMedia> = {
      "image/jpeg": "image/jpeg",
      "image/jpg": "image/jpeg",
      "image/png": "image/png",
      "image/gif": "image/gif",
      "image/webp": "image/webp",
    };
    const media_type = allowed[file.type];
    if (!media_type) {
      setError("Formato immagine non supportato (usa JPG, PNG, GIF o WEBP).");
      return;
    }
    if (file.size > 5_000_000) {
      setError("Immagine troppo grande (max 5 MB).");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(",")[1] || "";
      setImage({ data: base64, media_type, preview: dataUrl });
    };
    reader.readAsDataURL(file);
  }

  async function handleParse() {
    setParsing(true);
    setError("");
    setMatches([]);
    setUnmatched([]);
    setAddedSummary(null);
    try {
      const res = await fetch("/api/orders/parse-whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: message.trim() || undefined,
          image: image
            ? { data: image.data, media_type: image.media_type }
            : undefined,
        }),
      });
      const data = (await res.json()) as ParseResponse & { error?: string };
      if (!res.ok) {
        setError(data.error || "Errore estrazione");
        return;
      }
      setMatches(data.matches.map((m) => ({ ...m, selected: true })));
      setUnmatched(data.unmatched || []);
    } catch {
      setError("Errore di rete. Riprova.");
    } finally {
      setParsing(false);
    }
  }

  function updateMatch(i: number, patch: Partial<ExtractedMatch>) {
    setMatches((prev) => prev.map((m, idx) => (idx === i ? { ...m, ...patch } : m)));
  }

  async function handleAdd() {
    const toAdd = matches.filter((m) => m.selected && m.quantita >= 1);
    if (toAdd.length === 0) {
      setError("Seleziona almeno un articolo");
      return;
    }
    setAdding(true);
    setError("");
    try {
      await onAddItems(
        toAdd.map((m) => ({
          product_id: m.product_id,
          codice_amway: m.codice_amway,
          descrizione: m.descrizione,
          contenuto: m.contenuto,
          quantita: m.quantita,
        })),
      );
      setAddedSummary(
        `${toAdd.length} articol${toAdd.length === 1 ? "o" : "i"} aggiunt${toAdd.length === 1 ? "o" : "i"} all'ordine`,
      );
      setMatches([]);
      setUnmatched([]);
      setMessage("");
      setImage(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore inserimento articoli");
    } finally {
      setAdding(false);
    }
  }

  return (
    <section className="bg-bg-card border border-border rounded-2xl p-5 mb-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between text-left"
      >
        <div className="flex items-center gap-2">
          <span className="w-8 h-8 rounded-full bg-[#25D366]/15 text-[#1B7F46] flex items-center justify-center text-base">
            ✨
          </span>
          <div>
            <div className="text-sm font-semibold text-text-primary">
              Estrai ordine da WhatsApp
            </div>
            <div className="text-[11px] text-text-secondary">
              Incolla il messaggio del cliente, l&apos;AI riconosce i prodotti
            </div>
          </div>
        </div>
        <span className="text-text-secondary text-sm">{open ? "−" : "+"}</span>
      </button>

      {open && (
        <div className="mt-4 space-y-3">
          {addedSummary && (
            <div className="bg-accent-glow text-accent-hover text-sm p-3 rounded-xl">
              ✓ {addedSummary}
            </div>
          )}

          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            placeholder='Es. "Mi ordini per favore nr.1 SA8 candeggiante, 1 omega 3 e una pre-wash spray. Grazie!"'
            className="w-full px-3 py-2.5 rounded-xl text-sm border border-border bg-bg-main focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent resize-none"
            disabled={parsing || adding}
          />

          <div className="flex items-center gap-3">
            <label
              className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium border border-border bg-bg-main hover:bg-bg-section cursor-pointer transition-all ${
                parsing || adding ? "opacity-50 pointer-events-none" : ""
              }`}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <path d="M21 15l-5-5L5 21" />
              </svg>
              {image ? "Cambia immagine" : "Allega screenshot/foto"}
              <input
                type="file"
                accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handlePickImage(file);
                  e.target.value = "";
                }}
                className="hidden"
              />
            </label>
            {image && (
              <button
                type="button"
                onClick={() => setImage(null)}
                disabled={parsing || adding}
                className="text-xs text-coral hover:underline"
              >
                Rimuovi
              </button>
            )}
            <span className="text-[11px] text-text-gentle ml-auto">
              JPG · PNG · max 5 MB
            </span>
          </div>

          {image && (
            <div className="relative inline-block rounded-xl overflow-hidden border border-border max-w-[200px]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={image.preview}
                alt="Anteprima"
                className="block w-full h-auto"
              />
            </div>
          )}

          {error && (
            <div className="bg-coral-soft text-coral text-xs p-2.5 rounded-xl">{error}</div>
          )}

          {matches.length === 0 && (
            <button
              type="button"
              onClick={handleParse}
              disabled={parsing || (!message.trim() && !image)}
              className="w-full py-2.5 rounded-xl text-sm font-semibold bg-accent text-white hover:bg-accent-hover transition-all disabled:opacity-50"
            >
              {parsing ? "Analisi in corso..." : "Estrai prodotti"}
            </button>
          )}

          {matches.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
                Prodotti riconosciuti ({matches.filter((m) => m.selected).length}/{matches.length})
              </div>
              {matches.map((m, i) => (
                <div
                  key={i}
                  className={`flex items-start gap-3 p-3 rounded-xl border ${
                    m.confidence === "bassa"
                      ? "border-coral/50 bg-coral-soft/40"
                      : m.confidence === "media"
                        ? "border-accent/40 bg-accent-glow/50"
                        : "border-border bg-bg-main"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={m.selected}
                    onChange={(e) => updateMatch(i, { selected: e.target.checked })}
                    className="mt-1 w-4 h-4 accent-accent shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm text-text-primary line-clamp-2">
                      {m.descrizione}
                    </div>
                    <div className="text-[11px] text-text-secondary mt-0.5 flex items-center gap-1.5 flex-wrap">
                      <span className="font-mono">{m.codice_amway}</span>
                      {m.contenuto && (
                        <>
                          <span>·</span>
                          <span>{m.contenuto}</span>
                        </>
                      )}
                      <span>·</span>
                      <span
                        className={
                          m.confidence === "bassa"
                            ? "text-coral font-semibold"
                            : m.confidence === "media"
                              ? "text-accent-hover font-semibold"
                              : "text-text-gentle"
                        }
                      >
                        match {m.confidence}
                      </span>
                    </div>
                    <div className="text-[11px] text-text-gentle mt-0.5 italic">
                      da: &ldquo;{m.matched_text}&rdquo;
                      {m.note && ` · ${m.note}`}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 bg-bg-card border border-border rounded-lg p-0.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => updateMatch(i, { quantita: Math.max(1, m.quantita - 1) })}
                      className="w-7 h-7 rounded-md hover:bg-bg-section flex items-center justify-center text-text-secondary"
                      aria-label="−"
                    >
                      −
                    </button>
                    <input
                      type="number"
                      min={1}
                      value={m.quantita}
                      onChange={(e) => {
                        const v = parseInt(e.target.value);
                        if (!isNaN(v) && v >= 1) updateMatch(i, { quantita: v });
                      }}
                      className="w-10 text-center text-sm font-semibold bg-transparent focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    />
                    <button
                      type="button"
                      onClick={() => updateMatch(i, { quantita: m.quantita + 1 })}
                      className="w-7 h-7 rounded-md hover:bg-bg-section flex items-center justify-center text-text-secondary"
                      aria-label="+"
                    >
                      +
                    </button>
                  </div>
                </div>
              ))}

              {unmatched.length > 0 && (
                <div className="bg-bg-section/60 border border-border rounded-xl p-3">
                  <div className="text-xs font-semibold text-text-secondary mb-1">
                    Non riconosciuto
                  </div>
                  <div className="text-xs text-text-secondary">
                    {unmatched.map((u, i) => (
                      <span key={i} className="inline-block mr-2 mb-1 bg-bg-card px-2 py-0.5 rounded-md">
                        {u}
                      </span>
                    ))}
                  </div>
                  <div className="text-[11px] text-text-gentle mt-1.5">
                    Aggiungili manualmente dal catalogo prodotti.
                  </div>
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setMatches([]);
                    setUnmatched([]);
                  }}
                  disabled={adding}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold border border-border text-text-primary hover:bg-bg-section transition-all disabled:opacity-50"
                >
                  Riprova
                </button>
                <button
                  type="button"
                  onClick={handleAdd}
                  disabled={adding || matches.filter((m) => m.selected).length === 0}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-accent text-white hover:bg-accent-hover transition-all disabled:opacity-50"
                >
                  {adding ? "Aggiungo..." : "Aggiungi all'ordine"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
