"use client";

import { useEffect, useState } from "react";
import type { Product } from "@/lib/types/orders";

export default function ProdottiPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categorie, setCategorie] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [categoriaFiltro, setCategoriaFiltro] = useState("");

  useEffect(() => {
    fetchProducts();
  }, []);

  async function fetchProducts() {
    setLoading(true);
    const res = await fetch("/api/products");
    const data = await res.json();
    setProducts(data.products || []);
    setCategorie(data.categorie || []);
    setLoading(false);
  }

  const filtered = products.filter((p) => {
    const matchCat = !categoriaFiltro || p.categoria === categoriaFiltro;
    if (!matchCat) return false;
    const q = search.trim();
    if (!q) return true;
    const tokens = q.toLowerCase().split(/\s+/).filter(Boolean);
    const haystack = `${p.descrizione.toLowerCase()} ${p.codice_amway.toLowerCase()}`;
    return tokens.every((t) => haystack.includes(t));
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-3 border-accent border-t-transparent rounded-full animate-spin" />
          <p className="text-text-secondary text-sm">
            Caricamento catalogo...
          </p>
        </div>
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="bg-bg-card border border-border rounded-2xl p-8 max-w-md text-center">
          <p className="text-2xl mb-3">📦</p>
          <p className="font-semibold text-text-primary mb-2">
            Nessun prodotto nel catalogo
          </p>
          <p className="text-text-secondary text-sm mb-4">
            Importa il listino prezzi Amway per iniziare.
          </p>
          <a
            href="/prodotti/import"
            className="inline-block px-5 py-2.5 rounded-xl text-sm font-semibold bg-accent text-white hover:bg-accent-hover transition-all"
          >
            Importa listino
          </a>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">
            Catalogo Prodotti
          </h2>
          <p className="text-text-secondary text-sm mt-1">
            {products.length} prodotti Amway
          </p>
        </div>
        <a
          href="/prodotti/import"
          className="px-4 py-2.5 rounded-xl text-sm font-semibold bg-accent text-white hover:bg-accent-hover transition-all"
        >
          Aggiorna listino
        </a>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-3 mb-6">
        <div className="relative flex-1 max-w-sm">
          <input
            type="text"
            placeholder="Cerca per nome o codice..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm border border-border bg-bg-card text-text-primary placeholder-text-gentle focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-all"
          />
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-gentle">
            🔍
          </span>
        </div>
        <select
          value={categoriaFiltro}
          onChange={(e) => setCategoriaFiltro(e.target.value)}
          className="px-4 py-2.5 rounded-xl text-sm border border-border bg-bg-card text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/30"
        >
          <option value="">Tutte le categorie</option>
          {categorie.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {/* Results count */}
      <div className="text-xs text-text-secondary mb-3">
        {filtered.length} risultati
      </div>

      {/* Product grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map((p) => (
          <div
            key={p.id}
            className="bg-bg-card border border-border rounded-xl p-4 hover:shadow-md transition-all"
          >
            <div className="flex justify-between items-start mb-2">
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm text-text-primary truncate">
                  {p.descrizione}
                </div>
                <div className="text-xs text-text-secondary mt-0.5">
                  cod. {p.codice_amway}
                  {p.contenuto && ` · ${p.contenuto}`}
                </div>
              </div>
            </div>
            {p.categoria && (
              <div className="text-[10px] text-text-gentle mb-2 truncate">
                {p.categoria}
              </div>
            )}
            <div className="flex justify-between items-end pt-2 border-t border-divider">
              <div>
                <div className="text-xs text-text-secondary">Prezzo cliente</div>
                <div className="font-bold text-text-primary">
                  {"€"}{p.prezzo_cliente.toFixed(2)}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-text-secondary">Prezzo partner</div>
                <div className="font-bold text-accent-hover">
                  {"€"}{p.prezzo_partner.toFixed(2)}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-text-secondary">VP</div>
                <div className="font-bold text-text-primary">
                  {p.punti_vp.toFixed(2)}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
