import type { Evento } from "@/lib/types/events";

export const DEFAULT_EMAIL_TEMPLATE = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F0F4F8;font-family:system-ui,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center" style="padding:24px 16px">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">
          <tr>
            <td style="background:#0B2545;padding:24px 32px;border-radius:12px 12px 0 0">
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700">WeShare</h1>
              <p style="margin:4px 0 0;color:rgba(255,255,255,0.6);font-size:12px">powered by Me.To.Do for you®</p>
            </td>
          </tr>
          <tr>
            <td style="background:#ffffff;padding:32px;border-radius:0 0 12px 12px">
              <p style="margin:0 0 16px;color:#0B2545;font-size:16px">Ciao <strong>{nome}</strong>!</p>
              {{#if locandina_url}}
              <img src="{locandina_url}" alt="{nome_evento}" style="width:100%;border-radius:8px;margin-bottom:24px;display:block">
              {{/if}}
              <h2 style="margin:0 0 16px;color:#0B2545;font-size:20px">{nome_evento}</h2>
              <table cellpadding="0" cellspacing="0" style="margin-bottom:24px">
                <tr><td style="padding:4px 0;color:#4A6480;font-size:14px">📅</td><td style="padding:4px 8px;color:#0B2545;font-size:14px"><strong>{data}</strong> alle <strong>{ora}</strong></td></tr>
                {{#if location}}<tr><td style="padding:4px 0;color:#4A6480;font-size:14px">📍</td><td style="padding:4px 8px;color:#0B2545;font-size:14px">{location}</td></tr>{{/if}}
                {{#if link_evento}}<tr><td style="padding:4px 0;color:#4A6480;font-size:14px">🔗</td><td style="padding:4px 8px"><a href="{link_evento}" style="color:#1D6FA4">Collegamento evento</a></td></tr>{{/if}}
              </table>
              {{#if testo_reminder}}
              <div style="background:#E6F1FB;border-left:4px solid #1D6FA4;padding:16px;border-radius:0 8px 8px 0;margin-bottom:24px">
                <p style="margin:0;color:#0C447C;font-size:14px">{testo_reminder}</p>
              </div>
              {{/if}}
              <a href="{link_app}" style="display:inline-block;background:#1D6FA4;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:14px">Vedi dettagli evento</a>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 0;text-align:center;color:#6B8099;font-size:12px">
              WeShare · powered by Me.To.Do for you® · <a href="https://weshare.growset.it" style="color:#1D6FA4">weshare.growset.it</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("it-IT", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
}

function applyTemplate(template: string, vars: Record<string, string | null | undefined>): string {
  let result = template;
  // Gestisci {{#if var}}...{{/if}}
  result = result.replace(/\{\{#if (\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (_, key, content) => {
    return vars[key] ? content : "";
  });
  // Sostituisci variabili
  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(`{${key}}`, value || "");
  }
  return result;
}

export type ReminderTier = "7d" | "1d" | "2h";

export function buildReminderEmail(
  evento: Evento,
  attendeeName: string,
  tier: ReminderTier,
  globalTemplate?: string | null
): { subject: string; html: string } {
  const template = globalTemplate || DEFAULT_EMAIL_TEMPLATE;
  const subject = {
    "7d": `${evento.nome} è tra 7 giorni!`,
    "1d": `Reminder: ${evento.nome} è domani!`,
    "2h": `${evento.nome} inizia tra poche ore!`,
  }[tier];

  const html = applyTemplate(template, {
    nome: attendeeName,
    nome_evento: evento.nome,
    data: formatDate(evento.data_inizio),
    ora: formatTime(evento.data_inizio),
    location: evento.location,
    link_evento: evento.link_evento,
    locandina_url: evento.locandina_url,
    testo_reminder: evento.testo_reminder,
    link_app: `https://weshare.growset.it/eventi/${evento.id}`,
  });

  return { subject, html };
}

export function buildBookingConfirmationEmail(
  evento: Evento,
  nome: string,
  stato: "confermato" | "in_attesa"
): { subject: string; html: string } {
  const subject = stato === "confermato"
    ? `Prenotazione confermata: ${evento.nome}`
    : `In lista d'attesa: ${evento.nome}`;

  const statoMsg = stato === "confermato"
    ? "La tua prenotazione è confermata!"
    : "Sei in lista d'attesa: ti contatteremo se si libera un posto.";

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F0F4F8;font-family:system-ui,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center" style="padding:24px 16px">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">
          <tr>
            <td style="background:#0B2545;padding:24px 32px;border-radius:12px 12px 0 0">
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700">WeShare</h1>
              <p style="margin:4px 0 0;color:rgba(255,255,255,0.6);font-size:12px">powered by Me.To.Do for you®</p>
            </td>
          </tr>
          <tr>
            <td style="background:#ffffff;padding:32px;border-radius:0 0 12px 12px">
              <p style="margin:0 0 16px;color:#0B2545;font-size:16px">Ciao <strong>${escapeHtml(nome)}</strong>,</p>
              <p style="margin:0 0 16px;color:#0B2545;font-size:15px">${statoMsg}</p>
              <h2 style="margin:0 0 16px;color:#0B2545;font-size:20px">${evento.nome}</h2>
              <table cellpadding="0" cellspacing="0" style="margin-bottom:8px">
                <tr><td style="padding:4px 0;color:#4A6480;font-size:14px">📅</td><td style="padding:4px 8px;color:#0B2545;font-size:14px"><strong>${formatDate(evento.data_inizio)}</strong> alle <strong>${formatTime(evento.data_inizio)}</strong></td></tr>
                ${evento.location ? `<tr><td style="padding:4px 0;color:#4A6480;font-size:14px">📍</td><td style="padding:4px 8px;color:#0B2545;font-size:14px">${evento.location}</td></tr>` : ""}
                ${evento.link_evento ? `<tr><td style="padding:4px 0;color:#4A6480;font-size:14px">🔗</td><td style="padding:4px 8px"><a href="${evento.link_evento}" style="color:#1D6FA4">Collegamento evento</a></td></tr>` : ""}
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 0;text-align:center;color:#6B8099;font-size:12px">
              WeShare · powered by Me.To.Do for you® · <a href="https://weshare.growset.it" style="color:#1D6FA4">weshare.growset.it</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

  return { subject, html };
}
