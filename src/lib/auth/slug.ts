// Sanitizza uno slug invito: rimuove caratteri Unicode invisibili
// (es. U+2028 LINE SEPARATOR copiati da WhatsApp) e mantiene solo
// caratteri sicuri per il routing.
export function sanitizeSlug(raw: string): string {
  return raw
    .normalize("NFKC")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/[^A-Za-z0-9-]/g, "")
    .trim();
}
