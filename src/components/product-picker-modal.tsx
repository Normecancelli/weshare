"use client";

import { useEffect, useMemo, useState } from "react";
import type { Product } from "@/lib/types/orders";

interface Props {
  open: boolean;
  initialQuery?: string;
  onClose: () => void;
  onPick: (product: Product) => void;
}

export function ProductPickerModal({ open, initialQuery = "", onClose, onPick }: Props) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(initialQuery);

  useEffect(() => {
    if (!open) return;
    setSearch(initialQuery);
    setLoading(true);
    fetch("/api/products")
      .then((r) => r.json())
      .then((d) => setProducts(d.products || []))
      .finally(() => setLoading(false));
  }, [open, initialQuery]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products.slice(0, 50);
    const tokens = q.split(/\s+/).filter(Boolean);
    return products
      .filter((p) => {
        const hay = `${p.descrizione.toLowerCase()} ${p.codice_amway.toLowerCase()}`;
        return tokens.every((t) => hay.includes(t));
      })
      .slice(0, 50);
  }, [products, search]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/40 z-[60] flex items-start justify-center pt-8 md:pt-16 px-4 overflow-y-auto">
      <div className="bg-bg-card border border-border rounded-2xl w-full max-w-lg shadow-xl mb-8 flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between p-5 border-b border-divider shrink-0">
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-text-primary">Seleziona prodotto</h3>
            <p className="text-xs text-text-secondary mt-0.5">
              Cerca per descrizione o codice
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-bg-section flex items-center justify-center text-text-secondary"
            aria-label="Chiudi"
          >
            ✕
          </button>
        </div>

        <div className="p-5 pb-3 shrink-0">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cerca prodotto..."
            autoFocus
            className="w-full px-4 py-2.5 rounded-xl text-sm border border-border bg-bg-main focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
          />
        </div>

        <div className="flex-1 overflow-y-auto px-3 pb-5">
          {loading ? (
            <div className="py-10 text-center text-sm text-text-secondary">
              Caricamento catalogo...
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-10 text-center text-sm text-text-secondary">
              Nessun prodotto trovato.
            </div>
          ) : (
            <div className="space-y-1">
              {filtered.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    onPick(p);
                    onClose();
                  }}
                  className="w-full text-left flex items-start gap-3 p-2.5 rounded-xl hover:bg-bg-section transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm text-text-primary line-clamp-2">
                      {p.descrizione}
                    </div>
                    <div className="text-[11px] text-text-secondary mt-0.5 flex items-center gap-1.5 flex-wrap">
                      <span className="font-mono">{p.codice_amway}</span>
                      {p.contenuto && (
                        <>
                          <span>·</span>
                          <span>{p.contenuto}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-semibold text-text-primary">
                      €{p.prezzo_cliente.toFixed(2)}
                    </div>
                    <div className="text-[11px] text-accent-hover font-medium">
                      {p.punti_vp.toFixed(2)} VP
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
