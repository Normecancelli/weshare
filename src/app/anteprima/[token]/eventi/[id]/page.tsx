"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Calendar, MapPin, ArrowLeft } from "lucide-react";
import { InlineMessage } from "@/components/ui/inline-message";
import { BookingForm, type BookingFormValues } from "@/components/eventi/booking-form";

interface EventoPubblico {
  id: string;
  nome: string;
  descrizione: string | null;
  data_inizio: string;
  location: string | null;
  location_url: string | null;
  modalita: string | null;
  prezzo: number | null;
  locandina_url: string | null;
  link_evento: string | null;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("it-IT", {
    weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export default function AnteprimaEventoPrenotaPage() {
  const { token, id } = useParams<{ token: string; id: string }>();
  const [evento, setEvento] = useState<EventoPubblico | null>(null);
  const [postiRimasti, setPostiRimasti] = useState<number | null>(null);
  const [prospect, setProspect] = useState<{ nome: string; telefono: string | null; email: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [esito, setEsito] = useState<"confermato" | "in_attesa" | null>(null);

  useEffect(() => {
    fetch(`/api/anteprima/${token}/eventi/${id}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) { setError(d.error || "Link non valido"); return; }
        setEvento(d.evento);
        setPostiRimasti(d.postiRimasti);
        setProspect(d.prospect);
      })
      .catch(() => setError("Errore di caricamento. Riprova più tardi."))
      .finally(() => setLoading(false));
  }, [token, id]);

  async function handleSubmit(values: BookingFormValues) {
    const res = await fetch(`/api/anteprima/${token}/eventi/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome: values.nome, telefono: values.telefono, email: values.email }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Errore durante l'invio, riprova.");
    setEsito(data.stato);
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-screen">
        <div className="w-10 h-10 border-3 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !evento) {
    return (
      <div className="flex-1 flex items-center justify-center bg-bg-main px-4 min-h-screen">
        <div className="w-full max-w-md text-center bg-bg-card border border-border rounded-2xl p-8">
          <InlineMessage variant="warning">{error || "Evento non disponibile."}</InlineMessage>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-screen bg-bg-main px-4 py-10 overflow-y-auto">
      <div className="w-full max-w-md mx-auto">
        <Link href={`/anteprima/${token}`} className="flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary mb-4">
          <ArrowLeft size={14} strokeWidth={1.75} /> Torna alla vetrina
        </Link>
        {evento.locandina_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={evento.locandina_url} alt={evento.nome} className="w-full max-h-56 object-cover rounded-2xl mb-4" />
        )}
        <div className="bg-bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
          <div className="p-6 border-b border-divider">
            <h1 className="text-lg font-bold text-text-primary mb-2">{evento.nome}</h1>
            {evento.descrizione && <p className="text-sm text-text-secondary mb-3">{evento.descrizione}</p>}
            <div className="flex items-center gap-2 text-sm text-text-primary mb-1">
              <Calendar size={14} strokeWidth={1.75} className="text-accent shrink-0" />
              {formatDate(evento.data_inizio)}
            </div>
            {evento.location && (
              <div className="flex items-center gap-2 text-sm text-text-primary">
                <MapPin size={14} strokeWidth={1.75} className="text-accent shrink-0" />
                {evento.location}
              </div>
            )}
            {postiRimasti !== null && (
              <p className="text-xs text-text-secondary mt-2">
                {postiRimasti > 0
                  ? `${postiRimasti} posti rimasti`
                  : "Posti esauriti — nuove prenotazioni in lista d'attesa"}
              </p>
            )}
          </div>

          <div className="p-6">
            {esito ? (
              <InlineMessage variant={esito === "confermato" ? "success" : "warning"}>
                {esito === "confermato"
                  ? "Prenotazione confermata! Ti aspettiamo."
                  : "Sei in lista d'attesa: ti contatteremo se si libera un posto."}
              </InlineMessage>
            ) : (
              <BookingForm
                initial={{ nome: prospect?.nome || "", telefono: prospect?.telefono || "", email: prospect?.email || "" }}
                showCognome={false}
                onSubmit={handleSubmit}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
