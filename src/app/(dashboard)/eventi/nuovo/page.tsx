"use client";

import { EventForm } from "@/components/eventi/event-form";
import type { Evento } from "@/lib/types/events";

export default function NuovoEventoPage() {
  async function handleSubmit(data: Partial<Evento>) {
    const res = await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Errore creazione evento");
    }
    const { event } = await res.json();
    return { id: event.id };
  }

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto">
      <h1 className="text-xl font-bold text-text-primary mb-6">Nuovo evento</h1>
      <div className="bg-bg-card rounded-2xl border border-divider p-6">
        <EventForm onSubmit={handleSubmit} submitLabel="Crea evento" />
      </div>
    </div>
  );
}
