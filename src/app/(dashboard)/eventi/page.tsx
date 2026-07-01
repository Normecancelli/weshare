"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Calendar, Plus, MapPin, Users } from "lucide-react";
import { canCreateEvent } from "@/lib/auth/roles";
import {
  type Evento, type RsvpStato,
  MODALITA_LABELS, MODALITA_BADGE, RSVP_LABELS, RSVP_BADGE, VISIBILITA_LABELS,
} from "@/lib/types/events";

type Tab = "attivi" | "storico";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("it-IT", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export default function EventiPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("attivi");
  const [eventi, setEventi] = useState<Evento[]>([]);
  const [loading, setLoading] = useState(true);
  const [canCreate, setCanCreate] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        setCanCreate(canCreateEvent(d.ruolo, d.qualifica));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchEventi();
  }, [tab]);

  async function fetchEventi() {
    setLoading(true);
    const res = await fetch(`/api/events?tab=${tab}`);
    const data = await res.json();
    setEventi(data.events || []);
    setLoading(false);
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Calendar size={22} strokeWidth={1.75} className="text-accent" />
          <h1 className="text-xl font-bold text-text-primary">Eventi</h1>
        </div>
        {canCreate && (
          <button
            onClick={() => router.push("/eventi/nuovo")}
            className="flex items-center gap-2 bg-accent hover:bg-accent-hover text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
          >
            <Plus size={16} strokeWidth={2} />
            Nuovo evento
          </button>
        )}
      </div>

      {/* Tab */}
      <div className="flex gap-1 mb-4 bg-bg-section rounded-xl p-1 w-fit">
        {(["attivi", "storico"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              tab === t ? "bg-white text-text-primary shadow-sm" : "text-text-secondary hover:text-text-primary"
            }`}
          >
            {t === "attivi" ? "Attivi" : "Storico"}
          </button>
        ))}
      </div>

      {loading && <p className="text-text-secondary text-sm py-8 text-center">Caricamento…</p>}

      {!loading && eventi.length === 0 && (
        <div className="text-center py-16 text-text-secondary">
          <Calendar size={40} strokeWidth={1} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">Nessun evento {tab === "attivi" ? "in programma" : "nel passato"}</p>
        </div>
      )}

      {/* Mobile: card */}
      {!loading && eventi.length > 0 && (
        <>
          <div className="md:hidden space-y-3">
            {eventi.map((e) => (
              <button
                key={e.id}
                onClick={() => router.push(`/eventi/${e.id}`)}
                className="w-full text-left bg-bg-card rounded-2xl p-4 border border-divider hover:border-accent/30 transition-colors"
              >
                {e.locandina_url && (
                  <img src={e.locandina_url} alt={e.nome} className="w-full h-32 object-cover rounded-xl mb-3" />
                )}
                <p className="font-semibold text-text-primary text-sm mb-1">{e.nome}</p>
                <p className="text-xs text-text-secondary mb-2">{formatDate(e.data_inizio)}</p>
                {e.location && (
                  <p className="text-xs text-text-secondary flex items-center gap-1 mb-2">
                    <MapPin size={12} strokeWidth={1.75} /> {e.location}
                  </p>
                )}
                <div className="flex items-center gap-2 flex-wrap">
                  {e.modalita && (
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${MODALITA_BADGE[e.modalita]}`}>
                      {MODALITA_LABELS[e.modalita]}
                    </span>
                  )}
                  <span className="text-xs px-2 py-0.5 rounded-full bg-bg-section text-text-secondary">
                    {VISIBILITA_LABELS[e.visibilita]}
                  </span>
                  {e.my_rsvp && (
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${RSVP_BADGE[e.my_rsvp as RsvpStato]}`}>
                      {RSVP_LABELS[e.my_rsvp as RsvpStato]}
                    </span>
                  )}
                  {e.capienza_max && (
                    <span className="text-xs text-text-secondary flex items-center gap-1 ml-auto">
                      <Users size={12} strokeWidth={1.75} /> {e.attendees_count}/{e.capienza_max}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>

          {/* Desktop: tabella */}
          <div className="hidden md:block bg-bg-card rounded-2xl border border-divider overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-divider">
                  {["Evento","Data","Luogo","Modalità","Iscritti","Il tuo RSVP"].map((h) => (
                    <th key={h} className="text-left text-xs font-semibold text-text-secondary px-4 py-3 uppercase tracking-wide">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {eventi.map((e) => (
                  <tr
                    key={e.id}
                    onClick={() => router.push(`/eventi/${e.id}`)}
                    className="border-b border-divider last:border-0 hover:bg-bg-section cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 font-medium text-text-primary">{e.nome}</td>
                    <td className="px-4 py-3 text-text-secondary whitespace-nowrap">{formatDate(e.data_inizio)}</td>
                    <td className="px-4 py-3 text-text-secondary">{e.location || "—"}</td>
                    <td className="px-4 py-3">
                      {e.modalita ? (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${MODALITA_BADGE[e.modalita]}`}>
                          {MODALITA_LABELS[e.modalita]}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3 text-text-secondary">
                      {e.capienza_max ? `${e.attendees_count}/${e.capienza_max}` : e.attendees_count || "—"}
                    </td>
                    <td className="px-4 py-3">
                      {e.my_rsvp ? (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${RSVP_BADGE[e.my_rsvp as RsvpStato]}`}>
                          {RSVP_LABELS[e.my_rsvp as RsvpStato]}
                        </span>
                      ) : <span className="text-text-secondary">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
