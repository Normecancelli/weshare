// Sanitizza uno slug invito: decodifica percent-escape (Next.js useParams
// restituisce la forma encoded), rimuove caratteri Unicode invisibili
// (es. U+2028 LINE SEPARATOR copiati da WhatsApp) e mantiene solo
// caratteri sicuri per il routing.
export function sanitizeSlug(raw: string): string {
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    // Sequenza percent invalida — usa il raw e lascia che i replace lo puliscano.
  }
  return decoded
    .normalize("NFKC")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/[^A-Za-z0-9-]/g, "")
    .trim();
}
