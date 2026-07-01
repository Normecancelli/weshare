"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { EventForm } from "@/components/eventi/event-form";
import type { Evento } from "@/lib/types/events";

export default function ModificaEventoPage() {
  const { id } = useParams<{ id: string }>();
  const [evento, setEvento] = useState<Evento | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/events/${id}`)
      .then((r) => r.json())
      .then((d) => { setEvento(d.event); setLoading(false); });
  }, [id]);

  async function handleSubmit(data: Partial<Evento>) {
    const res = await fetch(`/api/events/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Errore aggiornamento evento");
    }
    return { id };
  }

  if (loading) return <div className="p-6 text-text-secondary text-sm">Caricamento…</div>;
  if (!evento) return <div className="p-6 text-text-secondary text-sm">Evento non trovato.</div>;

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto">
      <h1 className="text-xl font-bold text-text-primary mb-6">Modifica evento</h1>
      <div className="bg-bg-card rounded-2xl border border-divider p-6">
        <EventForm initial={evento} onSubmit={handleSubmit} submitLabel="Salva modifiche" />
      </div>
    </div>
  );
}
