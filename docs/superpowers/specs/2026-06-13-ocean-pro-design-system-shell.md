# Ocean Pro Design System — Fase 1+2 (Tokens + Shell)

**Data**: 2026-06-13
**Scope**: rebrand integrale a Ocean Pro, limitato a fondamenta tokens e shell (sidebar, header mobile, body bg).
**Fuori scope**: restyle per-pagina (Dashboard, Clienti, Ordini, Prodotti, Francesca AI, Import), topbar desktop dedicato, mobile bottom nav.

## Obiettivo

Sostituire l'attuale tema "warm gold + coral + lavender" con Ocean Pro (navy `#0B2545` / blue `#1D6FA4` / surface `#F0F4F8`) usando una strategia token-first che riskinna automaticamente tutte le pagine esistenti senza editare i `.tsx` di feature.

## Principi di design

### Token a due livelli

L'app oggi usa Tailwind v4 con `@theme inline` in `src/app/globals.css` e classi semantiche (`bg-bg-main`, `text-text-primary`, `border-divider`, `bg-accent`, `bg-bg-card`). Nessun `tailwind.config.ts` esiste — non va creato.

**Strato A — palette grezza Ocean Pro** (nuovi token `--op-*`):

```css
--op-navy:        #0B2545;
--op-blue:        #1D6FA4;
--op-blue-light:  #378ADD;
--op-blue-50:     #E6F1FB;
--op-blue-800:    #0C447C;
--op-surface:     #F0F4F8;
--op-card:        #FFFFFF;
--op-border:      #E0E8F0;
--op-text-secondary: #4A6480;
--op-text-muted:     #6B8099;
--op-sidebar-bg:      #0B2545;
--op-sidebar-text:    rgba(255,255,255,0.65);
--op-sidebar-active:  #1D6FA4;
--op-sidebar-divider: rgba(255,255,255,0.08);
```

**Strato B — alias semantici** (mantenuti coi nomi esistenti, ri-puntati su Ocean Pro):

```css
--bg-main:        var(--op-surface);
--bg-card:        var(--op-card);
--bg-section:     var(--op-surface);
--text-primary:   var(--op-navy);
--text-secondary: var(--op-text-secondary);
--text-gentle:    var(--op-text-muted);
--accent:         var(--op-blue);
--accent-hover:   var(--op-blue-light);
--accent-glow:    var(--op-blue-50);
--coral:          var(--op-blue-light);
--coral-soft:     var(--op-blue-50);
--lavender:       var(--op-blue-light);
--lavender-soft:  var(--op-blue-50);
--border:         var(--op-border);
--divider:        var(--op-border);
--success:        #7DB89B;
--warning:        #E8A020;
--error:          #CD6B6B;
--info:           var(--op-blue-light);
```

Conseguenza: ogni componente che oggi usa `bg-bg-main`, `text-text-primary`, `bg-accent`, `bg-coral-soft`, `text-lavender`, ecc. cambia look automaticamente al merge senza modifica di codice.

### Token semantici dedicati alla sidebar

La sidebar è l'unica superficie "dark" dell'app (navy `#0B2545`). I suoi tokens vivono fuori dalla mappatura semantica generale per non sporcare gli altri componenti chiari:

```css
--op-sidebar-bg, --op-sidebar-text, --op-sidebar-active, --op-sidebar-divider
```

Vengono usati direttamente nella sidebar via classi arbitrarie Tailwind `bg-[var(--op-sidebar-bg)]`.

## Componenti toccati

### 1. `src/app/globals.css` — riscrittura blocco token

Sostituzione integrale del blocco `:root { ... }` con la palette Ocean Pro a due livelli. Il blocco `@theme inline { ... }` resta strutturalmente identico (espone gli stessi `--color-*` a Tailwind), cambiano solo i valori sottostanti grazie agli alias.

Aggiunta dei token sidebar (`--op-sidebar-bg`, `--op-sidebar-text`, `--op-sidebar-active`, `--op-sidebar-divider`) dentro `:root`. Non vengono esposti come classi Tailwind (`@theme inline`) — sono usati solo via `bg-[var(--op-sidebar-bg)]` nella sidebar.

### 2. `src/components/sidebar.tsx` — colori + icone lucide

**Colori**:
- Container: `bg-[var(--op-sidebar-bg)]`
- Logo "Amway Partner" + sottotitolo: `text-white` / `text-white/50`
- Label sezioni ("Panoramica", "Persone", ...): `text-white/50 text-[10px] uppercase tracking-wide`
- Voce nav default: `text-[var(--op-sidebar-text)] hover:text-white`
- Voce nav attiva: `bg-[var(--op-sidebar-active)] text-white`
- Divisori tra sezioni: `border-t border-[var(--op-sidebar-divider)]`
- Footer email + logout: `text-white/65`, hover logout `text-[var(--op-blue-light)]`

**Icone** — sostituzione delle 15 emoji attuali con lucide-react:

| Voce | Lucide |
|---|---|
| Dashboard | `LayoutDashboard` |
| Performance | `TrendingUp` |
| I miei Clienti | `Users` |
| Contatti | `Contact` |
| Il mio Team | `Network` |
| Prospect | `UserPlus` |
| Fatturati | `Receipt` |
| Ordini Clienti | `ShoppingCart` |
| Prodotti | `Package` |
| Importa dati | `Upload` |
| Tutti gli eventi | `Calendar` |
| Entrate | `Wallet` |
| Obiettivi | `Target` |
| Formazione | `GraduationCap` |
| Presentazioni | `Presentation` |

Render: `<Icon size={18} strokeWidth={1.75} />` per uniformità ottica.

Lo `icon: string` nel data model di `menuSections` viene cambiato in `icon: LucideIcon` (riferimento al componente, non più stringa).

### 3. `src/app/(dashboard)/layout.tsx` — header mobile

Solo l'header mobile è modificato (su desktop la sidebar fa da chrome, non c'è topbar). Cambi:
- `<header>` da `bg-bg-section` a `bg-white border-b border-[var(--op-border)]` (coerente con "topbar bianca" da spec Ocean Pro)
- Bottone hamburger: `hover:bg-[var(--op-surface)]` invece di `hover:bg-bg-main`
- Body bg (`bg-bg-main` sul div main) — nessuna modifica esplicita; cambia automaticamente via token alias.

### 4. `src/app/layout.tsx`

Nessuna modifica. `<body>` non ha sfondo esplicito; eredita da `--background → --bg-main → --op-surface`.

## Dipendenze

- **Aggiunta**: `lucide-react@latest` (~10kb gzipped tree-shaken). Install via `npm i lucide-react`.
- Nessuna rimozione.

## Cosa NON viene modificato (delega ai tokens)

Queste superfici cambieranno look automaticamente al merge — verificato leggendo il codice ma intenzionalmente non toccato:

- Tutte le pagine in `src/app/(dashboard)/` (Dashboard, Clienti, Ordini, Ordini Clienti, Prodotti, Import)
- `src/components/dashboard.tsx`, `promemoria-panel.tsx`, `whatsapp-extractor.tsx`
- Modal: `add-to-order-modal.tsx`, `product-form-modal.tsx`, `product-picker-modal.tsx`
- Componenti `ui/`: `cart-selector.tsx`, `product-search.tsx`, `stat-card.tsx`, `vp-counter.tsx`
- Pagine auth: `/login`, `/auth/update-password`, `/registrati`, `/benvenuto`
- Componente icone esistente `src/components/icons.tsx` (EditIcon, TrashIcon, MessageIcon, RowActions)

## Cosa NON viene fatto in questa iterazione

- Conversione degli hex hardcoded (~36 occorrenze): tutti sono colori funzionali esterni o status-specific che non appartengono al tema (`#25D366` WhatsApp green, `#E3F2FD`/`#1976D2` badge stato "in gruppo", `#9C27B0` cart programmato, `#E8F5EE` success bg). Restano invariati.
- Restyle per-pagina (sarà Fase 3).
- Topbar desktop dedicato (oggi non esiste; la sidebar è l'unica chrome desktop).
- Mobile bottom nav (citato dal file Ocean Pro originale ma non presente nell'app — sarebbe feature nuova, non rebrand).

## Rischi e mitigazioni

| Rischio | Mitigazione |
|---|---|
| Pagine dove `coral`/`lavender` davano "warmth" emozionale ora sono tutte blu → uniformità eccessiva | Accettato in Fase 2. In Fase 3 si potrà reintrodurre un accent diverso se serve. |
| Contrasto WCAG `--text-secondary #4A6480` su surface `#F0F4F8` | Calcolato: 6.8:1 ✅ (AA+). |
| `lucide-react` aggiunge dipendenza | ~10kb gzipped tree-shaken, standard de facto Next.js/Tailwind. |
| Pagina `/benvenuto` (tour 4 step) ha SVG/illustrazioni che potrebbero contenere colori warm | Non visitata in Fase 2; resterà potenzialmente stonata fino a Fase 3. Accettato (vista 1x per utente). |
| Lavanda/coral sono usati in `dashboard.tsx` per gradient `from-lavender to-[#8B79B3]` | Cambia in `from-[#378ADD] to-[#8B79B3]` automaticamente (via alias). Il `#8B79B3` hardcoded resta viola — gradient diventerà "blu→viola". Visibilmente accettabile, ma da rifinire in Fase 3. |

## Verifica (manuale)

Da eseguire dopo l'implementazione, prima del merge:

1. `npm run dev` su locale.
2. Screenshot **prima/dopo** per 4 pagine: `/` (dashboard), `/clienti`, `/ordini-clienti`, `/prodotti`.
3. Sidebar drawer mobile aperto su viewport 375px.
4. Pagina `/login` (esterna al dashboard layout) — deve avere surface blu Ocean Pro.
5. Pannello "Date in arrivo" su dashboard (usa badge urgenza con hex hardcoded → resta come ora, conferma).
6. Modal "Nuovo cliente" su `/clienti` — focus ring deve essere blu (era oro).
7. Click su voce sidebar diversa da quella attiva — hover deve schiarire da bianco/65% a bianco/100%.
8. Tutte e 15 le icone lucide visibili e allineate (no caratteri di fallback, no overflow).

Nessun test automatizzato — è un cambio puramente visivo.

## Convenzioni di scrittura del codice

- Niente `tailwind.config.ts` (Tailwind v4 puro via `@theme inline`).
- Per superfici sidebar usare classi arbitrarie con `var(--op-sidebar-bg)` / `--op-sidebar-text` / `--op-sidebar-active` / `--op-sidebar-divider`, non aliasare in `@theme inline` (sono semantici a una sola superficie).
- Icone lucide importate per-nome, no barrel imports da `lucide-react/dist/*` (tree-shaking si rompe).
- `strokeWidth={1.75}` su tutte le icone sidebar per omogeneità ottica.

## Definizione di "fatto" per questa iterazione

- [ ] `globals.css` aggiornato con palette Ocean Pro a due livelli + token sidebar.
- [ ] `lucide-react` installato e in `package.json`.
- [ ] `src/components/sidebar.tsx` con nuovi colori e 15 icone lucide.
- [ ] `src/app/(dashboard)/layout.tsx` header mobile aggiornato.
- [ ] Verifica visiva delle 4 pagine principali + login + mobile drawer.
- [ ] Commit + push su `AMWAY.partner` → auto-deploy Vercel.
- [ ] Screenshot dell'app live su `metodo.growset.it` per confronto.

## Prossimi passi (Fase 3, fuori scope qui)

Da affrontare in iterazioni successive, una pagina alla volta, in quest'ordine per impatto visivo:

1. Dashboard — stat cards, promemoria, gradient "top downline"
2. Clienti — card lista, modal form
3. Ordini Clienti — card/tabella, badge stati
4. Prodotti — catalog grid, thumbnail
5. Francesca AI — pannello WhatsApp extractor
6. Import — upload area, progress
7. Pagina `/benvenuto` (tour) — illustrazioni
