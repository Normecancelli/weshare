"use client";

import { useState, useRef, useEffect } from "react";
import type { Product } from "@/lib/types/orders";

interface ProductSearchProps {
  products: Product[];
  onSelect: (product: Product) => void;
  placeholder?: string;
  stockMap?: Record<string, number>;
}

export function ProductSearch({
  products,
  onSelect,
  placeholder = "Cerca per nome o codice...",
  stockMap = {},
}: ProductSearchProps) {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered =
    query.trim().length < 1
      ? []
      : (() => {
          const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
          return products
            .filter((p) => {
              const haystack = `${p.descrizione.toLowerCase()} ${p.codice_amway.toLowerCase()}`;
              return tokens.every((t) => haystack.includes(t));
            })
            .slice(0, 8);
        })();

  useEffect(() => {
    setHighlighted(0);
  }, [query]);

  function handleSelect(product: Product) {
    onSelect(product);
    setQuery("");
    setIsOpen(false);
    inputRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!isOpen || filtered.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      handleSelect(filtered[highlighted]);
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  }

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        listRef.current &&
        !listRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setIsOpen(true);
        }}
        onFocus={() => query.trim().length >= 1 && setIsOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="w-full pl-10 pr-4 py-3 rounded-xl text-sm border-2 border-border bg-bg-card text-text-primary placeholder-text-gentle focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-all"
      />
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-gentle text-base">
        🔍
      </span>

      {isOpen && filtered.length > 0 && (
        <div
          ref={listRef}
          className="absolute top-full left-0 right-0 mt-1 bg-bg-card border border-border rounded-xl shadow-lg z-50 max-h-64 overflow-y-auto"
        >
          {filtered.map((product, i) => (
            <button
              key={product.id}
              onClick={() => handleSelect(product)}
              className={`w-full text-left px-4 py-3 flex justify-between items-center border-b border-divider last:border-b-0 transition-colors ${
                i === highlighted ? "bg-accent-glow" : "hover:bg-bg-main/50"
              }`}
            >
              <div>
                <div className="font-semibold text-sm text-text-primary">
                  {product.descrizione}
                </div>
                <div className="text-xs text-text-secondary">
                  cod. {product.codice_amway}
                  {product.contenuto && ` · ${product.contenuto}`}
                </div>
                {stockMap[product.id] > 0 && (
                  <div className="text-xs text-accent font-semibold">
                    Stock: {stockMap[product.id]}
                  </div>
                )}
              </div>
              <div className="text-right shrink-0 ml-3">
                <div className="font-semibold text-sm">
                  {"€"}{product.prezzo_cliente.toFixed(2)}
                </div>
                <div className="text-xs text-accent-hover font-medium">
                  {product.punti_vp.toFixed(2)} VP
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {isOpen && query.trim().length >= 1 && filtered.length === 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-bg-card border border-border rounded-xl shadow-lg z-50 p-4 text-center text-sm text-text-secondary">
          Nessun prodotto trovato
        </div>
      )}
    </div>
  );
}
