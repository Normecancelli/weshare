"use client";

import { useEffect, useState } from "react";
import type { Product } from "@/lib/types/orders";
import { AddToOrderModal } from "@/components/add-to-order-modal";
import { ProductFormModal } from "@/components/product-form-modal";
import { EditIcon } from "@/components/icons";

export default function ProdottiPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categorie, setCategorie] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [categoriaFiltro, setCategoriaFiltro] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [orderTarget, setOrderTarget] = useState<Product | null>(null);
  const [formMode, setFormMode] = useState<"create" | "edit" | null>(null);
  const [editProduct, setEditProduct] = useState<Product | null>(null);

  useEffect(() => {
    fetchProducts();
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setIsAdmin(!!d.isAdmin))
      .catch(() => setIsAdmin(false));
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
            {isAdmin
              ? "Importa il listino prezzi Amway per iniziare."
              : "Il listino prezzi non è ancora stato caricato. Contatta il referente WeShare."}
          </p>
          {isAdmin && (
            <a
              href="/prodotti/import"
              className="inline-block px-5 py-2.5 rounded-xl text-sm font-semibold bg-accent text-white hover:bg-accent-hover transition-all"
            >
              Importa listino
            </a>
          )}
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
        {isAdmin && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setEditProduct(null);
                setFormMode("create");
              }}
              className="px-4 py-2.5 rounded-xl text-sm font-semibold border border-border text-text-primary hover:bg-bg-section transition-all"
            >
              + Nuovo prodotto
            </button>
            <a
              href="/prodotti/import"
              className="px-4 py-2.5 rounded-xl text-sm font-semibold bg-accent text-white hover:bg-accent-hover transition-all"
            >
              Aggiorna listino
            </a>
          </div>
        )}
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

      {/* MOBILE: card grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:hidden">
        {filtered.map((p) => (
          <div
            key={p.id}
            className="bg-bg-card border border-border rounded-xl p-3.5 flex flex-col hover:shadow-md hover:border-accent/30 transition-all"
          >
            <div className="flex gap-3 mb-3">
              <ProductThumb product={p} size={48} />
              <div className="flex-1 min-w-0">
                <div
                  className="font-semibold text-sm text-text-primary leading-snug line-clamp-2"
                  title={p.descrizione}
                >
                  {p.descrizione}
                </div>
                <div className="text-[11px] text-text-gentle mt-1 flex items-center gap-1.5 flex-wrap">
                  <span className="font-mono">{p.codice_amway}</span>
                  {p.contenuto && (
                    <>
                      <span>·</span>
                      <span>{p.contenuto}</span>
                    </>
                  )}
                </div>
                {p.categoria && (
                  <div className="inline-block text-[10px] text-text-secondary bg-bg-section px-2 py-0.5 rounded-full mt-2 max-w-full truncate">
                    {p.categoria}
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-baseline justify-between pt-2.5 border-t border-divider gap-3">
              <div className="min-w-0">
                <div className="text-lg font-bold text-text-primary leading-none">
                  €{p.prezzo_cliente.toFixed(2)}
                </div>
                <div className="text-[10px] text-text-gentle mt-0.5 uppercase tracking-wide">
                  cliente
                </div>
              </div>
              <div className="text-right min-w-0">
                <div className="text-sm font-semibold text-accent-hover leading-none">
                  €{p.prezzo_partner.toFixed(2)}
                </div>
                <div className="text-[10px] text-text-gentle mt-0.5 uppercase tracking-wide">
                  partner
                </div>
              </div>
              <div className="shrink-0 bg-accent-glow text-accent-hover text-xs font-bold px-2 py-1 rounded-md whitespace-nowrap">
                {p.punti_vp.toFixed(2)} VP
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => setOrderTarget(p)}
                className="flex-1 py-2 rounded-xl text-sm font-semibold bg-accent text-white hover:bg-accent-hover transition-all"
              >
                + Carica su ordine
              </button>
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => {
                    setEditProduct(p);
                    setFormMode("edit");
                  }}
                  className="px-3 py-2 rounded-xl text-sm border border-border text-text-secondary hover:bg-bg-section hover:text-accent transition-all"
                  title="Modifica prodotto"
                  aria-label="Modifica prodotto"
                >
                  <EditIcon />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* DESKTOP: spreadsheet table */}
      <div className="hidden md:block bg-bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-bg-section border-b border-border">
              <tr className="text-left text-[11px] uppercase tracking-wider text-text-secondary">
                <th className="px-2 py-2.5 font-semibold w-12"></th>
                <th className="px-3 py-2.5 font-semibold w-20">Codice</th>
                <th className="px-3 py-2.5 font-semibold">Descrizione</th>
                <th className="px-3 py-2.5 font-semibold w-24 hidden lg:table-cell">Categoria</th>
                <th className="px-3 py-2.5 font-semibold w-20 hidden lg:table-cell">Contenuto</th>
                <th className="px-3 py-2.5 font-semibold text-right w-24">Cliente</th>
                <th className="px-3 py-2.5 font-semibold text-right w-24">Partner</th>
                <th className="px-3 py-2.5 font-semibold text-right w-16">VP</th>
                <th className="px-3 py-2.5 font-semibold w-36"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p, i) => (
                <tr
                  key={p.id}
                  className={`border-b border-divider last:border-b-0 hover:bg-bg-section/60 transition-colors ${
                    i % 2 === 0 ? "bg-transparent" : "bg-bg-main/40"
                  }`}
                >
                  <td className="px-2 py-1.5">
                    <ProductThumb product={p} size={36} />
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs text-text-secondary whitespace-nowrap">
                    {p.codice_amway}
                  </td>
                  <td className="px-3 py-2.5 font-medium text-text-primary">
                    <div className="leading-snug" title={p.descrizione}>
                      {p.descrizione}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-text-secondary hidden lg:table-cell">
                    <span
                      className="truncate inline-block max-w-full"
                      title={p.categoria || ""}
                    >
                      {p.categoria || "—"}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-text-secondary hidden lg:table-cell whitespace-nowrap">
                    {p.contenuto || "—"}
                  </td>
                  <td className="px-3 py-2.5 font-semibold text-right text-text-primary whitespace-nowrap">
                    €{p.prezzo_cliente.toFixed(2)}
                  </td>
                  <td className="px-3 py-2.5 font-semibold text-right text-accent-hover whitespace-nowrap">
                    €{p.prezzo_partner.toFixed(2)}
                  </td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap">
                    <span className="bg-accent-glow text-accent-hover text-[11px] font-bold px-2 py-0.5 rounded-md">
                      {p.punti_vp.toFixed(2)}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    <div className="flex items-center gap-1.5 justify-end">
                      <button
                        type="button"
                        onClick={() => setOrderTarget(p)}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-accent text-white hover:bg-accent-hover transition-all whitespace-nowrap"
                      >
                        + Carica
                      </button>
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditProduct(p);
                            setFormMode("edit");
                          }}
                          className="w-7 h-7 rounded-md hover:bg-bg-section flex items-center justify-center text-text-gentle hover:text-accent transition-all"
                          title="Modifica prodotto"
                          aria-label="Modifica prodotto"
                        >
                          <EditIcon />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <AddToOrderModal product={orderTarget} onClose={() => setOrderTarget(null)} />

      <ProductFormModal
        mode={formMode || "create"}
        product={editProduct}
        open={formMode !== null}
        onClose={() => {
          setFormMode(null);
          setEditProduct(null);
        }}
        onSaved={fetchProducts}
      />
    </div>
  );
}

function ProductThumb({ product, size }: { product: Product; size: number }) {
  if (product.image_url) {
    return (
      <img
        src={product.image_url}
        alt=""
        width={size}
        height={size}
        className="rounded-lg object-cover bg-bg-section border border-divider"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className="rounded-lg bg-bg-section border border-divider flex items-center justify-center text-text-gentle"
      style={{ width: size, height: size }}
      aria-label="Nessuna immagine"
    >
      <svg width={Math.round(size * 0.45)} height={Math.round(size * 0.45)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <path d="M21 15l-5-5L5 21" />
      </svg>
    </div>
  );
}
