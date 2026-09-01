"use client";

import { useEffect, useState } from "react";
import { Warehouse } from "lucide-react";
import type { MagazzinoItem } from "@/lib/types/magazzino";

export default function MagazzinoPage() {
  const [items, setItems] = useState<MagazzinoItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/magazzino")
      .then((r) => r.json())
      .then((d) => setItems(d.items || []))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="p-6 text-text-secondary text-sm">Caricamento…</div>;
  }

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-2 mb-6">
        <Warehouse size={22} strokeWidth={1.75} className="text-accent" />
        <h1 className="text-xl font-bold text-text-primary">Stock</h1>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-text-secondary py-8 text-center">
          Nessun prodotto in Stock. Carica Stock creando un ordine per uso personale.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {items.map((item) => (
            <div key={item.id} className="bg-bg-card border border-border rounded-2xl p-4 flex items-center justify-between">
              <div>
                <p className="font-semibold text-sm text-text-primary">{item.product?.descrizione}</p>
                <p className="text-xs text-text-secondary">cod. {item.product?.codice_amway}</p>
              </div>
              <span className="text-lg font-bold text-accent">{item.quantita}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
