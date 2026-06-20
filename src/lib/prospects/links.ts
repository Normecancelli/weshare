// Prefilled native-app link builders for prospect actions.
// No OAuth, no backend — these open the partner's own Calendar/Mail/WhatsApp.

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

// Google Calendar TEMPLATE urls want UTC basic format: YYYYMMDDTHHMMSSZ
function toGCalUtc(iso: string): string {
  const d = new Date(iso);
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    "T" +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    "Z"
  );
}

export function buildGoogleCalendarUrl(appt: {
  titolo: string;
  data_ora: string;
  durata_min: number;
  location?: string | null;
  note?: string | null;
}): string {
  const start = new Date(appt.data_ora);
  const end = new Date(start.getTime() + (appt.durata_min || 60) * 60000);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: appt.titolo,
    dates: `${toGCalUtc(appt.data_ora)}/${toGCalUtc(end.toISOString())}`,
  });
  if (appt.note) params.set("details", appt.note);
  if (appt.location) params.set("location", appt.location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function buildMailto(to: string, subject: string, body: string): string {
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(
    subject
  )}&body=${encodeURIComponent(body)}`;
}

export function buildWhatsappUrl(phone: string, text: string): string {
  const clean = phone.replace(/\s+/g, "").replace(/^\+/, "");
  return `https://wa.me/${clean}?text=${encodeURIComponent(text)}`;
}
