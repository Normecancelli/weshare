"use client";

import { useEffect, useState, useCallback } from "react";
import type { Customer, CustomerDate } from "@/lib/types/orders";
import { RowActions, EditIcon, MessageIcon } from "@/components/icons";

const inputClass =
  "w-full px-4 py-2.5 rounded-xl text-sm border border-border bg-bg-main focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent";

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
    citta: "",
  });
  const [saving, setSaving] = useState(false);

  // Modal state
  const [editCustomer, setEditCustomer] = useState<Customer | null>(null);
  const [editForm, setEditForm] = useState({
    nome: "",
    cognome: "",
    telefono: "",
    email: "",
    indirizzo: "",
    citta: "",
    note: "",
  });
  const [editSaving, setEditSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  // Customer dates
  const [dates, setDates] = useState<CustomerDate[]>([]);
  const [newDate, setNewDate] = useState({ data: "", descrizione: "" });
  const [dateSaving, setDateSaving] = useState(false);

  useEffect(() => {
    fetchCustomers();
  }, []);

  const fetchDates = useCallback(async (customerId: string) => {
    const res = await fetch(`/api/customers/${customerId}/dates`);
    const data = await res.json();
    setDates(data.dates || []);
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
      setFormData({ nome: "", cognome: "", telefono: "", email: "", citta: "" });
      setShowForm(false);
      fetchCustomers();
    }
    setSaving(false);
  }

  function openEdit(c: Customer) {
    setEditCustomer(c);
    setEditForm({
      nome: c.nome,
      cognome: c.cognome || "",
      telefono: c.telefono || "",
      email: c.email || "",
      indirizzo: c.indirizzo || "",
      citta: c.citta || "",
      note: c.note || "",
    });
    setConfirmDelete(false);
    setDeleteError("");
    fetchDates(c.id);
  }

  function closeEdit() {
    setEditCustomer(null);
    setDates([]);
    setNewDate({ data: "", descrizione: "" });
    setConfirmDelete(false);
    setDeleteError("");
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editCustomer || !editForm.nome.trim()) return;
    setEditSaving(true);

    const requests: Promise<Response>[] = [
      fetch(`/api/customers/${editCustomer.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      }),
    ];

    const hasPendingDate = newDate.data && newDate.descrizione.trim();
    if (hasPendingDate) {
      requests.push(
        fetch(`/api/customers/${editCustomer.id}/dates`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(newDate),
        }),
      );
    }

    const [updateRes] = await Promise.all(requests);
    if (updateRes.ok) {
      closeEdit();
      fetchCustomers();
    }
    setEditSaving(false);
  }

  async function handleDelete() {
    if (!editCustomer) return;
    setDeleting(true);
    setDeleteError("");
    const res = await fetch(`/api/customers/${editCustomer.id}`, {
      method: "DELETE",
    });
    if (res.ok) {
      closeEdit();
      fetchCustomers();
    } else {
      const data = await res.json();
      setDeleteError(data.error || "Errore durante l'eliminazione");
    }
    setDeleting(false);
  }

  async function handleAddDate(e: React.FormEvent) {
    e.preventDefault();
    if (!editCustomer || !newDate.data || !newDate.descrizione.trim()) return;
    setDateSaving(true);
    const res = await fetch(`/api/customers/${editCustomer.id}/dates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newDate),
    });
    if (res.ok) {
      setNewDate({ data: "", descrizione: "" });
      fetchDates(editCustomer.id);
    }
    setDateSaving(false);
  }

  async function handleDeleteDate(dateId: string) {
    if (!editCustomer) return;
    await fetch(`/api/customers/${editCustomer.id}/dates/${dateId}`, {
      method: "DELETE",
    });
    fetchDates(editCustomer.id);
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

  function formatDate(d: string) {
    return new Date(d).toLocaleDateString("it-IT", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
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

      {showForm && (
        <form
          onSubmit={handleCreate}
          className="bg-bg-card border border-border rounded-2xl p-4 md:p-6 mb-6"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
            <input type="text" placeholder="Nome *" value={formData.nome} onChange={(e) => setFormData({ ...formData, nome: e.target.value })} required className={inputClass} />
            <input type="text" placeholder="Cognome" value={formData.cognome} onChange={(e) => setFormData({ ...formData, cognome: e.target.value })} className={inputClass} />
            <input type="tel" placeholder="Telefono" value={formData.telefono} onChange={(e) => setFormData({ ...formData, telefono: e.target.value })} className={inputClass} />
            <input type="email" placeholder="Email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} className={inputClass} />
            <input type="text" placeholder="Città" value={formData.citta} onChange={(e) => setFormData({ ...formData, citta: e.target.value })} className={inputClass} />
          </div>
          <button type="submit" disabled={saving} className="px-6 py-2.5 rounded-xl text-sm font-semibold bg-accent text-white hover:bg-accent-hover transition-all disabled:opacity-50">
            {saving ? "Salvataggio..." : "Salva cliente"}
          </button>
        </form>
      )}

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

      <div className="space-y-2">
        {filtered.map((c) => (
          <button
            key={c.id}
            onClick={() => openEdit(c)}
            className="w-full text-left bg-bg-card border border-border rounded-xl p-4 flex items-center gap-4 hover:shadow-md hover:border-accent/30 transition-all"
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
              </div>
            </div>
            {c.telefono && (
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  window.open(
                    `https://wa.me/${c.telefono!.replace(/\s+/g, "").replace(/^\+/, "")}`,
                    "_blank"
                  );
                }}
                className="shrink-0 w-9 h-9 rounded-full bg-[#25D366] text-white flex items-center justify-center hover:opacity-80 transition-opacity cursor-pointer"
                title="WhatsApp"
              >
                <MessageIcon />
              </span>
            )}
            <span
              onClick={(e) => {
                e.stopPropagation();
                openEdit(c);
              }}
              className="shrink-0 w-9 h-9 rounded-full bg-bg-section text-text-gentle hover:text-accent hover:bg-accent-glow flex items-center justify-center transition-all cursor-pointer"
              title="Modifica"
            >
              <EditIcon size={16} />
            </span>
          </button>
        ))}
      </div>

      {filtered.length === 0 && !loading && (
        <div className="text-center py-12 text-text-secondary text-sm">
          {customers.length === 0
            ? "Nessun cliente. Aggiungine uno con il bottone qui sopra."
            : "Nessun cliente trovato con la ricerca."}
        </div>
      )}

      {/* Edit modal */}
      {editCustomer && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center pt-8 md:pt-16 px-4 overflow-y-auto">
          <div className="bg-bg-card border border-border rounded-2xl w-full max-w-lg shadow-xl mb-8">
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-divider">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-accent to-accent-hover flex items-center justify-center text-white text-sm font-bold">
                  {getInitials(editCustomer)}
                </div>
                <h3 className="text-lg font-bold text-text-primary">
                  Modifica cliente
                </h3>
              </div>
              <button
                onClick={closeEdit}
                className="w-8 h-8 rounded-lg hover:bg-bg-section flex items-center justify-center text-text-secondary transition-all"
              >
                ✕
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleUpdate} className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-text-secondary mb-1 block">Nome *</label>
                  <input type="text" value={editForm.nome} onChange={(e) => setEditForm({ ...editForm, nome: e.target.value })} required className={inputClass} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-text-secondary mb-1 block">Cognome</label>
                  <input type="text" value={editForm.cognome} onChange={(e) => setEditForm({ ...editForm, cognome: e.target.value })} className={inputClass} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-text-secondary mb-1 block">Telefono</label>
                  <input type="tel" value={editForm.telefono} onChange={(e) => setEditForm({ ...editForm, telefono: e.target.value })} className={inputClass} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-text-secondary mb-1 block">Email</label>
                  <input type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} className={inputClass} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-text-secondary mb-1 block">Indirizzo</label>
                  <input type="text" value={editForm.indirizzo} onChange={(e) => setEditForm({ ...editForm, indirizzo: e.target.value })} className={inputClass} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-text-secondary mb-1 block">Città</label>
                  <input type="text" value={editForm.citta} onChange={(e) => setEditForm({ ...editForm, citta: e.target.value })} className={inputClass} />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-text-secondary mb-1 block">Note</label>
                <textarea value={editForm.note} onChange={(e) => setEditForm({ ...editForm, note: e.target.value })} rows={2} placeholder="Note sul cliente..." className={`${inputClass} resize-none`} />
              </div>

              {/* Date promemoria */}
              <div className="border-t border-divider pt-4">
                <div className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-3">
                  Date da ricordare
                </div>

                {dates.length > 0 && (
                  <div className="space-y-2 mb-3">
                    {dates.map((d) => (
                      <div
                        key={d.id}
                        className="flex items-center gap-3 p-2.5 bg-bg-main rounded-xl"
                      >
                        <div className="w-8 h-8 rounded-lg bg-accent-glow flex items-center justify-center text-accent text-xs font-bold shrink-0">
                          📅
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-sm text-text-primary">
                            {d.descrizione}
                          </div>
                          <div className="text-xs text-text-secondary">
                            {formatDate(d.data)}
                          </div>
                        </div>
                        <RowActions
                          onEdit={() => {
                            setNewDate({ data: d.data, descrizione: d.descrizione });
                            handleDeleteDate(d.id);
                          }}
                          onDelete={() => handleDeleteDate(d.id)}
                        />
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <input
                      type="date"
                      value={newDate.data}
                      onChange={(e) => setNewDate({ ...newDate, data: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg text-sm border border-border bg-bg-main focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
                    />
                  </div>
                  <div className="flex-[2]">
                    <input
                      type="text"
                      placeholder="es. Compleanno, Anniversario..."
                      value={newDate.descrizione}
                      onChange={(e) => setNewDate({ ...newDate, descrizione: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg text-sm border border-border bg-bg-main focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleAddDate}
                    disabled={dateSaving || !newDate.data || !newDate.descrizione.trim()}
                    className="px-3 py-2 rounded-lg text-sm font-semibold bg-accent text-white hover:bg-accent-hover transition-all disabled:opacity-40 shrink-0"
                  >
                    {dateSaving ? "..." : "+"}
                  </button>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between pt-2 border-t border-divider">
                <div>
                  {!confirmDelete ? (
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(true)}
                      className="text-sm text-coral font-medium hover:opacity-70 transition-opacity"
                    >
                      Elimina cliente
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
                        onClick={() => { setConfirmDelete(false); setDeleteError(""); }}
                        className="text-sm text-text-secondary hover:text-text-primary transition-colors"
                      >
                        Annulla
                      </button>
                    </div>
                  )}
                  {deleteError && (
                    <p className="text-xs text-coral mt-1">{deleteError}</p>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={closeEdit}
                    className="px-4 py-2 rounded-xl text-sm text-text-secondary hover:bg-bg-section transition-all"
                  >
                    Annulla
                  </button>
                  <button
                    type="submit"
                    disabled={editSaving}
                    className="px-5 py-2 rounded-xl text-sm font-semibold bg-accent text-white hover:bg-accent-hover transition-all disabled:opacity-50"
                  >
                    {editSaving ? "..." : "Salva"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
