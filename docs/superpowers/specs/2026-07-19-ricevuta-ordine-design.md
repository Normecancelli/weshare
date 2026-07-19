# Ricevuta ordine (PDF + email + WhatsApp) — Design

## Contesto

Oggi la pagina ordine (`/ordini-clienti/[id]`) mostra cliente, articoli e totali (cliente/VP/provvigione) ma non produce nulla di stampabile o inviabile al cliente finale. L'utente ha fornito un modulo Amway di riferimento (`MODULO D'ORDINE – RICEVUTA`) e vuole poterlo generare come PDF per un ordine, senza VP né provvigioni (dati interni, non da mostrare al cliente), e poterlo inviare via email o allegare manualmente a una chat WhatsApp.

Il bottone "Ricevuta" è visibile su **qualsiasi ordine**, indipendentemente dallo stato (bozza/confermato/completato/annullato) — nessun vincolo, per scelta esplicita dell'utente.

## Decisioni chiave

- **Generazione PDF**: libreria `@react-pdf/renderer` (layout JSX/flexbox), generato lato server on-demand ad ogni richiesta — nessun file salvato/cacheato, nessuna dipendenza da browser headless (adatto a Vercel serverless).
- **Contenuto ricevuta**: replica il modulo Amway fornito, ma **senza** la sezione P.IVA/Codice SDI/Pec ("Merce da fatturare a") — i clienti in anagrafica hanno solo nome/cognome/indirizzo/città/telefono, nessun dato business. **Senza** VP e provvigioni. **Senza** le righe Subtotale/Spese di contrassegno/Spese di trasporto (non tracciati oggi in `client_orders`) — un solo importo, "Totale da pagare" = `order.totale_cliente`.
- **Numero ricevuta**: prime 8 caratteri (maiuscolo) dell'`id` dell'ordine esistente — nessuna nuova colonna, nessun contatore da gestire in concorrenza.
- **Data**: `order.created_at` (data di creazione dell'ordine), formattata `it-IT`.
- **Dati "Il vostro Partner Amway"**: nome, `codice_amway`, telefono del partner proprietario dell'ordine (`profiles` via `order.partner_id`).
- **Email**: invio reale via Resend (già configurato per i reminder eventi, stesso mittente `WeShare <noreply@growset.it>`), PDF allegato. Richiede che il cliente abbia un'email in anagrafica — altrimenti errore esplicito, nessun invio silenzioso. Dipende dalla env var `RESEND_API_KEY` su Vercel (stessa dipendenza già presente per i reminder — se non impostata, l'invio fallirà con errore chiaro, non è una nuova lacuna introdotta da questa feature).
- **WhatsApp**: nessun invio automatico (coerente con la decisione già presa nel progetto di evitare OpenWA/invio automatico per rischio ban). Un bottone scarica il PDF, un altro apre `wa.me` con testo precompilato — l'utente allega il file scaricato a mano nella chat.
- **Bottone "Scarica PDF"**: download diretto, nessun invio.
- **Visibilità**: sezione "Ricevuta" sempre visibile sulla pagina ordine, qualunque sia lo stato.

## API

- `GET /api/client-orders/[id]/receipt` — autenticato, verifica ownership (`partner_id = auth.uid()`), genera il PDF al volo con il builder condiviso e lo ritorna con `Content-Type: application/pdf` e `Content-Disposition: attachment; filename="ricevuta-<ID8>.pdf"`.
- `POST /api/client-orders/[id]/receipt/send-email` — autenticato, stesso ownership check, richiede `order.customer.email` presente (altrimenti 400 "Cliente senza email"), genera lo stesso PDF (stesso builder, nessuna duplicazione di logica) e lo invia via Resend come allegato. Ritorna `{ sent: true }` o `{ error }`.

## Modulo condiviso

`src/lib/receipts/pdf.tsx` — esporta `buildReceiptPdfBuffer(order: ClientOrder, partner: { nome: string; codice_amway: string | null; telefono: string | null }): Promise<Buffer>`, il componente `@react-pdf/renderer` (Document/Page/View/Text) che replica il layout del modulo Amway (header, box cliente, tabella articoli, totale, riga firma, footer "IL VOSTRO PARTNER AMWAY"). Usato da entrambe le route API, nessuna duplicazione del layout.

## UI

**`/ordini-clienti/[id]`**: nuova sezione "Ricevuta" (stesso stile card `bg-bg-card border border-border rounded-2xl p-5` delle altre sezioni della pagina), con tre bottoni:
- **Scarica PDF** → link diretto a `GET .../receipt` (apertura in nuova tab/download nativo del browser)
- **Invia email** → chiama `POST .../send-email`, mostra stato di caricamento e un messaggio di esito (successo/errore, incluso il caso "cliente senza email")
- **WhatsApp** → scarica il PDF (stesso link di "Scarica PDF") e in parallelo apre `wa.me/<telefono-cliente>?text=<messaggio precompilato>` in una nuova tab — nessuna libreria condivisa nuova, si segue la convenzione già presente nel codice di costruire l'URL `wa.me` inline (es. `clienti/page.tsx`), senza introdurre un helper condiviso cross-modulo che non esiste oggi.

Se il cliente non ha email, il bottone "Invia email" resta cliccabile ma mostra l'errore del server al click (niente disabilitazione preventiva, per coerenza con il resto della pagina che non nasconde azioni ma mostra errori inline).

## Dipendenza nuova

`@react-pdf/renderer` (dependency, non devDependency — usata a runtime nelle API route).

## Fuori scope

- Contatore progressivo "Ricevuta N" con numerazione sequenziale per partner.
- Campi P.IVA/Codice SDI/CAP/Provincia sui clienti.
- Spese di trasporto/contrassegno come importi tracciati sull'ordine.
- Invio WhatsApp automatico/allegato automatico (evitato per rischio ban, stessa decisione già presa per i reminder eventi).
- Storico degli invii (non si registra se/quando una ricevuta è stata inviata via email).

## Testing

Nessuna suite automatica in questo progetto (verifica manuale via browser):

1. Aprire un ordine (qualsiasi stato) e cliccare "Scarica PDF" — verificare che il PDF scaricato mostri correttamente cliente, articoli, totale (senza VP/provvigioni), dati del partner nel footer.
2. Cliccare "Invia email" su un cliente con email impostata — verificare che l'email arrivi con il PDF allegato (richiede `RESEND_API_KEY` attiva su Vercel/locale).
3. Cliccare "Invia email" su un cliente senza email — verificare il messaggio di errore "Cliente senza email".
4. Cliccare "WhatsApp" — verificare che parta il download del PDF e si apra una nuova tab `wa.me` con testo precompilato.
5. Verificare che il numero ricevuta corrisponda alle prime 8 cifre dell'id ordine, e che la data sia quella di creazione dell'ordine.
