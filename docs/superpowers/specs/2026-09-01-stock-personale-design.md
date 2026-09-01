# Stock personale (magazzino) — Design

## Contesto

Un partner vuole poter tenere una scorta fisica di alcuni prodotti a casa propria ("Stock"), per poter consegnare subito a un cliente che chiede un prodotto con urgenza, invece di aspettare la spedizione Amway. Oggi questo non esiste in nessuna forma: `client_order_items.fonte` (`amway`/`magazzino`) è un tipo TypeScript mai collegato a nulla — ogni articolo aggiunto a un ordine nasce sempre con `fonte: "amway"` hardcoded (`api/client-orders/add-item/route.ts`).

Nessun nuovo ruolo utente: ogni partner gestisce il proprio Stock con il proprio account.

## Schema dati

### Nuova tabella `magazzino_items`

```sql
CREATE TABLE magazzino_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantita INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (partner_id, product_id)
);
```

Un solo numero per prodotto per partner — nessuno storico movimenti. RLS: stesso pattern `partner_id = auth.uid()` già usato per `customers`/`client_orders`.

### Cliente fittizio "Uso personale"

`customers` guadagna una colonna `is_interno BOOLEAN NOT NULL DEFAULT FALSE`. Nuovo endpoint `POST /api/customers/uso-personale` (get-or-create, idempotente): se il partner corrente ha già una riga `customers` con `is_interno = true` la ritorna, altrimenti la crea (`nome = "Uso personale"`) e la ritorna. Le liste clienti normali (`/clienti`, dashboard, ricerca cliente in "Nuovo Ordine") escludono `is_interno = true`; è raggiungibile solo tramite un punto di ingresso dedicato (vedi UI).

### `client_order_items`

Due colonne nuove:

- `destinazione_uso TEXT CHECK (destinazione_uso IN ('magazzino', 'personale'))`, nullable — valorizzata **solo** sugli ordini del cliente `is_interno`. `magazzino` = questo pezzo va ad aumentare lo Stock; `personale` = consumo proprio, nessun effetto su Stock (serve solo a tracciare la spesa nel totale ordine).
- `magazzino_movimentato BOOLEAN NOT NULL DEFAULT FALSE` — flag di idempotenza: true quando lo Stock è già stato mosso per questa riga (evita doppio conteggio su conferma/riporta-a-bozza/riconferma ripetuti).

`fonte` (`amway`/`magazzino`) resta invariato per gli ordini clienti reali: `magazzino` = il pezzo viene prelevato dallo Stock invece che ordinato da Amway.

## Flusso: caricare Stock

1. Partner apre "Nuovo Ordine" → bottone/link dedicato "Ordine per uso personale" (accanto alla ricerca cliente normale) → risolve/crea il cliente `is_interno` e lo preseleziona, saltando la ricerca normale.
2. Aggiunge prodotti come oggi. Per ogni riga, sceglie `destinazione_uso`: **Stock** o **Uso personale** — scelta obbligatoria (blocco al salvataggio se mancante), nessun default implicito.
3. Alla conferma ordine (`stato` → `confermato`, stesso hook già usato per la numerazione ricevuta in `PUT /api/client-orders/[id]`): per ogni riga con `destinazione_uso = 'magazzino'` e `magazzino_movimentato = false`, upsert su `magazzino_items` (`quantita = quantita + item.quantita`), poi `magazzino_movimentato = true`. Le righe `destinazione_uso = 'personale'` non toccano `magazzino_items`.

## Flusso: usare Stock in un ordine cliente

1. Nel form "Nuovo Ordine" / dettaglio ordine (bozza), la ricerca prodotto (`product-search.tsx`) mostra "Stock: N" accanto ai risultati con `quantita > 0` per il partner corrente.
2. Sulla riga articolo aggiunta, se `quantita > 0` a Stock per quel prodotto, appare un controllo per marcarla **da Stock** (`fonte = 'magazzino'`) invece che **da Amway** (`fonte = 'amway'`, default) — chiama lo stesso endpoint `PATCH /api/client-orders/[id]/items/[itemId]` già esistente (oggi usato per la quantità), esteso per accettare anche `fonte`. Vincolo **più stretto** del pattern di editabilità generico della route (`EDITABLE_STATES = ["bozza", "in_gruppo"]`): `fonte`/`destinazione_uso` sono modificabili **solo mentre l'ordine è in `bozza`** — un ordine `in_gruppo` è già passato per una conferma (il movimento Stock è già avvenuto), quindi permettere il cambio lì disallineerebbe silenziosamente lo Stock dalla realtà.
3. Alla conferma ordine: per ogni riga con `fonte = 'magazzino'` e `magazzino_movimentato = false`, upsert su `magazzino_items` (`quantita = quantita - item.quantita`, mai sotto zero — se la quantità richiesta supera lo Stock disponibile, blocca la conferma con errore esplicito), poi `magazzino_movimentato = true`.

## Rollback

Quando un ordine confermato torna a `bozza` o viene `annullato` (`PUT /api/client-orders/[id]`), per ogni riga con `magazzino_movimentato = true`:

- `destinazione_uso = 'magazzino'` → decrementa `magazzino_items` (annulla l'incremento fatto alla conferma).
- `fonte = 'magazzino'` (ordine cliente) → incrementa `magazzino_items` (annulla il decremento fatto alla conferma).
- poi `magazzino_movimentato = false`.

Così una riconferma successiva (eventualmente con quantità cambiata) rimuove di nuovo correttamente, senza doppio conteggio.

## Raggruppamento — esclusione articoli da Stock

`POST /api/order-groups/route.ts` (righe ~114-117) oggi prende tutti gli item degli ordini selezionati senza filtro:

```ts
const { data: allItems } = await supabase
  .from("client_order_items")
  .select("id")
  .in("order_id", order_ids);
```

Aggiunge `.neq("fonte", "magazzino")` — le righe soddisfatte dallo Stock non vengono incluse nel gruppo da inviare ad Amway (il prodotto è già fisicamente disponibile, non va riordinato).

## UI — pagina Stock

Nuova voce di menu "Stock" (sezione ATTIVITÀ, vicino a "Prodotti"), route `/magazzino`, icona `Warehouse` (lucide-react) — stessa convenzione già usata in questa sessione (route in italiano, etichetta UI breve, coerente col precedente `/presentazioni` → "Speech Audio"). Lista dei prodotti con `quantita > 0` per il partner corrente, sola visualizzazione (nessuna modifica manuale diretta della quantità in questa v1 — si carica/scarica solo tramite ordini, coerente col fatto che non c'è storico movimenti da riconciliare a mano).

## Fuori scope

- Storico movimenti (carico/scarico) — solo il numero corrente.
- Modifica manuale diretta della quantità Stock fuori dal flusso ordini.
- Editing di `fonte`/`destinazione_uso` dopo la conferma ordine (richiederebbe ri-muovere lo Stock, non gestito in v1).
- Ruolo "magazzino" condiviso/centralizzato — resta personale per partner.
- Notifiche/alert quando lo Stock di un prodotto scende sotto una soglia.

## Testing

Nessuna suite automatica nel progetto (verifica manuale via browser):

1. Ordine per uso personale, riga con `destinazione_uso = magazzino`, conferma → verificare che compaia in pagina Stock con la quantità corretta.
2. Ordine per uso personale, riga con `destinazione_uso = personale`, conferma → verificare che NON compaia/non alteri lo Stock.
3. Ordine cliente reale, riga marcata "da Stock" entro il limite disponibile, conferma → verificare decremento corretto e che l'articolo NON compaia nel raggruppamento verso Amway.
4. Stesso ordine, "Riporta a bozza" → verificare che la quantità Stock torni al valore precedente.
5. Tentativo di marcare "da Stock" una quantità superiore a quella disponibile → conferma bloccata con errore esplicito.
6. Ricerca prodotto in "Nuovo Ordine" → verificare che "Stock: N" compaia solo per prodotti con quantità > 0 per il partner loggato.
