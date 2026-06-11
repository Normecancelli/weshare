"use client";

import { useEffect, useMemo, useState } from "react";
import type { Customer, Product } from "@/lib/types/orders";

interface Props {
  product: Product | null;
  onClose: () => void;
}

export function AddToOrderModal({ product, onClose }: Props) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [result, setResult] = useState<{ order_id: string; created: boolean; customer_name: string } | null>(null);

  useEffect(() => {
    if (!product) return;
    setLoading(true);
    setSearch("");
    setResult(null);
    fetch("/api/customers")
      .then((r) => r.json())
      .then((d) => setCustomers(d.customers || []))
      .finally(() => setLoading(false));
  }, [product]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter((c) => {
      const hay = `${c.nome} ${c.cognome || ""} ${c.telefono || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [customers, search]);

  async function handlePick(c: Customer) {
    if (!product) return;
    setSubmitting(c.id);
    const res = await fetch("/api/client-orders/add-item", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customer_id: c.id, product_id: product.id, quantita: 1 }),
    });
    setSubmitting(null);
    if (!res.ok) {
      const data = await res.json();
      alert(data.error || "Errore");
      return;
    }
    const data = await res.json();
    setResult({
      order_id: data.order_id,
      created: data.created,
      customer_name: `${c.nome}${c.cognome ? " " + c.cognome : ""}`,
    });
  }

  if (!product) return null;

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center pt-8 md:pt-16 px-4 overflow-y-auto">
      <div className="bg-bg-card border border-border rounded-2xl w-full max-w-md shadow-xl mb-8">
        <div className="flex items-center justify-between p-5 border-b border-divider">
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-text-primary">Carica su ordine</h3>
            <p className="text-xs text-text-secondary mt-0.5 truncate" title={product.descrizione}>
              {product.descrizione}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-bg-section flex items-center justify-center text-text-secondary shrink-0"
            aria-label="Chiudi"
          >
            ✕
          </button>
        </div>

        {result ? (
          <div className="p-5 space-y-4">
            <div className="bg-accent-glow text-accent-hover text-sm p-4 rounded-xl">
              <div className="font-semibold mb-1">
                {result.created ? "Nuova bozza creata" : "Aggiunto a bozza esistente"} per {result.customer_name}
              </div>
              <p className="text-xs text-text-secondary">
                Vai alla bozza per modificare quantità o aggiungere altri prodotti.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold border border-border text-text-primary hover:bg-bg-section transition-all"
              >
                Continua a sfogliare
              </button>
              <a
                href={`/ordini-clienti/${result.order_id}`}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-accent text-white hover:bg-accent-hover transition-all text-center"
              >
                Vai alla bozza
              </a>
            </div>
          </div>
        ) : (
          <div className="p-5">
            <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wide mb-2">
              Cerca cliente
            </label>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Nome, cognome o telefono..."
              autoFocus
              className="w-full px-4 py-2.5 rounded-xl text-sm border border-border bg-bg-main focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent mb-3"
            />

            {loading ? (
              <div className="py-8 text-center text-sm text-text-secondary">Caricamento...</div>
            ) : customers.length === 0 ? (
              <div className="py-8 text-center text-sm text-text-secondary">
                Nessun cliente. Aggiungine uno dalla pagina "I miei Clienti".
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-8 text-center text-sm text-text-secondary">
                Nessun cliente trovato.
              </div>
            ) : (
              <div className="space-y-1.5 max-h-72 overflow-y-auto -mx-1 px-1">
                {filtered.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => handlePick(c)}
                    disabled={submitting === c.id}
                    className="w-full text-left flex items-center gap-3 p-2.5 rounded-xl hover:bg-bg-section disabled:opacity-50 transition-colors"
                  >
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-accent to-accent-hover flex items-center justify-center text-white text-xs font-bold shrink-0">
                      {(c.nome[0] || "?").toUpperCase()}
                      {(c.cognome?.[0] || "").toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm text-text-primary truncate">
                        {c.nome} {c.cognome}
                      </div>
                      {c.telefono && (
                        <div className="text-xs text-text-secondary truncate">
                          {c.telefono}
                        </div>
                      )}
                    </div>
                    {submitting === c.id && (
                      <span className="text-xs text-text-secondary">...</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
