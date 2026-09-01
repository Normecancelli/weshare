// Molti siti Next.js (incluso amway.it) servono le immagini tramite il
// proprio endpoint di ottimizzazione "/_next/image?url=<encoded>&w=...&q=...".
// Quel link è interno al sito sorgente (spesso protetto, non riusabile da
// fuori) — il vero URL dell'immagine è nel parametro "url". Se l'input non
// corrisponde a questo pattern, viene ritornato invariato.
export function extractDirectImageUrl(pastedUrl: string): string {
  try {
    const parsed = new URL(pastedUrl);
    if (parsed.pathname.endsWith("/_next/image")) {
      const inner = parsed.searchParams.get("url");
      if (inner) return inner;
    }
  } catch {
    // Non è un URL assoluto valido: lascialo così com'è.
  }
  return pastedUrl;
}
