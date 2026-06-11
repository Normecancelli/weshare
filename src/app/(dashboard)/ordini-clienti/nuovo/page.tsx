"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ProductSearch } from "@/components/ui/product-search";
import { WhatsAppExtractor } from "@/components/whatsapp-extractor";
import type { Product, Customer, OrderChannel } from "@/lib/types/orders";

interface CartItem {
  product: Product;
  quantita: number;
}

export default function NuovoOrdinePage() {
  const router = useRouter();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [showCustomerList, setShowCustomerList] = useState(false);
  const [canale, setCanale] = useState<OrderChannel>("presenza");
  const [items, setItems] = useState<CartItem[]>([]);
  const [note, setNote] = useState("");
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickAdd, setQuickAdd] = useState({ nome: "", cognome: "", telefono: "" });
  const [quickAddSaving, setQuickAddSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/customers").then((r) => r.json()),
      fetch("/api/products").then((r) => r.json()),
    ]).then(([custData, prodData]) => {
      setCustomers(custData.customers || []);
      setProducts(prodData.products || []);
      setLoading(false);
    });
  }, []);

  // Totals
  const totaleCliente = items.reduce(
    (sum, i) => sum + i.product.prezzo_cliente * i.quantita,
    0
  );
  const totalePartner = items.reduce(
    (sum, i) => sum + i.product.prezzo_partner * i.quantita,
    0
  );
  const totaleVp = items.reduce(
    (sum, i) => sum + i.product.punti_vp * i.quantita,
    0
  );
  const totaleProvvigione = items.reduce(
    (sum, i) => sum + i.product.provvigione * i.quantita,
    0
  );

  function addProduct(product: Product) {
    setItems((prev) => {
      const existing = prev.find((i) => i.product.id === product.id);
      if (existing) {
        return prev.map((i) =>
          i.product.id === product.id
            ? { ...i, quantita: i.quantita + 1 }
            : i
        );
      }
      return [...prev, { product, quantita: 1 }];
    });
  }

  function updateQty(productId: string, delta: number) {
    setItems((prev) =>
      prev
        .map((i) =>
          i.product.id === productId
            ? { ...i, quantita: Math.max(0, i.quantita + delta) }
            : i
        )
        .filter((i) => i.quantita > 0)
    );
  }

  function removeItem(productId: string) {
    setItems((prev) => prev.filter((i) => i.product.id !== productId));
  }

  async function handleSubmit(asBozza: boolean) {
    if (!selectedCustomer || items.length === 0) return;

    setSaving(true);
    const res = await fetch("/api/client-orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customer_id: selectedCustomer.id,
        canale,
        note: note || null,
        items: items.map((i) => ({
          product_id: i.product.id,
          quantita: i.quantita,
        })),
      }),
    });

    if (res.ok) {
      const data = await res.json();
      if (!asBozza) {
        // Confirm immediately
        await fetch(`/api/client-orders/${data.order.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stato: "confermato" }),
        });
      }
      router.push("/ordini-clienti");
    }
    setSaving(false);
  }

  async function handleQuickAddCustomer(e: React.FormEvent) {
    e.preventDefault();
    if (!quickAdd.nome.trim()) return;
    setQuickAddSaving(true);
    const res = await fetch("/api/customers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(quickAdd),
    });
    if (res.ok) {
      const data = await res.json();
      setCustomers((prev) => [...prev, data.customer]);
      setSelectedCustomer(data.customer);
      setShowQuickAdd(false);
      setShowCustomerList(false);
      setQuickAdd({ nome: "", cognome: "", telefono: "" });
    }
    setQuickAddSaving(false);
  }

  const filteredCustomers = customerSearch.trim()
    ? customers.filter(
        (c) =>
          c.nome.toLowerCase().includes(customerSearch.toLowerCase()) ||
          (c.cognome &&
            c.cognome.toLowerCase().includes(customerSearch.toLowerCase()))
      )
    : customers;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-10 h-10 border-3 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto pb-32">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => router.back()}
          className="w-9 h-9 rounded-xl border border-border flex items-center justify-center text-text-secondary hover:bg-bg-section transition-all"
        >
          ←
        </button>
        <h2 className="text-2xl font-bold tracking-tight">Nuovo Ordine</h2>
      </div>

      {/* Customer selection */}
      <div className="bg-bg-card border border-border rounded-2xl p-4 mb-4">
        <div className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-3">
          Cliente
        </div>
        {selectedCustomer ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-accent to-accent-hover flex items-center justify-center text-white text-sm font-bold">
                {selectedCustomer.nome[0]}
                {selectedCustomer.cognome?.[0] || ""}
              </div>
              <div>
                <div className="font-semibold text-sm">
                  {selectedCustomer.nome} {selectedCustomer.cognome}
                </div>
                {selectedCustomer.telefono && (
                  <div className="text-xs text-text-secondary">
                    {selectedCustomer.telefono}
                  </div>
                )}
              </div>
            </div>
            <button
              onClick={() => {
                setSelectedCustomer(null);
                setShowCustomerList(true);
              }}
              className="text-xs text-accent font-semibold"
            >
              Cambia
            </button>
          </div>
        ) : (
          <div>
            <input
              type="text"
              placeholder="Cerca cliente..."
              value={customerSearch}
              onChange={(e) => {
                setCustomerSearch(e.target.value);
                setShowCustomerList(true);
              }}
              onFocus={() => setShowCustomerList(true)}
              className="w-full px-4 py-2.5 rounded-xl text-sm border border-border bg-bg-main focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
            />
            {showCustomerList && (
              <div className="mt-2 border border-border rounded-xl">
                <div className="max-h-48 overflow-y-auto">
                  {filteredCustomers.length === 0 ? (
                    <div className="p-3 text-center text-sm text-text-secondary">
                      Nessun cliente trovato
                    </div>
                  ) : (
                    filteredCustomers.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => {
                          setSelectedCustomer(c);
                          setShowCustomerList(false);
                          setCustomerSearch("");
                        }}
                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-accent-glow transition-colors border-b border-divider last:border-b-0"
                      >
                        <span className="font-semibold">{c.nome}</span>{" "}
                        {c.cognome}
                        {c.telefono && (
                          <span className="text-text-secondary ml-2">
                            {c.telefono}
                          </span>
                        )}
                      </button>
                    ))
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setShowQuickAdd(true)}
                  className="w-full px-4 py-2.5 text-sm font-semibold text-accent hover:bg-accent-glow transition-colors border-t border-border text-center"
                >
                  + Nuovo cliente veloce
                </button>
              </div>
            )}

            {showQuickAdd && (
              <form onSubmit={handleQuickAddCustomer} className="mt-3 p-3 bg-bg-main rounded-xl border border-accent/30 space-y-2">
                <div className="text-xs font-semibold text-accent mb-1">Nuovo cliente</div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input
                    type="text"
                    placeholder="Nome *"
                    value={quickAdd.nome}
                    onChange={(e) => setQuickAdd({ ...quickAdd, nome: e.target.value })}
                    required
                    className="px-3 py-2 rounded-lg text-sm border border-border bg-bg-card focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
                  />
                  <input
                    type="text"
                    placeholder="Cognome"
                    value={quickAdd.cognome}
                    onChange={(e) => setQuickAdd({ ...quickAdd, cognome: e.target.value })}
                    className="px-3 py-2 rounded-lg text-sm border border-border bg-bg-card focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
                  />
                  <input
                    type="tel"
                    placeholder="Cellulare"
                    value={quickAdd.telefono}
                    onChange={(e) => setQuickAdd({ ...quickAdd, telefono: e.target.value })}
                    className="px-3 py-2 rounded-lg text-sm border border-border bg-bg-card focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={quickAddSaving || !quickAdd.nome.trim()}
                    className="px-4 py-2 rounded-lg text-sm font-semibold bg-accent text-white hover:bg-accent-hover transition-all disabled:opacity-50"
                  >
                    {quickAddSaving ? "..." : "Crea e seleziona"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowQuickAdd(false)}
                    className="px-4 py-2 rounded-lg text-sm text-text-secondary hover:bg-bg-section transition-all"
                  >
                    Annulla
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>

      {/* Channel */}
      <div className="bg-bg-card border border-border rounded-2xl p-4 mb-4">
        <div className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-3">
          Canale
        </div>
        <div className="flex gap-2">
          {(
            [
              { key: "presenza", label: "Di persona", icon: "🤝" },
              { key: "whatsapp", label: "WhatsApp", icon: "💬" },
              { key: "telefono", label: "Telefono", icon: "📞" },
            ] as { key: OrderChannel; label: string; icon: string }[]
          ).map((ch) => (
            <button
              key={ch.key}
              onClick={() => setCanale(ch.key)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all ${
                canale === ch.key
                  ? "bg-accent text-white"
                  : "bg-bg-section text-text-secondary hover:bg-bg-main"
              }`}
            >
              {ch.icon} {ch.label}
            </button>
          ))}
        </div>
      </div>

      {/* WhatsApp Extractor — solo se canale = whatsapp */}
      {canale === "whatsapp" && (
        <WhatsAppExtractor
          onAddItems={(extracted) => {
            for (const it of extracted) {
              const product = products.find((p) => p.id === it.product_id);
              if (!product) continue;
              setItems((prev) => {
                const existing = prev.find((i) => i.product.id === product.id);
                if (existing) {
                  return prev.map((i) =>
                    i.product.id === product.id
                      ? { ...i, quantita: i.quantita + it.quantita }
                      : i,
                  );
                }
                return [...prev, { product, quantita: it.quantita }];
              });
            }
          }}
        />
      )}

      {/* Product search + cart */}
      <div className="bg-bg-card border border-border rounded-2xl p-4 mb-4">
        <div className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-3">
          Prodotti
        </div>
        <ProductSearch products={products} onSelect={addProduct} />

        {items.length > 0 && (
          <div className="mt-4 space-y-2">
            {items.map((item) => (
              <div
                key={item.product.id}
                className="flex items-center gap-3 p-3 bg-bg-main rounded-xl"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm truncate">
                    {item.product.descrizione}
                  </div>
                  <div className="text-xs text-text-secondary">
                    {"€"}{item.product.prezzo_cliente.toFixed(2)} ·{" "}
                    {item.product.punti_vp.toFixed(2)} VP
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => updateQty(item.product.id, -1)}
                    className="w-7 h-7 rounded-lg bg-bg-section text-text-secondary font-bold text-sm hover:bg-border transition-all flex items-center justify-center"
                  >
                    -
                  </button>
                  <span className="w-8 text-center font-semibold text-sm">
                    {item.quantita}
                  </span>
                  <button
                    onClick={() => updateQty(item.product.id, 1)}
                    className="w-7 h-7 rounded-lg bg-bg-section text-text-secondary font-bold text-sm hover:bg-border transition-all flex items-center justify-center"
                  >
                    +
                  </button>
                </div>
                <div className="text-right shrink-0 w-16">
                  <div className="font-semibold text-sm">
                    {"€"}{(item.product.prezzo_cliente * item.quantita).toFixed(2)}
                  </div>
                </div>
                <button
                  onClick={() => removeItem(item.product.id)}
                  className="text-coral text-xs font-semibold ml-1"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Note */}
      <div className="bg-bg-card border border-border rounded-2xl p-4 mb-4">
        <div className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-3">
          Note (opzionale)
        </div>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note sull'ordine..."
          rows={2}
          className="w-full px-4 py-2.5 rounded-xl text-sm border border-border bg-bg-main focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent resize-none"
        />
      </div>

      {/* Sticky bottom bar */}
      {items.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 md:left-64 bg-bg-card border-t border-border p-4 z-40">
          <div className="max-w-2xl mx-auto">
            <div className="flex justify-between items-center mb-3 text-sm">
              <div>
                <span className="text-text-secondary">Totale cliente: </span>
                <span className="font-bold">{"€"}{totaleCliente.toFixed(2)}</span>
              </div>
              <div>
                <span className="text-text-secondary">VP: </span>
                <span className="font-bold text-accent-hover">
                  {totaleVp.toFixed(2)}
                </span>
              </div>
              <div>
                <span className="text-text-secondary">Provvigione: </span>
                <span className="font-bold text-success">
                  {"€"}{totaleProvvigione.toFixed(2)}
                </span>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => handleSubmit(true)}
                disabled={!selectedCustomer || saving}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-border text-text-secondary hover:border-accent hover:text-accent transition-all disabled:opacity-50"
              >
                Salva bozza
              </button>
              <button
                onClick={() => handleSubmit(false)}
                disabled={!selectedCustomer || saving}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-accent text-white hover:bg-accent-hover transition-all disabled:opacity-50"
              >
                {saving ? "Salvataggio..." : "Conferma ordine"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
