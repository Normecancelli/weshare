# AI genera titolo+descrizione evento — Design

## Contesto

Sessione B (Eventi) è in produzione dal 2026-07-01. TODO aperto: rifinire il flusso di creazione evento. L'organizzatore spesso non sa come formulare titolo e descrizione in modo efficace. WeShare ha già un pattern consolidato per feature AI: l'estrazione ordini da WhatsApp (`src/app/api/orders/parse-whatsapp/route.ts`) usa `claude-haiku-4-5` con tool-forced JSON output. Questa feature replica lo stesso pattern per generare titolo+descrizione evento.

## Obiettivo

Aggiungere al form crea/modifica evento (`src/components/eventi/event-form.tsx`) un modale AI che, data una breve idea testuale dell'organizzatore, genera 3 varianti di titolo+descrizione (una per tono) da usare direttamente nel form.

## Flusso UI

1. Sopra i campi "Nome evento" / "Descrizione" in `event-form.tsx`, un pulsante testuale "✨ Genera con AI".
2. Click apre `<AiGenerateEventModal>`:
   - Textarea "Descrivi l'evento in poche parole" (placeholder: "serata formazione prodotti SA8, aperta a tutto il gruppo").
   - Nessun altro campo richiesto: il modale legge dal form già compilato `data_inizio`, `location`, `modalita`, `prezzo`, `visibilita` e li passa come contesto silenzioso (non mostrati come input separati, solo eventualmente riassunti in una riga informativa tipo "Userò: 12/09 ore 19:00, Hotel Milano, in presenza").
   - Bottone "Genera" → stato loading → 3 card risultato, una per tono: **Formale**, **Entusiasta**, **Diretto**. Ogni card mostra titolo + descrizione proposti e un bottone "Usa questa".
   - Click "Usa questa" → `set("nome", titolo)` + `set("descrizione", descrizione)` nel form padre, chiude il modale.
   - Bottone "Rigenera" (richiama l'API con la stessa idea) e "Annulla" (chiude senza applicare).
3. Il modale è puramente client-side (`use client`), riceve `formSnapshot` e i setter `set` come props da `EventForm`.

## Backend

Nuovo endpoint `POST /api/events/generate-description`, stesso scheletro di `parse-whatsapp/route.ts`:

- Auth: `supabase.auth.getUser()`, 401 se assente (nessun role-gate aggiuntivo: il form eventi è già visibile solo a chi può creare eventi).
- Env: 500 se `ANTHROPIC_API_KEY` assente, stesso messaggio di errore del pattern esistente.
- Input atteso:
  ```ts
  {
    idea: string; // obbligatorio, max 500 caratteri, trim
    contesto?: {
      data_inizio?: string;   // ISO
      location?: string;
      modalita?: "presenza" | "online" | "hybrid";
      prezzo?: number;
      visibilita?: "globale" | "gruppo";
    };
  }
  ```
  400 se `idea` mancante/vuota o >500 caratteri.
- Chiamata Anthropic: `claude-haiku-4-5`, `tool_choice` forzato su un tool `genera_varianti_evento` con `input_schema`:
  ```ts
  {
    varianti: [{
      tono: "formale" | "entusiasta" | "diretto";
      titolo: string;   // max ~80 caratteri, no emoji
      descrizione: string; // 2-4 frasi
    }] // esattamente 3, uno per tono, in quest'ordine
  }
  ```
  Niente prompt caching (nessun blocco grande e stabile da cachare, a differenza del catalogo prodotti).
- System prompt: istruzioni su tono (Formale = istituzionale/professionale, Entusiasta = caldo/coinvolgente con energia, Diretto = breve e concreto), lingua italiana, uso del contesto se presente ma senza inventare dettagli non forniti (es. non inventare un luogo se `location` è assente), niente emoji nel titolo, evitare markdown.
- Errori: eccezione Anthropic → 502 `{ error: "Errore AI: <msg>" }`; risposta senza `tool_use` valido → 502 `{ error: "L'AI non ha restituito un risultato valido. Riprova." }`.
- Successo: `NextResponse.json({ varianti })`, passthrough diretto dell'output del tool (nessun arricchimento server-side necessario, a differenza del parser ordini che deve fare match col catalogo).

## File coinvolti

- **Nuovo**: `src/app/api/events/generate-description/route.ts`
- **Nuovo**: `src/components/eventi/ai-generate-modal.tsx`
- **Modificato**: `src/components/eventi/event-form.tsx` (bottone + stato apertura modale + integrazione set nome/descrizione)

## Fuori scope

- Nessuna persistenza delle idee/generazioni passate (no storico, no tabella DB).
- Nessuna generazione immagine/locandina.
- Nessuna variazione del numero di varianti (sempre 3, sempre gli stessi 3 toni fissi) — non configurabile.
- Nessun role-gate diverso da quello già esistente sul form eventi.

## Testing

- Manuale: aprire `/eventi/nuovo`, cliccare "Genera con AI", verificare le 3 varianti, applicarne una, verificare che i campi si popolino e restino modificabili.
- Verificare errore gestito quando `ANTHROPIC_API_KEY` non è settata (messaggio chiaro, no crash).
- Verificare che il contesto (data/luogo/modalità già compilati) influenzi effettivamente il testo generato.
