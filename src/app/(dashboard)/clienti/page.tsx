"use client";

import { useEffect, useState } from "react";
import type { Customer } from "@/lib/types/orders";

export default function ClientiPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    nome: "",
    cognome: "",
    telefono: "",
    email: "",
    codice_attivita: "",
    diamante_riferimento: "non_lo_so",
    citta: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchCustomers();
  }, []);

  async function fetchCustomers() {
    setLoading(true);
    const res = await fetch("/api/customers");
    const data = await res.json();
    setCustomers(data.customers || []);
    setLoading(false);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!formData.nome.trim()) return;

    setSaving(true);
    const res = await fetch("/api/customers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formData),
    });

    if (res.ok) {
      setFormData({ nome: "", cognome: "", telefono: "", email: "", codice_attivita: "", diamante_riferimento: "non_lo_so", citta: "" });
      setShowForm(false);
      fetchCustomers();
    }
    setSaving(false);
  }

  const filtered = customers.filter((c) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      c.nome.toLowerCase().includes(q) ||
      (c.cognome && c.cognome.toLowerCase().includes(q)) ||
      (c.telefono && c.telefono.includes(q)) ||
      (c.email && c.email.toLowerCase().includes(q))
    );
  });

  function getInitials(c: Customer) {
    const parts = [c.nome, c.cognome].filter(Boolean);
    return parts
      .map((p) => p![0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
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
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">I miei Clienti</h2>
          <p className="text-text-secondary text-sm mt-1">
            {customers.length} clienti
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2.5 rounded-xl text-sm font-semibold bg-accent text-white hover:bg-accent-hover transition-all"
        >
          {showForm ? "Annulla" : "+ Nuovo Cliente"}
        </button>
      </div>

      {/* New customer form */}
      {showForm && (
        <form
          onSubmit={handleCreate}
          className="bg-bg-card border border-border rounded-2xl p-4 md:p-6 mb-6"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
            <input
              type="text"
              placeholder="Nome *"
              value={formData.nome}
              onChange={(e) =>
                setFormData({ ...formData, nome: e.target.value })
              }
              required
              className="px-4 py-2.5 rounded-xl text-sm border border-border bg-bg-main focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
            />
            <input
              type="text"
              placeholder="Cognome"
              value={formData.cognome}
              onChange={(e) =>
                setFormData({ ...formData, cognome: e.target.value })
              }
              className="px-4 py-2.5 rounded-xl text-sm border border-border bg-bg-main focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
            />
            <input
              type="tel"
              placeholder="Telefono"
              value={formData.telefono}
              onChange={(e) =>
                setFormData({ ...formData, telefono: e.target.value })
              }
              className="px-4 py-2.5 rounded-xl text-sm border border-border bg-bg-main focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
            />
            <input
              type="email"
              placeholder="Email"
              value={formData.email}
              onChange={(e) =>
                setFormData({ ...formData, email: e.target.value })
              }
              className="px-4 py-2.5 rounded-xl text-sm border border-border bg-bg-main focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
            />
            <input
              type="text"
              placeholder="Codice Attivita Amway"
              value={formData.codice_attivita}
              onChange={(e) =>
                setFormData({ ...formData, codice_attivita: e.target.value })
              }
              className="px-4 py-2.5 rounded-xl text-sm border border-border bg-bg-main focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
            />
            <select
              value={formData.diamante_riferimento}
              onChange={(e) =>
                setFormData({ ...formData, diamante_riferimento: e.target.value })
              }
              className="px-4 py-2.5 rounded-xl text-sm border border-border bg-bg-main focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
            >
              <option value="non_lo_so">Diamante di riferimento — Non lo so</option>
              <option value="da_inserire">Lo inseriro nelle impostazioni</option>
            </select>
            <input
              type="text"
              placeholder="Citta"
              value={formData.citta}
              onChange={(e) =>
                setFormData({ ...formData, citta: e.target.value })
              }
              className="px-4 py-2.5 rounded-xl text-sm border border-border bg-bg-main focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2.5 rounded-xl text-sm font-semibold bg-accent text-white hover:bg-accent-hover transition-all disabled:opacity-50"
          >
            {saving ? "Salvataggio..." : "Salva cliente"}
          </button>
        </form>
      )}

      {/* Search */}
      <div className="relative max-w-sm mb-6">
        <input
          type="text"
          placeholder="Cerca cliente..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm border border-border bg-bg-card text-text-primary placeholder-text-gentle focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-all"
        />
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-gentle">
          🔍
        </span>
      </div>

      {/* Customer cards */}
      <div className="space-y-2">
        {filtered.map((c) => (
          <div
            key={c.id}
            className="bg-bg-card border border-border rounded-xl p-4 flex items-center gap-4 hover:shadow-md transition-all"
          >
            <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-gradient-to-br from-accent to-accent-hover flex items-center justify-center text-white text-sm font-bold shrink-0">
              {getInitials(c)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm md:text-base text-text-primary">
                {c.nome} {c.cognome}
              </div>
              <div className="text-xs text-text-secondary flex flex-wrap gap-x-3">
                {c.telefono && <span>{c.telefono}</span>}
                {c.email && <span>{c.email}</span>}
                {c.citta && <span>{c.citta}</span>}
                {c.codice_attivita && (
                  <span className="text-accent-hover font-medium">
                    cod. {c.codice_attivita}
                  </span>
                )}
              </div>
            </div>
            {c.telefono && (
              <a
                href={`https://wa.me/${c.telefono.replace(/\s+/g, "").replace(/^\+/, "")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 w-9 h-9 rounded-full bg-[#25D366] text-white flex items-center justify-center text-lg hover:opacity-80 transition-opacity"
                title="WhatsApp"
              >
                💬
              </a>
            )}
          </div>
        ))}
      </div>

      {filtered.length === 0 && !loading && (
        <div className="text-center py-12 text-text-secondary text-sm">
          {customers.length === 0
            ? "Nessun cliente. Aggiungine uno con il bottone qui sopra."
            : "Nessun cliente trovato con la ricerca."}
        </div>
      )}
    </div>
  );
}
