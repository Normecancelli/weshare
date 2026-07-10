"use client";

import { useEffect, useMemo, useState } from "react";
import { StatCard } from "@/components/ui/stat-card";
import type { ClientOrder, Customer } from "@/lib/types/orders";

type FilterTab = "tutti" | "bozza" | "confermato" | "in_gruppo" | "completato";

const inputClass =
  "w-full px-3.5 py-2.5 rounded-xl text-sm border border-border bg-bg-main focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent";

const MESI_IT = [
  "gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno",
  "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre",
];

interface Stats {
  totale: number;
  daRaggruppare: number;
  completati: number;
  totaleVp: number;
  totaleProvvigione: number;
}

export default function OrdiniClientiPage() {
  const [orders, setOrders] = useState<ClientOrder[]>([]);
  const [stats, setStats] = useState<Stats>({
    totale: 0,
    daRaggruppare: 0,
    completati: 0,
    totaleVp: 0,
    totaleProvvigione: 0,
  });
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<FilterTab>("tutti");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerFilter, setCustomerFilter] = useState("");
  const [monthFilter, setMonthFilter] = useState("");
  const [productFilter, setProductFilter] = useState("");
  const [confirmingGroup, setConfirmingGroup] = useState<string | null>(null);

  useEffect(() => {
    fetchOrders();
    fetch("/api/customers")
      .then((r) => r.json())
      .then((d) => setCustomers(d.customers || []));
  }, []);

  async function fetchOrders() {
    setLoading(true);
    const res = await fetch("/api/client-orders");
    const data = await res.json();
    setOrders(data.orders || []);
    setStats(data.stats || stats);
    setLoading(false);
  }

  const monthOptions = useMemo(() => {
    const set = new Set(orders.map((o) => o.created_at.slice(0, 7)));
    return Array.from(set)
      .sort((a, b) => b.localeCompare(a))
      .map((ym) => {
        const [year, month] = ym.split("-");
        const label = `${MESI_IT[parseInt(month, 10) - 1]} ${year}`;
        return { value: ym, label: label.charAt(0).toUpperCase() + label.slice(1) };
      });
  }, [orders]);

  const filtersActive = Boolean(customerFilter || monthFilter || productFilter.trim());

  function resetFilters() {
    setCustomerFilter("");
    setMonthFilter("");
    setProductFilter("");
  }

  const filtered = orders.filter((o) => {
    if (tab !== "tutti" && o.stato !== tab) return false;
    if (customerFilter && o.customer_id !== customerFilter) return false;
    if (monthFilter && o.created_at.slice(0, 7) !== monthFilter) return false;
    if (productFilter.trim()) {
      const q = productFilter.trim().toLowerCase();
      const items = o.items || [];
      const hasMatch = items.some((it) => {
        const desc = it.product?.descrizione?.toLowerCase() || "";
        const cod = it.product?.codice_amway?.toLowerCase() || "";
        return desc.includes(q) || cod.includes(q);
      });
      if (!hasMatch) return false;
    }
    return true;
  });

  const daInviareCount = orders.filter((o) => o.stato === "in_gruppo").length;

  const tabs: { key: FilterTab; label: string; count?: number }[] = [
    { key: "tutti", label: "Tutti", count: stats.totale },
    { key: "bozza", label: "Bozze" },
    { key: "confermato", label: "Da raggruppare", count: stats.daRaggruppare },
    { key: "in_gruppo", label: "Da inviare", count: daInviareCount },
    { key: "completato", label: "Inviati", count: stats.completati },
  ];

  const groupedOrders = useMemo(() => {
    const map = new Map<string, ClientOrder[]>();
    for (const o of filtered) {
      if (o.stato !== "in_gruppo" || !o.group_id) continue;
      if (!map.has(o.group_id)) map.set(o.group_id, []);
      map.get(o.group_id)!.push(o);
    }
    return Array.from(map.entries())
      .map(([groupId, groupOrders]) => ({
        groupId,
        orders: groupOrders
          .slice()
          .sort((a, b) => b.created_at.localeCompare(a.created_at)),
      }))
      .sort((a, b) => {
        const aMax = Math.max(...a.orders.map((o) => new Date(o.created_at).getTime()));
        const bMax = Math.max(...b.orders.map((o) => new Date(o.created_at).getTime()));
        return bMax - aMax;
      });
  }, [filtered]);

  async function handleConfirmGroup(groupId: string) {
    setConfirmingGroup(groupId);
    const res = await fetch(`/api/order-groups/${groupId}/confirm`, {
      method: "PUT",
    });
    if (res.ok) {
      await fetchOrders();
    } else {
      const data = await res.json();
      alert(data.error || "Errore conferma invio");
    }
    setConfirmingGroup(null);
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString("it-IT", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function statusBadge(stato: string) {
    const map: Record<string, { bg: string; text: string; label: string }> = {
      bozza: { bg: "bg-bg-section", text: "text-text-secondary", label: "Bozza" },
      confermato: { bg: "bg-accent-glow", text: "text-accent-hover", label: "Confermato" },
      in_gruppo: { bg: "bg-[#E3F2FD]", text: "text-[#1976D2]", label: "Da inviare" },
      completato: { bg: "bg-[#E8F5E9]", text: "text-success", label: "Inviato" },
      annullato: { bg: "bg-coral-soft", text: "text-coral", label: "Annullato" },
    };
    const s = map[stato] || map.bozza;
    return (
      <span className={`${s.bg} ${s.text} text-[10px] md:text-xs font-semibold px-2 py-0.5 rounded-full`}>
        {s.label}
      </span>
    );
  }

  function channelIcon(canale: string | null) {
    if (canale === "whatsapp") return "💬";
    if (canale === "presenza") return "🤝";
    if (canale === "telefono") return "📞";
    return "";
  }

  function renderOrderCard(order: ClientOrder) {
    const customer = order.customer;
    const customerName = customer
      ? `${customer.nome} ${customer.cognome || ""}`.trim()
      : "Cliente";

    return (
      <a
        key={order.id}
        href={`/ordini-clienti/${order.id}`}
        className="block bg-bg-card border border-border rounded-xl p-4 hover:shadow-md transition-all"
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm text-text-primary">
              {customerName}
            </span>
            {order.canale && (
              <span className="text-sm" title={order.canale}>
                {channelIcon(order.canale)}
              </span>
            )}
          </div>
          {statusBadge(order.stato)}
        </div>
        <div className="flex items-center justify-between">
          <div className="text-xs text-text-secondary">
            {formatDate(order.created_at)}
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="font-semibold text-text-primary">
              {"€"}{order.totale_cliente.toFixed(2)}
            </span>
            <span className="text-accent-hover font-semibold">
              {order.totale_vp.toFixed(2)} VP
            </span>
            <span className="text-success font-semibold">
              +€{order.totale_provvigione.toFixed(2)}
            </span>
          </div>
        </div>
      </a>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-10 h-10 border-3 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Ordini Clienti</h2>
          <p className="text-text-secondary text-sm mt-1">
            Gestisci gli ordini dei tuoi clienti
          </p>
        </div>
        <div className="flex gap-2">
          {stats.daRaggruppare > 0 && (
            <a
              href="/ordini-clienti/raggruppa"
              className="px-4 py-2.5 rounded-xl text-sm font-semibold border-2 border-accent text-accent hover:bg-accent hover:text-white transition-all"
            >
              Raggruppa ({stats.daRaggruppare})
            </a>
          )}
          <a
            href="/ordini-clienti/nuovo"
            className="px-4 py-2.5 rounded-xl text-sm font-semibold bg-accent text-white hover:bg-accent-hover transition-all"
          >
            + Nuovo Ordine
          </a>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard
          label="Ordini totali"
          value={stats.totale}
          color="accent"
        />
        <StatCard
          label="Da raggruppare"
          value={stats.daRaggruppare}
          color="coral"
        />
        <StatCard
          label="VP Totali"
          value={stats.totaleVp.toFixed(2)}
          color="lavender"
        />
        <StatCard
          label="Provvigioni"
          value={`€${stats.totaleProvvigione.toFixed(2)}`}
          color="success"
        />
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 mb-6 overflow-x-auto pb-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 md:px-4 py-2 rounded-lg text-xs md:text-sm font-medium whitespace-nowrap transition-all ${
              tab === t.key
                ? "bg-accent text-white"
                : "bg-bg-section text-text-secondary hover:bg-bg-card"
            }`}
          >
            {t.label}
            {t.count !== undefined && t.count > 0 && (
              <span className="ml-1.5 text-[10px]">({t.count})</span>
            )}
          </button>
        ))}
      </div>

      {/* Filtri: cliente, mese, prodotto */}
      <div className="flex flex-col sm:flex-row gap-2 mb-6">
        <select
          value={customerFilter}
          onChange={(e) => setCustomerFilter(e.target.value)}
          className={`${inputClass} sm:max-w-[220px]`}
        >
          <option value="">Tutti i clienti</option>
          {customers
            .slice()
            .sort((a, b) => a.nome.localeCompare(b.nome))
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome} {c.cognome || ""}
              </option>
            ))}
        </select>
        <select
          value={monthFilter}
          onChange={(e) => setMonthFilter(e.target.value)}
          className={`${inputClass} sm:max-w-[180px]`}
        >
          <option value="">Tutti i mesi</option>
          {monthOptions.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
        <input
          type="text"
          value={productFilter}
          onChange={(e) => setProductFilter(e.target.value)}
          placeholder="Cerca prodotto..."
          className={inputClass}
        />
        {filtersActive && (
          <button
            type="button"
            onClick={resetFilters}
            className="px-3.5 py-2.5 rounded-xl text-sm font-medium text-text-secondary hover:text-accent whitespace-nowrap"
          >
            Azzera filtri
          </button>
        )}
      </div>

      {/* Orders list */}
      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-2xl mb-3">🛒</p>
          <p className="font-semibold text-text-primary mb-2">
            {orders.length === 0 ? "Nessun ordine" : "Nessun ordine in questa categoria"}
          </p>
          <p className="text-text-secondary text-sm mb-4">
            {orders.length === 0
              ? "Crea il primo ordine per un cliente."
              : "Prova un altro filtro."}
          </p>
          {orders.length === 0 && (
            <a
              href="/ordini-clienti/nuovo"
              className="inline-block px-5 py-2.5 rounded-xl text-sm font-semibold bg-accent text-white hover:bg-accent-hover transition-all"
            >
              + Nuovo Ordine
            </a>
          )}
        </div>
      ) : tab === "in_gruppo" ? (
        <div className="space-y-6">
          {groupedOrders.map((g, idx) => (
            <div key={g.groupId}>
              <div className="flex items-center justify-between gap-3 bg-accent-glow border border-accent/30 rounded-xl p-4 mb-2">
                <div className="text-sm text-accent-hover font-semibold">
                  Ordine raggruppato {idx + 1} · {g.orders.length} {g.orders.length === 1 ? "ordine" : "ordini"}
                </div>
                <button
                  type="button"
                  onClick={() => handleConfirmGroup(g.groupId)}
                  disabled={confirmingGroup === g.groupId}
                  className="px-4 py-2 rounded-xl text-sm font-semibold bg-accent text-white hover:bg-accent-hover transition-all disabled:opacity-50 whitespace-nowrap"
                >
                  {confirmingGroup === g.groupId ? "..." : "✓ Segna come inviato"}
                </button>
              </div>
              <div className="space-y-2 pl-3 border-l-2 border-accent/20 ml-2">
                {g.orders.map((order) => renderOrderCard(order))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2">{filtered.map((order) => renderOrderCard(order))}</div>
      )}
    </div>
  );
}
