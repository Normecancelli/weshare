# Ordini Clienti — Design Spec

**Data:** 2026-06-09
**Progetto:** Amway Partner · powered by ME.TO.DO®
**Autore:** Alejerry Setten + Claude

---

## 1. Obiettivo

Costruire un sistema completo per la gestione degli ordini dei clienti finali di ogni partner Amway. Il sistema copre l'intero ciclo di vita dell'ordine: dalla ricezione (WhatsApp/di persona) fino al caricamento sul sito Amway, con gestione magazzino, resi, statistiche e messaggistica.

## 2. Fasi di Sviluppo

### Fase 1 — Ordini (MVP usabile)
- Anagrafica clienti (import Excel + inserimento manuale)
- Catalogo prodotti Amway (import da listino Excel, 198 prodotti, 66 categorie)
- Ordine singolo per cliente (ricerca prodotto con autocomplete, quantità, totali)
- Raggruppamento ordini settimanale → assegnazione ai 3 carrelli Amway
- Contatore VP live per carrello personale (max 510)
- Flag conferma "caricato su Amway"

### Fase 2 — Magazzino & Resi
- Inventario personale con giacenze e soglia minima
- Scelta "da Amway" vs "da magazzino" per ogni prodotto nell'ordine
- Alert prodotti in esaurimento + suggerimenti prodotti più venduti
- Gestione resi (destinazione: Amway o magazzino) con rimborso cliente (importo, data, metodo)

### Fase 3 — Intelligence & Comunicazione
- Statistiche per singolo cliente (totale speso, prodotti preferiti, frequenza ordini, storico, resi)
- Statistiche generali (prodotti più venduti, fatturato per periodo, andamento vendite, clienti più attivi, prodotti con più resi, scorte vs domanda)
- Lista desideri per cliente (prodotti da ricordare per il prossimo ordine)
- Promemoria riordino (se un cliente ordina lo stesso prodotto regolarmente, suggerire di ricontattarlo)
- Ricevuta PDF per il cliente (riepilogo ordine da inviare via WhatsApp)
- Margine/provvigione stimata per ordine
- WhatsApp: link wa.me con messaggio precompilato (architettura pronta per migrazione a WhatsApp Business API)
- Invio promo/comunicazioni a tutti i clienti o al singolo

---

## 3. I 3 Carrelli Amway

Il sistema Amway prevede 3 tipi di carrello. Quando il partner raggruppa gli ordini dei clienti per caricarli sul sito, deve assegnare ogni prodotto a uno dei 3 carrelli:

| Carrello | Descrizione | Limite | Strategia |
|----------|-------------|--------|-----------|
| **Personale** | Prezzi partner, il più conveniente | Max 510 VP/mese | Riempire per primo |
| **Cliente non registrato** | Prezzo pieno, provvigioni detassate | Nessun limite VP | Overflow dal personale |
| **Ordine programmato** | Ogni 3° ordine: sconto 15% aggiuntivo | Nessun limite VP | Vantaggio economico crescente |

Il sistema deve:
- Mostrare un **contatore VP live** per il carrello personale (barra di progressione su 510)
- Mostrare il **contatore ordini programmati** (es. "2/3 ordini — prossimo: -15%!")
- Permettere di spostare facilmente un prodotto da un carrello all'altro

---

## 4. Catalogo Prodotti

### Sorgente dati
File Excel Amway `PriceList_April-2026_IT.xlsx` — foglio "Table 1", 470 righe.

### Struttura dati (da riga 56 in poi)

| Colonna Excel | Campo DB | Tipo | Esempio |
|---------------|----------|------|---------|
| B (Codice) | `codice_amway` | TEXT UNIQUE | 127059 |
| F (Descrizione) | `descrizione` | TEXT | Nutrilite™ Set Programma Depurante |
| A (Categoria, righe senza codice) | `categoria` | TEXT | Nutrizione > Soluzioni Personalizzate |
| N (Contenuto) | `contenuto` | TEXT | 1 set / 140g |
| Q (Prezzo al Cliente con IVA) | `prezzo_cliente` | NUMERIC(10,2) | 195.42 |
| T (Provvigione vendite cliente) | `provvigione` | NUMERIC(10,2) | 29.61 |
| X (Prezzo Amway Partner con IVA) | `prezzo_partner` | NUMERIC(10,2) | 162.85 |
| AA (Prezzo per unità di misura) | `prezzo_unita` | TEXT | 52,18 / 100g |
| AD (Valore Punti VP) | `punti_vp` | NUMERIC(10,2) | 65.45 |
| AG (Volume Vendite VV) | `volume_vv` | NUMERIC(10,2) | 148.04 |

### Parsing
- Le righe prodotto hanno un codice numerico in colonna B
- Le righe categoria hanno testo in colonna A senza codice in B
- Le categorie sono gerarchiche (Nutrizione > Integratori base > etc.)
- Il parser deve ricostruire la gerarchia delle categorie scorrendo le righe
- 198 prodotti totali, 66 categorie

### Aggiornamento listino
Il listino viene aggiornato periodicamente da Amway. L'import sovrascrive i prodotti esistenti (match per `codice_amway`), aggiunge nuovi, e marca come `attivo = false` quelli rimossi.

---

## 5. Database — Nuove Tabelle

### 5.1 `products` (Catalogo)

```sql
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codice_amway TEXT NOT NULL UNIQUE,
  descrizione TEXT NOT NULL,
  categoria TEXT,
  contenuto TEXT,
  prezzo_cliente NUMERIC(10,2) DEFAULT 0,
  prezzo_partner NUMERIC(10,2) DEFAULT 0,
  provvigione NUMERIC(10,2) DEFAULT 0,
  prezzo_unita TEXT,
  punti_vp NUMERIC(10,2) DEFAULT 0,
  volume_vv NUMERIC(10,2) DEFAULT 0,
  attivo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_products_codice ON products(codice_amway);
CREATE INDEX idx_products_categoria ON products(categoria);
```

### 5.2 `customers` (Clienti)

```sql
CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  cognome TEXT,
  telefono TEXT,
  email TEXT,
  indirizzo TEXT,
  citta TEXT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_customers_partner ON customers(partner_id);
```

### 5.3 `client_orders` (Ordini singoli)

```sql
CREATE TYPE order_status AS ENUM (
  'bozza',
  'confermato',
  'in_gruppo',
  'completato',
  'annullato'
);

CREATE TYPE order_channel AS ENUM (
  'whatsapp',
  'presenza',
  'telefono'
);

CREATE TABLE client_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  stato order_status NOT NULL DEFAULT 'bozza',
  canale order_channel,
  note TEXT,
  totale_cliente NUMERIC(10,2) DEFAULT 0,
  totale_partner NUMERIC(10,2) DEFAULT 0,
  totale_vp NUMERIC(10,2) DEFAULT 0,
  totale_provvigione NUMERIC(10,2) DEFAULT 0,
  group_id UUID, -- FK aggiunta dopo creazione order_groups: ALTER TABLE client_orders ADD CONSTRAINT fk_group REFERENCES order_groups(id)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_client_orders_partner ON client_orders(partner_id);
CREATE INDEX idx_client_orders_customer ON client_orders(customer_id);
CREATE INDEX idx_client_orders_stato ON client_orders(stato);
CREATE INDEX idx_client_orders_group ON client_orders(group_id);
```

### 5.4 `client_order_items` (Righe ordine)

```sql
CREATE TYPE item_source AS ENUM ('amway', 'magazzino');

CREATE TABLE client_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES client_orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  quantita INTEGER NOT NULL DEFAULT 1,
  prezzo_unitario_cliente NUMERIC(10,2) NOT NULL,
  prezzo_unitario_partner NUMERIC(10,2) NOT NULL,
  punti_vp NUMERIC(10,2) NOT NULL,
  provvigione NUMERIC(10,2) NOT NULL DEFAULT 0,
  fonte item_source NOT NULL DEFAULT 'amway',
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_order_items_order ON client_order_items(order_id);
CREATE INDEX idx_order_items_product ON client_order_items(product_id);
```

### 5.5 `order_groups` (Raggruppamento settimanale)

```sql
CREATE TYPE group_status AS ENUM (
  'aperto',
  'caricato',
  'confermato'
);

CREATE TABLE order_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  stato group_status NOT NULL DEFAULT 'aperto',
  data_caricamento TIMESTAMPTZ,
  ordini_programmati_count INTEGER NOT NULL DEFAULT 0, -- contatore progressivo: a 3 scatta lo sconto 15%
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- FK differita per client_orders.group_id
ALTER TABLE client_orders ADD CONSTRAINT fk_client_orders_group
  FOREIGN KEY (group_id) REFERENCES order_groups(id);

CREATE INDEX idx_order_groups_partner ON order_groups(partner_id);
CREATE INDEX idx_order_groups_stato ON order_groups(stato);
```

### 5.6 `group_items` (Prodotti nel gruppo + assegnazione carrello)

```sql
CREATE TYPE cart_type AS ENUM (
  'personale',
  'non_registrato',
  'programmato'
);

CREATE TABLE group_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES order_groups(id) ON DELETE CASCADE,
  order_item_id UUID NOT NULL REFERENCES client_order_items(id),
  carrello cart_type NOT NULL DEFAULT 'personale',
  confermato BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_group_items_group ON group_items(group_id);
```

### 5.7 `inventory` (Magazzino personale — Fase 2)

```sql
CREATE TABLE inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  giacenza INTEGER NOT NULL DEFAULT 0,
  soglia_minima INTEGER NOT NULL DEFAULT 2,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(partner_id, product_id)
);

CREATE INDEX idx_inventory_partner ON inventory(partner_id);
```

### 5.8 `inventory_movements` (Movimenti magazzino — Fase 2)

```sql
CREATE TYPE movement_type AS ENUM (
  'carico',
  'scarico_ordine',
  'scarico_reso',
  'rettifica'
);

CREATE TABLE inventory_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_id UUID NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
  tipo movement_type NOT NULL,
  quantita INTEGER NOT NULL,
  order_item_id UUID REFERENCES client_order_items(id),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 5.9 `returns` (Resi — Fase 2)

```sql
CREATE TYPE return_destination AS ENUM ('amway', 'magazzino');

CREATE TABLE returns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_id UUID NOT NULL REFERENCES client_order_items(id),
  partner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  quantita INTEGER NOT NULL DEFAULT 1,
  destinazione return_destination NOT NULL,
  rimborso_importo NUMERIC(10,2),
  rimborso_data DATE,
  rimborso_metodo TEXT,
  motivo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_returns_partner ON returns(partner_id);
```

### 5.10 `customer_wishlist` (Lista desideri — Fase 3)

```sql
CREATE TABLE customer_wishlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(customer_id, product_id)
);
```

### 5.11 `messages` (Log messaggi WhatsApp — Fase 3)

```sql
CREATE TYPE message_type AS ENUM (
  'promo',
  'ordine_conferma',
  'ricevuta',
  'comunicazione',
  'promemoria_riordino'
);

CREATE TYPE message_channel AS ENUM ('wa_link', 'wa_api');

CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id),
  tipo message_type NOT NULL,
  canale message_channel NOT NULL DEFAULT 'wa_link',
  testo TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_messages_partner ON messages(partner_id);
CREATE INDEX idx_messages_customer ON messages(customer_id);
```

---

## 6. Qualifiche Amway (aggiornamento schema esistente)

L'enum `qualifica_amway` esistente va sostituita con la gerarchia corretta:

```sql
DROP TYPE qualifica_amway;
CREATE TYPE qualifica_amway AS ENUM (
  '3_percento',
  '6_percento',
  '9_percento',
  '12_percento',
  '15_percento',
  '18_percento',
  '21_percento',
  'platino',
  'diamante',
  'corona_ambasciatore'
);
```

Spazio tra Diamante e Corona Ambasciatore, e tra Diamante e Platino, per qualifiche intermedie da aggiungere in futuro.

Aggiungere alla tabella `profiles`:
```sql
ALTER TABLE profiles ADD COLUMN qualifica_massima qualifica_amway DEFAULT '3_percento';
ALTER TABLE profiles ADD COLUMN privacy_flag BOOLEAN DEFAULT FALSE;
```

### Regole di accesso basate su qualifica

- **Diamante e superiori**: possono vedere (READ ONLY) tutti i dati delle downline, inclusi ordini clienti, magazzino, statistiche di vendita
- **Privacy flag**: se un partner attiva il flag (`privacy_flag = TRUE`), l'upline NON può vedere: ordini clienti, dettaglio clienti, magazzino, statistiche di vendita, resi. Restano visibili i dati Amway pubblici (VPG, VPP, qualifica) perché già condivisi nell'Excel Amway.
- **Inviti eventi**: Diamante può inoltrare inviti a Platino, e alle downline del Platino se quest'ultimo non ha il privacy flag attivo
- Implementazione via RLS: policy con check su qualifica upline + privacy_flag del partner

---

## 7. Multi-tenant

- Ogni tabella con dati partner-specifici ha `partner_id UUID FK → profiles`
- RLS attivo su tutte le tabelle: ogni partner vede solo i propri dati
- Admin del gruppo (Diamante+): policy aggiuntiva che permette SELECT sulle righe dei partner nella propria downline, condizionata al `privacy_flag = FALSE`
- La tabella `products` è condivisa (catalogo globale, nessun filtro per partner)

---

## 8. Design UI — Mobile-First

### Principi generali
- **Mobile-first**: progettare per 375px, poi allargare per desktop
- **Touch-friendly**: bottoni minimo 44px, aree di tap generose
- **Barra totale sticky**: in basso su mobile per ordini e raggruppamento
- Tema: palette emozionale esistente (avorio, oro, corallo, lavanda) — NO dark mode

### 8.1 Lista Ordini (`/ordini-clienti`)

**Mobile (< 768px):**
- Hamburger menu al posto della sidebar
- 2 stat card su 2 colonne (da raggruppare + completati)
- Tab orizzontali scrollabili (Da raggruppare / Gruppi aperti / Completati / Tutti)
- Ogni ordine è una **card** con: avatar cliente, nome, data, canale, n. prodotti, totale, VP, stato
- 2 bottoni in basso: "+ Nuovo Ordine" (primario) + "Raggruppa" (secondario)

**Desktop (> 768px):**
- Sidebar fissa
- 4 stat card su 4 colonne (+ VP totali + provvigioni stimate)
- Tabella con colonne: checkbox, Cliente, Data, Prodotti, VP, Totale, Canale, Stato
- Checkbox per selezionare ordini da raggruppare

### 8.2 Nuovo Ordine

**Mobile:**
- Fullscreen (non modal)
- Top bar: X (chiudi) — "Nuovo Ordine" — Salva
- Sezione cliente con avatar e bottone "Cambia"
- Barra ricerca prodotto prominente con autocomplete (nome, codice → mostra prezzo + VP)
- Prodotti come card con bottoni +/- per quantità (grandi, touch-friendly)
- Barra sticky in basso con: Totale €, VP, Provvigione stimata, bottoni Bozza/Conferma

**Desktop:**
- Modal o side panel
- Layout a 2 colonne: sinistra (ricerca + prodotti), destra (riepilogo + totali)

### 8.3 Raggruppamento Carrelli

**Mobile:**
- Barra VP carrello personale (progressione su 510) sempre visibile in alto
- 3 tab swipeable: Personale | Non registrato | Programmato
- Ogni tab mostra i prodotti assegnati a quel carrello
- Ogni prodotto ha 3 **mini-bottoni** per spostamento rapido carrello (tap, non drag)
- Contatore ordine programmato (es. "2/3 — prossimo -15%!")
- Bottone conferma sticky in basso: "Caricato su Amway"

**Desktop:**
- 3 colonne affiancate (Personale oro / Non registrato blu / Programmato viola)
- Drag & drop tra colonne + mini-bottoni come fallback
- Barra VP in alto con progressione

### 8.4 Dettaglio Cliente

**Mobile:**
- Header con avatar, nome, telefono, bottone WhatsApp
- Tab: Ordini | Statistiche | Wishlist
- Lista ordini come card
- Statistiche: totale speso, prodotti preferiti, frequenza

**Desktop:**
- Layout a 2 colonne: info cliente + statistiche a sinistra, storico ordini a destra

### 8.5 Magazzino (Fase 2)

**Mobile:**
- Lista prodotti come card con giacenza e indicatore (verde/giallo/rosso)
- Swipe per aggiungere/togliere quantità
- Sezione "In esaurimento" in alto con alert

**Desktop:**
- Tabella con: Prodotto, Giacenza, Soglia, Stato, Ultima movimentazione

### 8.6 Sidebar aggiornata

Nuove voci nel menu:
- **Attività** → "Ordini Clienti" (nuovo), "Magazzino" (nuovo, Fase 2)
- **Comunicazione** → "Messaggi" (nuovo, Fase 3)

---

## 9. API Endpoints

### Fase 1

| Metodo | Path | Descrizione |
|--------|------|-------------|
| GET | `/api/products` | Lista prodotti (con ricerca, filtro categoria) |
| POST | `/api/products/import` | Import catalogo da Excel |
| GET | `/api/customers` | Lista clienti del partner |
| POST | `/api/customers` | Nuovo cliente |
| PUT | `/api/customers/[id]` | Modifica cliente |
| POST | `/api/customers/import` | Import clienti da Excel |
| GET | `/api/client-orders` | Lista ordini (con filtri stato, cliente, data) |
| POST | `/api/client-orders` | Nuovo ordine |
| PUT | `/api/client-orders/[id]` | Modifica ordine (stato, items) |
| GET | `/api/client-orders/[id]` | Dettaglio ordine con items |
| GET | `/api/order-groups` | Lista gruppi |
| POST | `/api/order-groups` | Nuovo gruppo (con ordini selezionati) |
| PUT | `/api/order-groups/[id]` | Modifica gruppo (assegnazione carrelli, conferma) |
| PUT | `/api/order-groups/[id]/confirm` | Conferma "caricato su Amway" |

### Fase 2

| Metodo | Path | Descrizione |
|--------|------|-------------|
| GET | `/api/inventory` | Magazzino del partner |
| PUT | `/api/inventory/[product_id]` | Aggiorna giacenza |
| POST | `/api/inventory/movement` | Registra movimento |
| GET | `/api/inventory/alerts` | Prodotti in esaurimento |
| POST | `/api/returns` | Registra reso |
| GET | `/api/returns` | Lista resi |

### Fase 3

| Metodo | Path | Descrizione |
|--------|------|-------------|
| GET | `/api/stats/customer/[id]` | Statistiche singolo cliente |
| GET | `/api/stats/products` | Statistiche prodotti (più venduti, resi, etc.) |
| GET | `/api/stats/overview` | Statistiche generali |
| GET | `/api/customers/[id]/wishlist` | Lista desideri cliente |
| POST | `/api/customers/[id]/wishlist` | Aggiungi a wishlist |
| POST | `/api/messages/send` | Invio messaggio WhatsApp (genera link wa.me) |
| GET | `/api/messages` | Log messaggi inviati |
| GET | `/api/messages/templates` | Template messaggi |

---

## 10. Pagine / Route

```
/ordini-clienti              → Lista ordini + stat card
/ordini-clienti/nuovo        → Creazione ordine (fullscreen mobile)
/ordini-clienti/[id]         → Dettaglio ordine
/ordini-clienti/raggruppa    → Raggruppamento con 3 carrelli
/clienti                     → Lista clienti
/clienti/[id]                → Dettaglio cliente (ordini, stats, wishlist)
/clienti/import              → Import clienti da Excel
/prodotti                    → Catalogo prodotti (ricerca, filtri)
/prodotti/import             → Import listino da Excel
/magazzino                   → Inventario personale (Fase 2)
/messaggi                    → Centro messaggi WhatsApp (Fase 3)
```

---

## 11. Flusso Operativo Dettagliato

### 11.1 Ricezione ordine
1. Il cliente ordina via WhatsApp o di persona
2. Il partner apre l'app → "Nuovo Ordine"
3. Seleziona il cliente (autocomplete) o ne crea uno nuovo
4. Cerca i prodotti (per nome o codice) e li aggiunge con quantità
5. Vede in tempo reale: totale cliente, VP, provvigione stimata
6. Salva come bozza o conferma

### 11.2 Raggruppamento settimanale
1. Il partner decide di raggruppare (es. ogni venerdì)
2. Seleziona gli ordini confermati da raggruppare
3. Il sistema genera la lista unificata di tutti i prodotti
4. Per ogni prodotto sceglie il carrello (Personale/Non registrato/Programmato)
5. Il contatore VP live mostra quanto spazio resta nel carrello personale (max 510)
6. Il contatore ordine programmato mostra "X/3 ordini — prossimo -15%!"
7. Salva il gruppo

### 11.3 Caricamento su Amway
1. Il partner carica manualmente gli ordini sul sito Amway seguendo l'assegnazione carrelli
2. Torna nell'app e preme "Caricato su Amway"
3. Il sistema marca il gruppo come confermato e aggiorna gli stati degli ordini

### 11.4 Gestione reso (Fase 2)
1. Il cliente restituisce un prodotto
2. Il partner registra il reso: seleziona l'ordine, il prodotto, la quantità
3. Sceglie la destinazione: "Reso ad Amway" o "Rientra in magazzino"
4. Se reso ad Amway: registra rimborso atteso
5. Registra il rimborso al cliente: importo, data, metodo (contanti/bonifico/etc.)
6. Se rientra in magazzino: la giacenza viene aggiornata automaticamente

---

## 12. Considerazioni Tecniche

### Stack
- Stesso stack esistente: Next.js 15 + Supabase + Tailwind CSS
- Mobile-first con breakpoint a 768px
- Client-side fetching con useState/useEffect (pattern esistente)

### Performance
- Catalogo prodotti: 198 prodotti, caricabile tutto in memoria per autocomplete client-side
- Lista clienti: fetch paginato se > 100 clienti
- Ricerca prodotti: search locale (fuzzy match su nome + codice)

### Sicurezza
- RLS su tutte le nuove tabelle con filtro `partner_id = auth.uid()`
- Policy aggiuntiva per Diamante+: SELECT su downline con check `privacy_flag = FALSE`
- Nessun dato sensibile esposto nelle API (prezzi partner visibili solo al partner loggato)

### Import catalogo
- Parser dedicato per il formato Excel Amway (struttura non standard, categorie in righe separate)
- Upsert per codice_amway: aggiorna esistenti, inserisce nuovi, disattiva rimossi
- Validazione: codice numerico obbligatorio, prezzo >= 0, VP >= 0
