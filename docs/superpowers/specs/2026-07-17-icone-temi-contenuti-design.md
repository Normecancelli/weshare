# Icone per tema (Formazione/Presentazioni) — Design

## Contesto

`contenuti.tema` (introdotto in `015_contenuti_vetrina.sql`) è testo libero con autocomplete, per evitare una tassonomia fissa (decisione presa nello spec `2026-07-17-vetrina-prospect-formazione-design.md`). L'utente vuole ora un'icona riconoscibile per ciascun tema, visibile nel filtro e sulle card contenuto, sia lato partner (`/formazione`, `/presentazioni`) sia nella vetrina pubblica prospect (`/anteprima/[token]`).

Un'icona fissa per parola-chiave del tema (matching testuale) è stata scartata: essendo `tema` testo libero, si romperebbe per qualunque variante non prevista. Si è scelto invece un **picker manuale**: l'icona è assegnata una volta per tema (non per singolo contenuto) da chi crea/modifica un contenuto, scegliendo da un set curato — non una ricerca sull'intera libreria lucide-react, per restare coerenti col contesto e non introdurre un componente di ricerca complesso per un caso d'uso così piccolo.

## Decisioni chiave

- **Ambito icona**: per tema, non per contenuto — stesso tema ⇒ stessa icona ovunque compaia. Richiede una tabella dedicata `temi_icone` (tema testo libero non ha altrove un "posto" dove vivere un attributo condiviso).
- **Set icone**: curato, 24 icone `lucide-react` già coerenti con lo stile icone del progetto (nessuna emoji, per convenzione CLAUDE.md).
- **Assegnazione**: al volo nel form contenuto (`ContenutoFormModal`), non una pagina di gestione temi separata. Tema nuovo ⇒ picker obbligatorio prima di salvare. Tema esistente ⇒ form pre-seleziona l'icona già assegnata, ricliccabile per cambiarla (la modifica vale per tutti i contenuti con quel tema, essendo l'icona condivisa).
- **Permessi**: stesso perimetro di chi gestisce contenuti oggi, `canCreateEvent(ruolo, qualifica)` — nessun nuovo livello di permesso.

## Data model — migration `016_temi_icone.sql`

```sql
CREATE TABLE public.temi_icone (
  tema TEXT PRIMARY KEY,
  icona TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.temi_icone ENABLE ROW LEVEL SECURITY;

CREATE POLICY temi_icone_read ON public.temi_icone FOR SELECT TO authenticated
  USING (true);

CREATE POLICY temi_icone_write ON public.temi_icone FOR ALL TO authenticated
  USING (
    public.get_user_role() IN ('admin','topadmin')
    OR public.get_user_qualifica() IN ('diamante','smeraldo','zaffiro','rubino','platino')
  )
  WITH CHECK (
    public.get_user_role() IN ('admin','topadmin')
    OR public.get_user_qualifica() IN ('diamante','smeraldo','zaffiro','rubino','platino')
  );

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'temi_icone_updated_at'
  ) THEN
    CREATE TRIGGER temi_icone_updated_at
      BEFORE UPDATE ON public.temi_icone
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
  END IF;
END $$;
```

Nessuna foreign key verso `contenuti.tema` (resta testo libero non vincolato, coerente con la scelta originale — un tema può esistere in `temi_icone` prima ancora di essere usato su un contenuto, e viceversa un contenuto può avere un tema senza ancora un'icona assegnata, mostrando un'icona di default).

**Vetrina pubblica**: `temi_icone` non contiene dati sensibili (solo tema+nome icona), quindi `GET /api/anteprima/[token]` può leggerla liberamente via `createAdminClient()` come già fa per eventi/contenuti.

## Set icone curato

Costante condivisa `src/lib/contenuti/icone-temi.ts`:

```ts
export const ICONE_TEMA_DISPONIBILI = [
  "GraduationCap", "Presentation", "Package", "Briefcase", "Calendar",
  "Users", "TrendingUp", "Star", "Target", "Heart", "Sparkles", "Home",
  "ShoppingCart", "Award", "Megaphone", "Handshake", "Lightbulb", "BookOpen",
  "Video", "Mic", "Globe", "DollarSign", "Rocket", "Leaf",
] as const;

export type IconaTema = (typeof ICONE_TEMA_DISPONIBILI)[number];

export const ICONA_TEMA_DEFAULT: IconaTema = "BookOpen";
```

Mappa nome→componente lucide-react centralizzata in un unico punto (stesso file o un file affiancato), così ogni superficie che deve renderizzare un'icona-tema lo fa tramite un unico helper `IconaTemaComponent({ nome })`, evitando switch/if duplicati in ogni componente consumer.

## API

- `GET /api/contenuti/temi?tipo=` (esistente, modificato): ritorna `{ temi: { tema: string; icona: string }[] }` invece di `string[]` — join lato API tra i temi distinti di `contenuti` e `temi_icone` (temi senza icona assegnata ricevono `ICONA_TEMA_DEFAULT`).
- `PUT /api/contenuti/temi/[tema]` (nuovo): body `{ icona: IconaTema }`, upsert su `temi_icone`, gate `canCreateEvent`. Valida che `icona` sia uno dei 24 valori ammessi (altrimenti 400).

## UI

**`ContenutoFormModal`**: il campo tema (già un combobox con `datalist`) guadagna, sotto l'input, una griglia di 24 pulsanti-icona (stesso pattern visivo delle card, `lucide-react` in griglia `grid-cols-6` o simile). Quando l'utente digita/seleziona un tema:
- se il tema è già in `temi_icone` (matchato dalla lista temi già caricata dal form), la griglia si apre con l'icona corrispondente pre-selezionata;
- se è un tema nuovo, nessuna preselezione — il salvataggio del contenuto è bloccato (validazione, come già avviene per titolo) finché non si sceglie un'icona.
Il salvataggio del contenuto fa comunque prima la `PUT /api/contenuti/temi/[tema]` (upsert icona) e poi la `POST`/`PATCH` del contenuto stesso — due chiamate sequenziali, non una transazione (coerente con l'assenza di transazioni multi-tabella altrove nel progetto).

**`ContenutiGrid`**: la select del filtro tema mostra l'icona accanto al nome (`<option>` non supporta icone via CSS in modo affidabile cross-browser — si usa quindi un dropdown custom leggero invece della `<select>` nativa attuale, oppure si mantiene la `<select>` nativa per il filtro e si aggiunge l'icona SOLO sulle card, scelta più semplice e sufficiente). Sulle card contenuto, il badge tema attuale (`bg-bg-section text-text-secondary`) guadagna l'icona a sinistra del testo.

**Vetrina pubblica** (`/anteprima/[token]/page.tsx`): stessa resa icona+badge tema sulle card, dato che riusa `ContenutiGrid`.

## Fuori scope

- Nessuna pagina di gestione temi standalone (rimandata, non richiesta).
- Nessuna migrazione dei dropdown filtro da `<select>` nativa a componente custom (l'icona compare solo sulle card, non nella select del filtro) — semplificazione esplicita per contenere lo scope.
- Nessun vincolo di unicità icona↔tema nel senso opposto (più temi possono condividere la stessa icona, nessuna validazione contro i duplicati).

## Testing

Manuale via browser, come per il resto del progetto:
1. Creare un contenuto con un tema nuovo → verificare che il salvataggio sia bloccato finché non si sceglie un'icona dalla griglia.
2. Salvare → verificare che la card mostri l'icona scelta, e che un secondo contenuto con lo stesso tema mostri automaticamente la stessa icona pre-selezionata nel form.
3. Cambiare l'icona di un tema esistente da un contenuto → verificare che TUTTI i contenuti con quel tema (comprese le card già esistenti, dopo refresh) mostrino la nuova icona.
4. Aprire la vetrina pubblica di un prospect con contenuti visibili → verificare che le icone-tema compaiano anche lì.
