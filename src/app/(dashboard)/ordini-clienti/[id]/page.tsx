"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { TrashIcon } from "@/components/icons";
import { WhatsAppExtractor } from "@/components/whatsapp-extractor";
import { ProductSearch } from "@/components/ui/product-search";
import type { OrderItem, Product } from "@/lib/types/orders";
import type { ClientOrder, OrderChannel } from "@/lib/types/orders";

const CHANNELS: { value: OrderChannel; label: string; icon: string }[] = [
  { value: "presenza", label: "Di persona", icon: "🤝" },
  { value: "whatsapp", label: "WhatsApp", icon: "💬" },
  { value: "telefono", label: "Telefono", icon: "📞" },
];

const STATUS_LABEL: Record<string, { label: string; bg: string; text: string }> = {
  bozza: { label: "Bozza", bg: "bg-bg-section", text: "text-text-secondary" },
  confermato: { label: "Confermato", bg: "bg-accent-glow", text: "text-accent-hover" },
  in_gruppo: { label: "Da inviare", bg: "bg-[#E3F2FD]", text: "text-[#1976D2]" },
  completato: { label: "Inviato", bg: "bg-[#E8F5E9]", text: "text-success" },
  annullato: { label: "Annullato", bg: "bg-coral-soft", text: "text-coral" },
};

export default function OrdineDetailPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();

  const [order, setOrder] = useState<ClientOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [canale, setCanale] = useState<OrderChannel | "">("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [updatingItem, setUpdatingItem] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [addingProduct, setAddingProduct] = useState(false);
  const [vpWarning, setVpWarning] = useState<string | null>(null);

  const fetchOrder = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/client-orders/${id}`);
    if (!res.ok) {
      setError("Ordine non trovato");
      setLoading(false);
      return;
    }
    const data = await res.json();
    setOrder(data.order);
    setCanale(data.order.canale || "");
    setNote(data.order.note || "");
    setLoading(false);
  }, [id]);

  useEffect(() => {
    fetchOrder();
  }, [fetchOrder]);

  useEffect(() => {
    fetch("/api/products")
      .then((r) => r.json())
      .then((d) => setProducts(d.products || []));
  }, []);

  const editable = order?.stato === "bozza" || order?.stato === "confermato";
  const deletable = order?.stato === "bozza" || order?.stato === "annullato";
  const itemsEditable = order?.stato === "bozza" || order?.stato === "in_gruppo";

  async function handleSave() {
    if (!order) return;
    setSaving(true);
    const res = await fetch(`/api/client-orders/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ canale: canale || null, note: note || null }),
    });
    if (res.ok) await fetchOrder();
    setSaving(false);
  }

  async function handleStatusChange(stato: string) {
    setSaving(true);
    const res = await fetch(`/api/client-orders/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stato }),
    });
    if (res.ok) await fetchOrder();
    setSaving(false);
  }

  async function updateItemQty(item: OrderItem, nextQty: number) {
    if (nextQty < 1 || nextQty === item.quantita) return;
    setUpdatingItem(item.id);
    const res = await fetch(`/api/client-orders/${id}/items/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quantita: nextQty }),
    });
    if (res.ok) {
      const data = await res.json();
      setVpWarning(data.warning || null);
      await fetchOrder();
    }
    setUpdatingItem(null);
  }

  async function removeItem(item: OrderItem) {
    if (!confirm(`Rimuovere "${item.product?.descrizione || "questo articolo"}" dall'ordine?`)) return;
    setUpdatingItem(item.id);
    const res = await fetch(`/api/client-orders/${id}/items/${item.id}`, {
      method: "DELETE",
    });
    if (res.ok) await fetchOrder();
    setUpdatingItem(null);
  }

  async function addProduct(product: Product) {
    setAddingProduct(true);
    const res = await fetch(`/api/client-orders/${id}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product_id: product.id, quantita: 1 }),
    });
    if (res.ok) {
      const data = await res.json();
      setVpWarning(data.warning || null);
      await fetchOrder();
    } else {
      const data = await res.json();
      alert(data.error || "Errore aggiunta prodotto");
    }
    setAddingProduct(false);
  }

  async function handleDelete() {
    setDeleting(true);
    const res = await fetch(`/api/client-orders/${id}`, { method: "DELETE" });
    if (res.ok) {
      router.push("/ordini-clienti");
    } else {
      const data = await res.json();
      setError(data.error || "Errore eliminazione");
      setDeleting(false);
    }
  }

  function formatDate(d: string) {
    return new Date(d).toLocaleString("it-IT", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-10 h-10 border-3 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="text-center py-16">
        <p className="text-2xl mb-3">⚠️</p>
        <p className="font-semibold text-text-primary mb-4">{error || "Ordine non trovato"}</p>
        <button
          onClick={() => router.push("/ordini-clienti")}
          className="px-4 py-2.5 rounded-xl text-sm font-semibold bg-accent text-white hover:bg-accent-hover transition-all"
        >
          Torna agli ordini
        </button>
      </div>
    );
  }

  const customerName = order.customer
    ? `${order.customer.nome} ${order.customer.cognome || ""}`.trim()
    : "Cliente";
  const status = STATUS_LABEL[order.stato] || STATUS_LABEL.bozza;
  const items = order.items || [];

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => router.push("/ordini-clienti")}
          className="w-9 h-9 rounded-lg hover:bg-bg-section flex items-center justify-center text-text-secondary transition-all"
          aria-label="Indietro"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
        </button>
        <div className="flex-1">
          <h2 className="text-2xl font-bold tracking-tight">Ordine {customerName}</h2>
          <p className="text-xs text-text-secondary mt-0.5">{formatDate(order.created_at)}</p>
        </div>
        <span className={`${status.bg} ${status.text} text-xs font-semibold px-3 py-1 rounded-full`}>
          {status.label}
        </span>
      </div>

      {order.stato === "in_gruppo" && (
        <div className="bg-[#E3F2FD] text-[#1976D2] text-sm px-4 py-3 rounded-xl mb-4">
          Ordine già raggruppato. Puoi ancora aggiungere o modificare articoli finché il gruppo non viene caricato su Amway.
        </div>
      )}

      {vpWarning && (
        <div className="bg-warning/10 text-warning text-sm px-4 py-3 rounded-xl mb-4">
          ⚠️ {vpWarning}
        </div>
      )}

      {/* Cliente + canale */}
      <section className="bg-bg-card border border-border rounded-2xl p-5 mb-4">
        <div className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-3">Cliente</div>
        <div className="font-semibold text-text-primary">{customerName}</div>
        {order.customer?.telefono && (
          <div className="text-sm text-text-secondary mt-0.5">{order.customer.telefono}</div>
        )}

        <div className="text-xs font-semibold text-text-secondary uppercase tracking-wide mt-5 mb-2">Canale</div>
        <div className="flex flex-wrap gap-2">
          {CHANNELS.map((c) => (
            <button
              key={c.value}
              type="button"
              disabled={!editable}
              onClick={() => setCanale(c.value)}
              className={`px-3 py-2 rounded-xl text-sm border-2 transition-all ${
                canale === c.value
                  ? "border-accent bg-accent-glow text-accent-hover font-semibold"
                  : "border-border text-text-secondary hover:border-accent/50"
              } disabled:opacity-60 disabled:cursor-not-allowed`}
            >
              <span className="mr-1.5">{c.icon}</span>{c.label}
            </button>
          ))}
        </div>
      </section>

      {/* WhatsApp Extractor — su bozze e ordini raggruppati con canale WhatsApp */}
      {itemsEditable && canale === "whatsapp" && (
        <WhatsAppExtractor
          onAddItems={async (extracted) => {
            for (const it of extracted) {
              const res = await fetch(`/api/client-orders/${id}/items`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  product_id: it.product_id,
                  quantita: it.quantita,
                }),
              });
              if (!res.ok) throw new Error("Errore aggiunta articoli");
              const data = await res.json();
              if (data.warning) setVpWarning(data.warning);
            }
            await fetchOrder();
          }}
        />
      )}

      {/* Articoli */}
      <section className="bg-bg-card border border-border rounded-2xl p-5 mb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
            Articoli ({items.length})
          </div>
        </div>
        {itemsEditable && (
          <div className="mb-4">
            <ProductSearch
              products={products}
              onSelect={addProduct}
              placeholder={addingProduct ? "Aggiunta in corso..." : "Cerca prodotto da aggiungere..."}
            />
          </div>
        )}
        {items.length === 0 ? (
          <p className="text-sm text-text-secondary">Nessun articolo</p>
        ) : (
          <div className="space-y-2">
            {items.map((it) => {
              const isDraft = itemsEditable;
              const busy = updatingItem === it.id;
              return (
                <div
                  key={it.id}
                  className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 bg-bg-main rounded-xl"
                >
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-accent-glow flex items-center justify-center text-accent text-xs font-bold shrink-0">
                      {it.quantita}×
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm text-text-primary line-clamp-2">
                        {it.product?.descrizione || `Prodotto ${it.product_id.slice(0, 8)}`}
                      </div>
                      <div className="text-xs text-text-secondary mt-0.5">
                        cod. {it.product?.codice_amway || "—"}
                        {it.product?.contenuto && ` · ${it.product.contenuto}`}
                      </div>
                      <div className="text-[11px] text-text-gentle mt-0.5">
                        €{it.prezzo_unitario_cliente.toFixed(2)} cad · {it.punti_vp.toFixed(2)} VP cad
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                    {isDraft ? (
                      <div className="flex items-center gap-1 bg-bg-card border border-border rounded-lg p-0.5">
                        <button
                          type="button"
                          onClick={() => updateItemQty(it, it.quantita - 1)}
                          disabled={busy || it.quantita <= 1}
                          className="w-7 h-7 rounded-md hover:bg-bg-section flex items-center justify-center text-text-secondary disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                          aria-label="Diminuisci quantità"
                        >
                          −
                        </button>
                        <input
                          type="number"
                          min={1}
                          value={it.quantita}
                          onChange={(e) => {
                            const v = parseInt(e.target.value);
                            if (!isNaN(v) && v >= 1) updateItemQty(it, v);
                          }}
                          className="w-10 text-center text-sm font-semibold bg-transparent focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                          disabled={busy}
                        />
                        <button
                          type="button"
                          onClick={() => updateItemQty(it, it.quantita + 1)}
                          disabled={busy}
                          className="w-7 h-7 rounded-md hover:bg-bg-section flex items-center justify-center text-text-secondary disabled:opacity-30 transition-all"
                          aria-label="Aumenta quantità"
                        >
                          +
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-text-secondary">qt. {it.quantita}</span>
                    )}
                    <div className="text-right">
                      <div className="text-sm font-semibold text-text-primary whitespace-nowrap">
                        €{(it.prezzo_unitario_cliente * it.quantita).toFixed(2)}
                      </div>
                      <div className="text-xs text-accent-hover font-medium whitespace-nowrap">
                        {(it.punti_vp * it.quantita).toFixed(2)} VP
                      </div>
                    </div>
                    {isDraft && (
                      <button
                        type="button"
                        onClick={() => removeItem(it)}
                        disabled={busy}
                        className="w-8 h-8 rounded-lg hover:bg-coral/10 flex items-center justify-center text-coral disabled:opacity-30 transition-all"
                        title="Rimuovi articolo"
                      >
                        <TrashIcon />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Totali */}
      <section className="bg-bg-card border border-border rounded-2xl p-5 mb-4">
        <div className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-3">Totali</div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <div className="text-[10px] text-text-gentle uppercase">Cliente</div>
            <div className="text-base font-bold text-text-primary">€{order.totale_cliente.toFixed(2)}</div>
          </div>
          <div>
            <div className="text-[10px] text-text-gentle uppercase">Punti VP</div>
            <div className="text-base font-bold text-accent-hover">{order.totale_vp.toFixed(2)}</div>
          </div>
          <div>
            <div className="text-[10px] text-text-gentle uppercase">Provvigione</div>
            <div className="text-base font-bold text-success">+€{order.totale_provvigione.toFixed(2)}</div>
          </div>
        </div>
      </section>

      {/* Note */}
      <section className="bg-bg-card border border-border rounded-2xl p-5 mb-4">
        <div className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-2">Note</div>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          disabled={!editable}
          rows={2}
          placeholder="Note sull'ordine..."
          className="w-full px-3 py-2 rounded-xl text-sm border border-border bg-bg-main focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent resize-none disabled:opacity-60"
        />
      </section>

      {/* Azioni */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <div>
          {deletable && (
            !confirmDelete ? (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="inline-flex items-center gap-1.5 text-sm text-coral font-medium hover:opacity-70 transition-opacity"
              >
                <TrashIcon /> Elimina ordine
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-coral text-white hover:opacity-80 transition-all disabled:opacity-50"
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
            )
          )}
        </div>
        <div className="flex gap-2">
          {editable && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 rounded-xl text-sm font-semibold border border-border text-text-primary hover:bg-bg-section transition-all disabled:opacity-50"
            >
              {saving ? "..." : "Salva modifiche"}
            </button>
          )}
          {order.stato === "bozza" && (
            <button
              onClick={() => handleStatusChange("confermato")}
              disabled={saving || items.length === 0}
              className="px-5 py-2 rounded-xl text-sm font-semibold bg-accent text-white hover:bg-accent-hover transition-all disabled:opacity-50"
            >
              Conferma ordine
            </button>
          )}
          {order.stato === "confermato" && (
            <button
              onClick={() => handleStatusChange("bozza")}
              disabled={saving}
              className="px-4 py-2 rounded-xl text-sm font-semibold border border-border text-text-primary hover:bg-bg-section transition-all disabled:opacity-50"
            >
              Riporta a bozza
            </button>
          )}
          {(order.stato === "bozza" || order.stato === "confermato") && (
            <button
              onClick={() => handleStatusChange("annullato")}
              disabled={saving}
              className="px-4 py-2 rounded-xl text-sm font-semibold text-coral hover:bg-coral/10 transition-all disabled:opacity-50"
            >
              Annulla
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
