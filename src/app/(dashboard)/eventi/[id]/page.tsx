"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Calendar, MapPin, ExternalLink, Users, Edit, Trash2,
  MessageCircle, Copy, Send, Eye, Link2,
} from "lucide-react";
import {
  type Evento, type AttendeeRow, type RsvpStato,
  MODALITA_LABELS, MODALITA_BADGE, RSVP_LABELS, RSVP_BADGE,
  BOOKING_LABELS, BOOKING_BADGE,
} from "@/lib/types/events";
import { buildWaLink, buildBroadcastText } from "@/lib/events/whatsapp";
import { EVENT_CREATOR_QUALIFICHE, HIGH_VISIBILITY_QUALIFICHE } from "@/lib/auth/roles";
import { EventBookingLinkCard } from "@/components/eventi/event-booking-link-card";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("it-IT", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}
function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
}

export default function EventoDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [evento, setEvento] = useState<Evento | null>(null);
  const [attendees, setAttendees] = useState<AttendeeRow[]>([]);
  const [confermati, setConfermati] = useState(0);
  const [inAttesa, setInAttesa] = useState(0);
  const [canManage, setCanManage] = useState(false);
  const [canViewAttendeesList, setCanViewAttendeesList] = useState(false);
  const [canSendReminderBtn, setCanSendReminderBtn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [rsvpSaving, setRsvpSaving] = useState(false);
  const [reminderSending, setReminderSending] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [bookingLinkUrl, setBookingLinkUrl] = useState<string | null>(null);
  const [generatingLink, setGeneratingLink] = useState(false);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  useEffect(() => {
    Promise.all([
      fetch(`/api/events/${id}`).then((r) => r.json()),
      fetch("/api/auth/me").then((r) => r.json()),
    ]).then(([evData, meData]) => {
      const e: Evento = evData.event;
      setEvento(e);
      const isCreator = meData.user?.id === e.creato_da;
      const isAdmin = ["topadmin", "admin"].includes(meData.ruolo);
      const isHighQualifica = HIGH_VISIBILITY_QUALIFICHE.includes(meData.qualifica);
      const isEventCreator = EVENT_CREATOR_QUALIFICHE.includes(meData.qualifica) || isAdmin;
      setCanManage(isCreator || isAdmin);
      setCanViewAttendeesList(isCreator || isAdmin || isHighQualifica);
      setCanSendReminderBtn(isCreator || isAdmin || isEventCreator);
      setLoading(false);
    });
  }, [id]);

  useEffect(() => {
    if (!canViewAttendeesList || !evento) return;
    fetch(`/api/events/${id}/attendees`)
      .then((r) => r.json())
      .then((d) => {
        setAttendees(d.attendees || []);
        setConfermati(d.confermati || 0);
        setInAttesa(d.inAttesa || 0);
      });
  }, [canViewAttendeesList, evento, id]);

  async function handleRsvp(stato: RsvpStato) {
    if (!evento) return;
    setRsvpSaving(true);
    const res = await fetch(`/api/events/${id}/rsvp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stato }),
    });
    if (res.ok) {
      setEvento((e) => e ? { ...e, my_rsvp: stato } : e);
      showToast(`RSVP aggiornato: ${RSVP_LABELS[stato]}`);
    }
    setRsvpSaving(false);
  }

  async function handleDelete() {
    if (!confirm("Eliminare questo evento?")) return;
    await fetch(`/api/events/${id}`, { method: "DELETE" });
    router.push("/eventi");
  }

  async function handleGenerateBookingLink() {
    setGeneratingLink(true);
    const res = await fetch(`/api/events/${id}/booking-link`, { method: "POST" });
    const data = await res.json();
    if (res.ok) setBookingLinkUrl(data.url);
    setGeneratingLink(false);
  }

  async function handleSendReminder() {
    setReminderSending(true);
    const res = await fetch(`/api/events/${id}/remind`, { method: "POST" });
    const data = await res.json();
    showToast(`Reminder inviato a ${data.sent} iscritti`);
    setReminderSending(false);
  }

  async function handlePreview() {
    const res = await fetch(`/api/events/${id}/remind-preview`);
    const data = await res.json();
    setPreviewHtml(data.html);
  }

  function handleCopyBroadcast() {
    if (!evento) return;
    const postiRimasti = evento.capienza_max ? evento.capienza_max - confermati : null;
    const text = buildBroadcastText(evento, postiRimasti);
    navigator.clipboard.writeText(text);
    showToast("Testo copiato negli appunti!");
  }

  if (loading) return <div className="p-6 text-text-secondary text-sm">Caricamento…</div>;
  if (!evento) return <div className="p-6 text-text-secondary text-sm">Evento non trovato.</div>;

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-5">
      {/* Torna alla lista */}
      <button
        onClick={() => router.push("/eventi")}
        className="text-sm text-text-secondary hover:text-text-primary transition-colors"
      >
        ← Eventi
      </button>

      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-[#0B2545] text-white text-sm px-4 py-2 rounded-xl shadow-lg">
          {toast}
        </div>
      )}

      {/* Locandina */}
      {evento.locandina_url && (
        <img src={evento.locandina_url} alt={evento.nome} className="w-full max-h-64 object-cover rounded-2xl" />
      )}

      {/* Header */}
      <div className="bg-bg-card rounded-2xl border border-divider p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-text-primary mb-2">{evento.nome}</h1>
            <div className="flex items-center gap-2 flex-wrap">
              {evento.modalita && (
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${MODALITA_BADGE[evento.modalita]}`}>
                  {MODALITA_LABELS[evento.modalita]}
                </span>
              )}
              {evento.prezzo && evento.prezzo > 0 && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-bg-section text-text-secondary">
                  €{evento.prezzo.toLocaleString("it-IT")}
                </span>
              )}
            </div>
          </div>
          {canManage && (
            <div className="flex gap-2 shrink-0">
              <button
                onClick={handleGenerateBookingLink}
                disabled={generatingLink}
                title="Genera link prenotazione pubblico"
                className="p-2 rounded-xl border border-border hover:bg-bg-section transition-colors disabled:opacity-50"
              >
                <Link2 size={16} strokeWidth={1.75} className="text-text-secondary" />
              </button>
              <button
                onClick={() => router.push(`/eventi/${id}/modifica`)}
                title="Modifica"
                className="p-2 rounded-xl border border-border hover:bg-bg-section transition-colors"
              >
                <Edit size={16} strokeWidth={1.75} className="text-text-secondary" />
              </button>
              <button
                onClick={handleDelete}
                title="Elimina"
                className="p-2 rounded-xl border border-border hover:bg-[#fee2e2] transition-colors"
              >
                <Trash2 size={16} strokeWidth={1.75} className="text-[#991b1b]" />
              </button>
            </div>
          )}
        </div>

        {evento.descrizione && (
          <p className="text-sm text-text-secondary mt-3">{evento.descrizione}</p>
        )}

        <div className="mt-4 space-y-2">
          <div className="flex items-center gap-2 text-sm text-text-primary">
            <Calendar size={16} strokeWidth={1.75} className="text-accent shrink-0" />
            <span>{formatDate(evento.data_inizio)} alle {formatTime(evento.data_inizio)}</span>
          </div>
          {evento.location && (
            <div className="flex items-center gap-2 text-sm text-text-primary">
              <MapPin size={16} strokeWidth={1.75} className="text-accent shrink-0" />
              {evento.location_url ? (
                <a href={evento.location_url} target="_blank" rel="noopener" className="text-accent hover:underline">
                  {evento.location}
                </a>
              ) : evento.location}
            </div>
          )}
          {evento.link_evento && (
            <div className="flex items-center gap-2 text-sm">
              <ExternalLink size={16} strokeWidth={1.75} className="text-accent shrink-0" />
              <a href={evento.link_evento} target="_blank" rel="noopener" className="text-accent hover:underline">
                Collegamento evento (Zoom/Meet)
              </a>
            </div>
          )}
          {evento.link_prenotazione && (
            <div className="flex items-center gap-2 text-sm">
              <ExternalLink size={16} strokeWidth={1.75} className="text-accent shrink-0" />
              <a href={evento.link_prenotazione} target="_blank" rel="noopener" className="text-accent hover:underline">
                Link prenotazione
              </a>
            </div>
          )}
        </div>
      </div>

      {/* RSVP */}
      <div className="bg-bg-card rounded-2xl border border-divider p-5">
        <h2 className="font-semibold text-text-primary mb-3 flex items-center gap-2">
          <Users size={16} strokeWidth={1.75} className="text-accent" />
          La tua partecipazione
        </h2>
        <div className="flex gap-2 flex-wrap">
          {(["confermato", "forse", "annullato"] as RsvpStato[]).map((s) => (
            <button
              key={s}
              disabled={rsvpSaving}
              onClick={() => handleRsvp(s)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all border ${
                evento.my_rsvp === s
                  ? s === "confermato" ? "bg-[#dcfce7] border-[#166534] text-[#166534]"
                    : s === "forse" ? "bg-[#fef9c3] border-[#854d0e] text-[#854d0e]"
                    : "bg-[#fee2e2] border-[#991b1b] text-[#991b1b]"
                  : "border-border text-text-secondary hover:bg-bg-section"
              }`}
            >
              {RSVP_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      {/* Lista iscritti (solo per organizzatori) */}
      {canViewAttendeesList && (
        <div className="bg-bg-card rounded-2xl border border-divider p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-text-primary flex items-center gap-2">
              <Users size={16} strokeWidth={1.75} className="text-accent" />
              Iscritti
              <span className="text-sm font-normal text-text-secondary">
                ({confermati} confermati{inAttesa > 0 ? `, ${inAttesa} in lista d'attesa` : ""}{evento.capienza_max ? ` / ${evento.capienza_max}` : ""})
              </span>
            </h2>
            {/* Reminder actions */}
            {canSendReminderBtn && (
              <div className="flex gap-2">
                <button
                  onClick={handlePreview}
                  className="flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary border border-border px-3 py-1.5 rounded-xl transition-colors"
                >
                  <Eye size={13} strokeWidth={1.75} /> Anteprima email
                </button>
                <button
                  disabled={reminderSending}
                  onClick={handleSendReminder}
                  className="flex items-center gap-1 text-xs bg-accent text-white px-3 py-1.5 rounded-xl hover:bg-accent-hover transition-colors disabled:opacity-50"
                >
                  <Send size={13} strokeWidth={1.75} />
                  {reminderSending ? "Invio…" : "Invia reminder"}
                </button>
              </div>
            )}
          </div>

          {/* Copia broadcast WA */}
          <button
            onClick={handleCopyBroadcast}
            className="flex items-center gap-2 text-xs text-text-secondary hover:text-text-primary mb-4 border border-border px-3 py-1.5 rounded-xl transition-colors"
          >
            <Copy size={13} strokeWidth={1.75} />
            Copia testo broadcast WhatsApp
          </button>

          {attendees.length === 0 ? (
            <p className="text-sm text-text-secondary">Nessun iscritto ancora.</p>
          ) : (
            <>
              {/* Mobile */}
              <div className="md:hidden space-y-2">
                {attendees.map((a) => (
                  <div key={`${a.tipo}-${a.id}`} className="flex items-center justify-between p-3 bg-bg-section rounded-xl">
                    <div>
                      <p className="text-sm font-medium text-text-primary">{a.nome}</p>
                      <p className="text-xs text-text-secondary">
                        {a.email}
                        {a.tipo === "prospect" && a.partnerNome && ` · contatto di ${a.partnerNome}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        a.tipo === "partner" ? RSVP_BADGE[a.stato as RsvpStato] : BOOKING_BADGE[a.stato as "confermato" | "in_attesa" | "annullato"]
                      }`}>
                        {a.tipo === "partner" ? RSVP_LABELS[a.stato as RsvpStato] : BOOKING_LABELS[a.stato as "confermato" | "in_attesa" | "annullato"]}
                      </span>
                      {a.telefono && (
                        <a
                          href={buildWaLink(a.telefono, a.nome, evento)}
                          target="_blank"
                          rel="noopener"
                          className="p-1.5 rounded-lg bg-[#25D366] text-white"
                        >
                          <MessageCircle size={13} strokeWidth={1.75} />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop */}
              <table className="hidden md:table w-full text-sm">
                <thead>
                  <tr className="border-b border-divider">
                    {["Nome","Email","Riferimento","Stato","WA"].map((h) => (
                      <th key={h} className="text-left text-xs font-semibold text-text-secondary px-3 py-2 uppercase tracking-wide">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {attendees.map((a) => (
                    <tr key={`${a.tipo}-${a.id}`} className="border-b border-divider last:border-0">
                      <td className="px-3 py-2.5 font-medium text-text-primary">{a.nome}</td>
                      <td className="px-3 py-2.5 text-text-secondary">{a.email}</td>
                      <td className="px-3 py-2.5 text-text-secondary">
                        {a.tipo === "partner" ? "Partner" : (a.partnerNome ? `Contatto di ${a.partnerNome}` : "Prospect")}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          a.tipo === "partner" ? RSVP_BADGE[a.stato as RsvpStato] : BOOKING_BADGE[a.stato as "confermato" | "in_attesa" | "annullato"]
                        }`}>
                          {a.tipo === "partner" ? RSVP_LABELS[a.stato as RsvpStato] : BOOKING_LABELS[a.stato as "confermato" | "in_attesa" | "annullato"]}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        {a.telefono ? (
                          <a
                            href={buildWaLink(a.telefono, a.nome, evento)}
                            target="_blank"
                            rel="noopener"
                            className="inline-flex items-center gap-1 text-xs bg-[#25D366] text-white px-2 py-1 rounded-lg"
                          >
                            <MessageCircle size={12} strokeWidth={1.75} /> WA
                          </a>
                        ) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}

      {/* Modal link prenotazione */}
      {bookingLinkUrl && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="font-semibold text-text-primary">Link prenotazione pubblico</h3>
              <button onClick={() => setBookingLinkUrl(null)} className="text-text-secondary hover:text-text-primary">✕</button>
            </div>
            <div className="p-4">
              <EventBookingLinkCard url={bookingLinkUrl} />
            </div>
          </div>
        </div>
      )}

      {/* Modal preview email */}
      {previewHtml && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="font-semibold text-text-primary">Anteprima email reminder</h3>
              <button onClick={() => setPreviewHtml(null)} className="text-text-secondary hover:text-text-primary">✕</button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              <iframe
                srcDoc={previewHtml}
                className="w-full h-96 border-0"
                title="Preview email"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
