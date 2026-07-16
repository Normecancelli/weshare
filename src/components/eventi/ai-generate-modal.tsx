"use client";

import { useState } from "react";
import { X, Sparkles, RefreshCw } from "lucide-react";
import type { EventModalita, EventVisibilita } from "@/lib/types/events";

type Tono = "formale" | "entusiasta" | "diretto";

interface Variante {
  tono: Tono;
  titolo: string;
  descrizione: string;
}

const TONO_LABELS: Record<Tono, string> = {
  formale: "Formale",
  entusiasta: "Entusiasta",
  diretto: "Diretto",
};

interface AiGenerateModalProps {
  contesto: {
    data_inizio: string;
    location: string;
    modalita: EventModalita | "";
    prezzo: string;
    visibilita: EventVisibilita;
  };
  onApply: (nome: string, descrizione: string) => void;
  onClose: () => void;
}

export function AiGenerateModal({ contesto, onApply, onClose }: AiGenerateModalProps) {
  const [idea, setIdea] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [varianti, setVarianti] = useState<Variante[] | null>(null);

  async function handleGenera() {
    if (!idea.trim()) {
      setError("Descrivi l'evento in poche parole.");
      return;
    }
    setError(null);
    setLoading(true);
    setVarianti(null);
    try {
      const res = await fetch("/api/events/generate-description", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idea: idea.trim(),
          contesto: {
            data_inizio: contesto.data_inizio
              ? new Date(contesto.data_inizio).toISOString()
              : undefined,
            location: contesto.location || undefined,
            modalita: contesto.modalita || undefined,
            prezzo: contesto.prezzo ? Number(contesto.prezzo) : undefined,
            visibilita: contesto.visibilita,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Errore durante la generazione.");
        return;
      }
      setVarianti(data.varianti);
    } catch {
      setError("Errore di rete. Riprova.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-divider">
          <h3 className="font-semibold text-text-primary flex items-center gap-2">
            <Sparkles size={16} strokeWidth={1.75} className="text-accent" />
            Genera con AI
          </h3>
          <button onClick={onClose} className="text-text-secondary hover:text-text-primary">
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wide mb-1">
              Descrivi l&apos;evento in poche parole
            </label>
            <textarea
              className="w-full px-4 py-2.5 rounded-xl text-sm border border-border bg-bg-main focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
              rows={2}
              placeholder="es. serata formazione prodotti SA8, aperta a tutto il gruppo"
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
            />
          </div>

          {error && (
            <div className="bg-[#fee2e2] text-[#991b1b] text-sm px-4 py-2.5 rounded-xl">
              {error}
            </div>
          )}

          <button
            type="button"
            disabled={loading}
            onClick={handleGenera}
            className="w-full flex items-center justify-center gap-2 bg-accent hover:bg-accent-hover text-white font-semibold px-4 py-2.5 rounded-xl text-sm transition-colors disabled:opacity-50"
          >
            {varianti ? (
              <RefreshCw size={14} strokeWidth={1.75} />
            ) : (
              <Sparkles size={14} strokeWidth={1.75} />
            )}
            {loading ? "Generazione…" : varianti ? "Rigenera" : "Genera"}
          </button>

          {varianti && (
            <div className="space-y-3 pt-2">
              {varianti.map((v) => (
                <div key={v.tono} className="border border-divider rounded-xl p-3 space-y-1.5">
                  <span className="text-xs font-semibold text-accent uppercase tracking-wide">
                    {TONO_LABELS[v.tono]}
                  </span>
                  <p className="text-sm font-semibold text-text-primary">{v.titolo}</p>
                  <p className="text-sm text-text-secondary">{v.descrizione}</p>
                  <button
                    type="button"
                    onClick={() => onApply(v.titolo, v.descrizione)}
                    className="text-xs font-medium text-accent hover:underline"
                  >
                    Usa questa
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
