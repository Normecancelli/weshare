"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { VpCounter } from "@/components/ui/vp-counter";
import { CartSelector } from "@/components/ui/cart-selector";
import type { ClientOrder, CartType } from "@/lib/types/orders";

interface GroupItemLocal {
  id: string; // order_item id
  orderItemId: string;
  productName: string;
  codice: string;
  quantita: number;
  vpUnit: number;
  prezzoCliente: number;
  prezzoPartner: number;
  provvigione: number;
  customerName: string;
  carrello: CartType;
}

export default function RaggruppaPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<ClientOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [items, setItems] = useState<GroupItemLocal[]>([]);
  const [phase, setPhase] = useState<"select" | "assign">("select");
  const [groupId, setGroupId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    fetchConfirmedOrders();
  }, []);

  async function fetchConfirmedOrders() {
    setLoading(true);
    const res = await fetch("/api/client-orders?stato=confermato");
    const data = await res.json();
    setOrders(data.orders || []);
    setLoading(false);
  }

  function toggleOrder(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  async function createGroup() {
    if (selectedIds.size === 0) return;

    setLoading(true);
    const res = await fetch("/api/order-groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        order_ids: Array.from(selectedIds),
      }),
    });

    if (res.ok) {
      const data = await res.json();
      setGroupId(data.group.id);

      // Fetch group details to get items
      const detailRes = await fetch(`/api/order-groups/${data.group.id}`);
      const detailData = await detailRes.json();

      const mappedItems: GroupItemLocal[] = (detailData.items || []).map(
        (gi: {
          id: string;
          order_item_id: string;
          carrello: CartType;
          order_item?: {
            quantita: number;
            punti_vp: number;
            prezzo_unitario_cliente: number;
            prezzo_unitario_partner: number;
            provvigione: number;
            product?: { descrizione: string; codice_amway: string };
            order?: { customer?: { nome: string; cognome?: string } };
          };
        }) => ({
          id: gi.id,
          orderItemId: gi.order_item_id,
          productName: gi.order_item?.product?.descrizione || "Prodotto",
          codice: gi.order_item?.product?.codice_amway || "",
          quantita: gi.order_item?.quantita || 1,
          vpUnit: gi.order_item?.punti_vp || 0,
          prezzoCliente: gi.order_item?.prezzo_unitario_cliente || 0,
          prezzoPartner: gi.order_item?.prezzo_unitario_partner || 0,
          provvigione: gi.order_item?.provvigione || 0,
          customerName: gi.order_item?.order?.customer
            ? `${gi.order_item.order.customer.nome} ${gi.order_item.order.customer.cognome || ""}`.trim()
            : "Cliente",
          carrello: gi.carrello,
        })
      );

      setItems(mappedItems);
      setPhase("assign");
    }
    setLoading(false);
  }

  function updateCart(itemId: string, carrello: CartType) {
    setItems((prev) =>
      prev.map((i) => (i.id === itemId ? { ...i, carrello } : i))
    );
  }

  // VP calculations
  const vpPersonale = items
    .filter((i) => i.carrello === "personale")
    .reduce((sum, i) => sum + i.vpUnit * i.quantita, 0);

  const vpNonRegistrato = items
    .filter((i) => i.carrello === "non_registrato")
    .reduce((sum, i) => sum + i.vpUnit * i.quantita, 0);

  const vpProgrammato = items
    .filter((i) => i.carrello === "programmato")
    .reduce((sum, i) => sum + i.vpUnit * i.quantita, 0);

  async function saveAssignments() {
    if (!groupId) return;

    await fetch(`/api/order-groups/${groupId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cart_assignments: items.map((i) => ({
          group_item_id: i.id,
          carrello: i.carrello,
        })),
      }),
    });
  }

  async function confirmGroup() {
    if (!groupId) return;

    setConfirming(true);
    await saveAssignments();

    const res = await fetch(`/api/order-groups/${groupId}/confirm`, {
      method: "PUT",
    });

    if (res.ok) {
      router.push("/ordini-clienti");
    }
    setConfirming(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-10 h-10 border-3 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Phase 1: Select orders to group
  if (phase === "select") {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => router.back()}
            className="w-9 h-9 rounded-xl border border-border flex items-center justify-center text-text-secondary hover:bg-bg-section transition-all"
          >
            ←
          </button>
          <div>
            <h2 className="text-2xl font-bold tracking-tight">
              Raggruppa Ordini
            </h2>
            <p className="text-text-secondary text-sm mt-1">
              Seleziona gli ordini confermati da raggruppare
            </p>
          </div>
        </div>

        {orders.length === 0 ? (
          <div className="text-center py-16 bg-bg-card border border-border rounded-2xl">
            <p className="text-2xl mb-3">📋</p>
            <p className="font-semibold text-text-primary mb-2">
              Nessun ordine da raggruppare
            </p>
            <p className="text-text-secondary text-sm">
              Gli ordini devono essere in stato &quot;confermato&quot; per essere raggruppati.
            </p>
          </div>
        ) : (
          <>
            <div className="space-y-2 mb-6">
              {orders.map((order) => {
                const customer = order.customer;
                const name = customer
                  ? `${customer.nome} ${customer.cognome || ""}`.trim()
                  : "Cliente";
                const isSelected = selectedIds.has(order.id);

                return (
                  <button
                    key={order.id}
                    onClick={() => toggleOrder(order.id)}
                    className={`w-full text-left bg-bg-card border rounded-xl p-4 transition-all ${
                      isSelected
                        ? "border-accent bg-accent-glow"
                        : "border-border hover:border-accent/50"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-5 h-5 rounded-md border-2 flex items-center justify-center text-xs ${
                            isSelected
                              ? "border-accent bg-accent text-white"
                              : "border-border"
                          }`}
                        >
                          {isSelected && "✓"}
                        </div>
                        <div>
                          <div className="font-semibold text-sm">
                            {name}
                          </div>
                          <div className="text-xs text-text-secondary">
                            {new Date(order.created_at).toLocaleDateString(
                              "it-IT",
                              { day: "numeric", month: "short" }
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold text-sm">
                          {"€"}{order.totale_cliente.toFixed(2)}
                        </div>
                        <div className="text-xs text-accent-hover font-medium">
                          {order.totale_vp.toFixed(2)} VP
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <button
              onClick={createGroup}
              disabled={selectedIds.size === 0}
              className="w-full py-3 rounded-xl text-sm font-semibold bg-accent text-white hover:bg-accent-hover transition-all disabled:opacity-50"
            >
              Crea gruppo ({selectedIds.size} ordini)
            </button>
          </>
        )}
      </div>
    );
  }

  // Phase 2: Assign carts
  return (
    <div className="max-w-3xl mx-auto pb-32">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => {
            setPhase("select");
            setItems([]);
            setGroupId(null);
            fetchConfirmedOrders();
          }}
          className="w-9 h-9 rounded-xl border border-border flex items-center justify-center text-text-secondary hover:bg-bg-section transition-all"
        >
          ←
        </button>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">
            Assegna Carrelli
          </h2>
          <p className="text-text-secondary text-sm mt-1">
            Scegli il carrello per ogni prodotto
          </p>
        </div>
      </div>

      {/* VP Counters */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        <VpCounter current={vpPersonale} max={510} label="Personale" />
        <div className="bg-bg-card border border-border rounded-xl p-3 md:p-4">
          <div className="flex justify-between items-center">
            <span className="text-xs md:text-sm font-semibold text-text-primary">
              Non registrato
            </span>
            <span className="text-sm md:text-lg font-bold text-[#1976D2]">
              {vpNonRegistrato.toFixed(2)} VP
            </span>
          </div>
        </div>
        <div className="bg-bg-card border border-border rounded-xl p-3 md:p-4">
          <div className="flex justify-between items-center">
            <span className="text-xs md:text-sm font-semibold text-text-primary">
              Programmato
            </span>
            <span className="text-sm md:text-lg font-bold text-[#9C27B0]">
              {vpProgrammato.toFixed(2)} VP
            </span>
          </div>
        </div>
      </div>

      {/* Items list */}
      <div className="space-y-2 mb-6">
        {items.map((item) => (
          <div
            key={item.id}
            className="bg-bg-card border border-border rounded-xl p-4"
          >
            <div className="flex flex-col md:flex-row md:items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm truncate">
                  {item.productName}
                </div>
                <div className="text-xs text-text-secondary">
                  {item.customerName} · x{item.quantita} ·{" "}
                  {(item.vpUnit * item.quantita).toFixed(2)} VP
                </div>
              </div>
              <CartSelector
                value={item.carrello}
                onChange={(c) => updateCart(item.id, c)}
                compact
              />
            </div>
          </div>
        ))}
      </div>

      {/* Sticky bottom */}
      <div className="fixed bottom-0 left-0 right-0 md:left-64 bg-bg-card border-t border-border p-4 z-40">
        <div className="max-w-3xl mx-auto flex gap-2">
          <button
            onClick={saveAssignments}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-border text-text-secondary hover:border-accent hover:text-accent transition-all"
          >
            Salva bozza
          </button>
          <button
            onClick={confirmGroup}
            disabled={confirming}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-success text-white hover:opacity-90 transition-all disabled:opacity-50"
          >
            {confirming ? "Conferma..." : "✓ Caricato su Amway"}
          </button>
        </div>
      </div>
    </div>
  );
}
