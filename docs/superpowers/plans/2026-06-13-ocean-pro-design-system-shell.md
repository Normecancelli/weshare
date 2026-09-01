# Ocean Pro Design System — Fase 1+2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sostituire il tema warm gold attuale con la palette Ocean Pro (navy/blue corporate) toccando solo tokens + shell (sidebar + header mobile), lasciando che le pagine ereditino il nuovo look via alias semantici.

**Architecture:** Token a due livelli in `globals.css` (palette grezza `--op-*` + alias semantici `--bg-main`/`--text-primary`/`--accent` ri-puntati su Ocean Pro). Sidebar riscritta con bg navy e icone lucide-react. Nessuna pagina o componente di feature viene toccato — il nuovo look si propaga via token.

**Tech Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 (puro `@theme inline`, no `tailwind.config.ts`) · lucide-react (nuova dipendenza, ~10kb gzipped)

**Spec di riferimento:** `docs/superpowers/specs/2026-06-13-ocean-pro-design-system-shell.md`

---

## File Structure

| File | Azione | Responsabilità |
|---|---|---|
| `package.json` | Modifica | Aggiungere `lucide-react` a `dependencies` |
| `src/app/globals.css` | Riscrittura del blocco `:root` | Definire palette `--op-*` + alias semantici |
| `src/components/sidebar.tsx` | Modifica | Colori navy + 15 icone lucide + footer footer aggiornato |
| `src/app/(dashboard)/layout.tsx` | Modifica | Header mobile: bg bianco + border |

Nessun file viene creato. Nessun file viene cancellato.

---

## Task 1: Installare lucide-react

**Files:**
- Modify: `package.json`, `package-lock.json`

- [ ] **Step 1: Installare la dipendenza**

```bash
npm install lucide-react
```

Expected: `package.json` aggiornato con `"lucide-react": "^x.y.z"` in `dependencies`, `package-lock.json` aggiornato.

- [ ] **Step 2: Verificare il typecheck del progetto compili ancora**

```bash
npx tsc --noEmit
```

Expected: PASS (no output, exit code 0). Nessun errore TypeScript dovuto all'aggiunta.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add lucide-react for Ocean Pro sidebar icons"
```

---

## Task 2: Riscrivere i token in globals.css

**Files:**
- Modify: `src/app/globals.css` (intero file)

- [ ] **Step 1: Riscrivere il file con palette Ocean Pro**

Sostituire il contenuto di `src/app/globals.css` con:

```css
@import "tailwindcss";

:root {
  /* ── Ocean Pro — palette grezza ─────────────────────────── */
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

  /* Sidebar (dark surface dedicata) */
  --op-sidebar-bg:      #0B2545;
  --op-sidebar-text:    rgba(255,255,255,0.65);
  --op-sidebar-active:  #1D6FA4;
  --op-sidebar-divider: rgba(255,255,255,0.08);

  /* ── Alias semantici (nomi storici, ri-puntati) ─────────── */
  /* Fondali */
  --bg-main:    var(--op-surface);
  --bg-card:    var(--op-card);
  --bg-section: var(--op-surface);

  /* Testi */
  --text-primary:   var(--op-navy);
  --text-secondary: var(--op-text-secondary);
  --text-gentle:    var(--op-text-muted);

  /* Accent — ora Ocean blue */
  --accent:       var(--op-blue);
  --accent-hover: var(--op-blue-light);
  --accent-glow:  var(--op-blue-50);

  /* Coral/Lavender ri-mappati a blu chiaro (rebrand integrale) */
  --coral:         var(--op-blue-light);
  --coral-soft:    var(--op-blue-50);
  --lavender:      var(--op-blue-light);
  --lavender-soft: var(--op-blue-50);

  /* Semantici */
  --success: #7DB89B;
  --warning: #E8A020;
  --error:   #CD6B6B;
  --info:    var(--op-blue-light);

  /* Bordi */
  --border:  var(--op-border);
  --divider: var(--op-border);

  /* Mapping Tailwind */
  --background: var(--bg-main);
  --foreground: var(--text-primary);
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);

  /* Palette completa accessibile da Tailwind (bg-accent, text-coral, etc.) */
  --color-bg-main: var(--bg-main);
  --color-bg-card: var(--bg-card);
  --color-bg-section: var(--bg-section);

  --color-accent: var(--accent);
  --color-accent-hover: var(--accent-hover);
  --color-accent-glow: var(--accent-glow);

  --color-coral: var(--coral);
  --color-coral-soft: var(--coral-soft);

  --color-lavender: var(--lavender);
  --color-lavender-soft: var(--lavender-soft);

  --color-success: var(--success);
  --color-warning: var(--warning);
  --color-error: var(--error);
  --color-info: var(--info);

  --color-border: var(--border);
  --color-divider: var(--divider);

  --color-text-primary: var(--text-primary);
  --color-text-secondary: var(--text-secondary);
  --color-text-gentle: var(--text-gentle);

  --font-sans: "Inter", ui-sans-serif, system-ui, sans-serif;
}

body {
  background: var(--background);
  color: var(--foreground);
  font-family: var(--font-sans);
}
```

- [ ] **Step 2: Verificare che il dev server compili senza errori**

```bash
npm run dev
```

Aprire `http://localhost:3000`, attendere "Ready". Cercare nel terminale errori CSS/Tailwind. Lasciare il server attivo per i task successivi.

Expected: Pagina di login renderizzata con sfondo Ocean Pro `#F0F4F8` (azzurrino chiaro) invece di sabbia `#FBF8F3`. Testo navy invece di marrone.

- [ ] **Step 3: Commit**

```bash
git add src/app/globals.css
git commit -m "feat(theme): rebrand tokens to Ocean Pro navy/blue palette"
```

---

## Task 3: Sidebar — colori Ocean Pro e icone lucide

**Files:**
- Modify: `src/components/sidebar.tsx` (intero file)

- [ ] **Step 1: Riscrivere `src/components/sidebar.tsx` con bg navy e icone lucide**

Sostituire l'intero contenuto di `src/components/sidebar.tsx` con:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  LayoutDashboard,
  TrendingUp,
  Users,
  Contact,
  Network,
  UserPlus,
  Receipt,
  ShoppingCart,
  Package,
  Upload,
  Calendar,
  Wallet,
  Target,
  GraduationCap,
  Presentation,
  Settings,
  LogOut,
  X,
  type LucideIcon,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type MenuItem = {
  name: string;
  icon: LucideIcon;
  href: string;
  badge?: string;
};

type MenuSection = {
  label: string;
  items: MenuItem[];
};

const menuSections: MenuSection[] = [
  {
    label: "Panoramica",
    items: [
      { name: "Dashboard", icon: LayoutDashboard, href: "/" },
      { name: "Performance", icon: TrendingUp, href: "/performance", badge: "Q2" },
    ],
  },
  {
    label: "Persone",
    items: [
      { name: "I miei Clienti", icon: Users, href: "/clienti" },
      { name: "Contatti", icon: Contact, href: "/contatti" },
      { name: "Il mio Team", icon: Network, href: "/team" },
      { name: "Prospect", icon: UserPlus, href: "/prospect" },
    ],
  },
  {
    label: "Attività",
    items: [
      { name: "Fatturati", icon: Receipt, href: "/ordini" },
      { name: "Ordini Clienti", icon: ShoppingCart, href: "/ordini-clienti" },
      { name: "Prodotti", icon: Package, href: "/prodotti" },
      { name: "Importa dati", icon: Upload, href: "/import" },
    ],
  },
  {
    label: "Eventi",
    items: [{ name: "Tutti gli eventi", icon: Calendar, href: "/eventi" }],
  },
  {
    label: "Crescita",
    items: [
      { name: "Entrate", icon: Wallet, href: "/entrate" },
      { name: "Obiettivi", icon: Target, href: "/obiettivi" },
      { name: "Formazione", icon: GraduationCap, href: "/formazione" },
      { name: "Presentazioni", icon: Presentation, href: "/presentazioni" },
    ],
  },
];

type SidebarProps = {
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
};

export function Sidebar({ mobileOpen = false, onCloseMobile }: SidebarProps) {
  const [active, setActive] = useState("Dashboard");
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserEmail(data.user?.email ?? null);
    });
  }, [supabase]);

  function handleNav(name: string, href: string) {
    setActive(name);
    router.push(href);
    onCloseMobile?.();
  }

  async function handleLogout() {
    setLoggingOut(true);
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <>
      {mobileOpen && (
        <div
          onClick={onCloseMobile}
          className="md:hidden fixed inset-0 bg-black/40 z-40"
          aria-hidden
        />
      )}
      <nav
        className={`
          bg-[var(--op-sidebar-bg)] flex flex-col py-7
          fixed inset-y-0 left-0 z-50 w-64 transform transition-transform duration-200
          ${mobileOpen ? "translate-x-0" : "-translate-x-full"}
          md:relative md:translate-x-0 md:shrink-0 md:z-0
        `}
      >
        <div className="px-6 pb-7 border-b border-[var(--op-sidebar-divider)] mb-5 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold text-white tracking-tight">
              Amway Partner
            </h1>
            <span className="text-[11px] text-white/50 tracking-wide">
              powered by Me.To.Do for you®
            </span>
          </div>
          {onCloseMobile && (
            <button
              type="button"
              onClick={onCloseMobile}
              aria-label="Chiudi menu"
              className="md:hidden w-8 h-8 rounded-lg hover:bg-white/10 flex items-center justify-center text-white/65"
            >
              <X size={18} strokeWidth={2} />
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {menuSections.map((section) => (
            <div key={section.label} className="px-4 mb-2">
              <div className="text-[10px] font-semibold uppercase tracking-[1.2px] text-white/50 px-3 pt-3 pb-1.5">
                {section.label}
              </div>
              {section.items.map((item) => {
                const Icon = item.icon;
                const isActive = active === item.name;
                return (
                  <button
                    key={item.name}
                    onClick={() => handleNav(item.name, item.href)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm transition-all ${
                      isActive
                        ? "bg-[var(--op-sidebar-active)] text-white font-semibold"
                        : "text-[var(--op-sidebar-text)] hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    <Icon size={18} strokeWidth={1.75} className="shrink-0" />
                    {item.name}
                    {item.badge && (
                      <span className="ml-auto bg-[var(--op-blue-50)] text-[var(--op-blue-800)] text-[11px] font-semibold px-2 py-0.5 rounded-full">
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div className="px-4 mt-auto pt-3 border-t border-[var(--op-sidebar-divider)]">
          {userEmail && (
            <div className="px-3 pb-2 text-[11px] text-white/50 truncate" title={userEmail}>
              {userEmail}
            </div>
          )}
          <button className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-[var(--op-sidebar-text)] hover:bg-white/5 hover:text-white transition-all">
            <Settings size={18} strokeWidth={1.75} className="shrink-0" />
            Impostazioni
          </button>
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-[var(--op-sidebar-text)] hover:bg-white/5 hover:text-white transition-all disabled:opacity-50"
          >
            <LogOut size={18} strokeWidth={1.75} className="shrink-0" />
            {loggingOut ? "Uscita..." : "Esci"}
          </button>
        </div>
      </nav>
    </>
  );
}
```

- [ ] **Step 2: Verificare TypeScript compili**

```bash
npx tsc --noEmit
```

Expected: PASS (exit code 0). Se `LucideIcon` o icone non risolvono, controllare di aver completato Task 1.

- [ ] **Step 3: Verificare il dev server**

Se il dev server di Task 2 step 2 è ancora attivo, Next ricaricherà via HMR. Altrimenti:

```bash
npm run dev
```

Aprire `http://localhost:3000` (richiede login). Una volta dentro la dashboard verificare:
- Sidebar sfondo navy `#0B2545`
- Testi voci nav bianco/65%
- Voce attiva (Dashboard al primo render) su pillola blu `#1D6FA4` bianco solido
- Icone lucide visibili, allineate, stroke sottile
- Hover su altra voce: testo schiarisce a bianco pieno, sfondo bianco/5%
- Badge "Q2" su Performance: bg blu-50 testo blu-800

- [ ] **Step 4: Commit**

```bash
git add src/components/sidebar.tsx
git commit -m "feat(sidebar): apply Ocean Pro navy palette and lucide icons"
```

---

## Task 4: Header mobile aggiornato

**Files:**
- Modify: `src/app/(dashboard)/layout.tsx`

- [ ] **Step 1: Aggiornare l'header mobile a sfondo bianco**

Sostituire il contenuto di `src/app/(dashboard)/layout.tsx` con:

```tsx
"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { Sidebar } from "@/components/sidebar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex h-full w-full overflow-hidden">
      <Sidebar mobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)} />
      <div className="flex-1 flex flex-col min-w-0 bg-bg-main overflow-hidden">
        <header className="md:hidden flex items-center gap-3 px-4 py-3 border-b border-[var(--op-border)] bg-white">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Apri menu"
            className="w-9 h-9 rounded-lg hover:bg-[var(--op-surface)] flex items-center justify-center text-text-primary"
          >
            <Menu size={20} strokeWidth={1.75} />
          </button>
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-bold text-text-primary tracking-tight">Amway Partner</span>
            <span className="text-[10px] text-text-gentle tracking-wide">powered by Me.To.Do for you®</span>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
```

Modifiche specifiche:
- Import di `Menu` da `lucide-react`
- `<header>` ora `bg-white border-b border-[var(--op-border)]` (era `bg-bg-section border-b border-divider`)
- Bottone hamburger `hover:bg-[var(--op-surface)]` (era `hover:bg-bg-main`)
- SVG inline sostituito da `<Menu size={20} strokeWidth={1.75} />`

- [ ] **Step 2: Verificare TypeScript compili**

```bash
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 3: Verificare via HMR**

Con il dev server attivo, ridurre la finestra del browser a <768px (o usare DevTools device mode, viewport 375px). Verificare:
- Header mobile bianco con border-bottom sottile blu-grey
- Icona hamburger lucide pulita, stroke 1.75
- Click hamburger → drawer sidebar navy scorre da sinistra
- Click X dentro la sidebar drawer → si chiude

- [ ] **Step 4: Commit**

```bash
git add src/app/(dashboard)/layout.tsx
git commit -m "feat(layout): apply Ocean Pro to mobile header"
```

---

## Task 5: Verifica visiva end-to-end

**Files:**
- Nessun file modificato (solo verifica)

- [ ] **Step 1: Avviare/riavviare il dev server pulito**

Se serve riavviare:

```bash
# Ctrl+C nel terminale del dev server, poi:
npm run dev
```

- [ ] **Step 2: Login e verifica 6 superfici chiave**

Aprire `http://localhost:3000/login`, fare login con `alessandro@iseven.it`, poi visitare:

| URL | Cosa verificare |
|---|---|
| `/` (Dashboard) | Background `#F0F4F8`, stat cards bianche, sidebar navy a sinistra, testi navy |
| `/clienti` | Card cliente, modal "Nuovo cliente" → focus ring blu (era oro), bottone WhatsApp `#25D366` invariato |
| `/ordini-clienti` | Tab stati, badge "In gruppo" `#E3F2FD` invariato (è funzionale, non a tema) |
| `/prodotti` | Tabella catalogo, bottoni `+ Nuovo prodotto` blu |
| `/login` (logout + nuovo accesso) | Surface Ocean Pro anche fuori dal dashboard layout |
| Mobile 375px su `/` | Drawer sidebar apertura/chiusura, header bianco, body navy text leggibile |

Per ognuna salvare screenshot mentalmente (no commit di file binari). Annotare incongruenze visibili.

- [ ] **Step 3: Verificare gradient dashboard "top downline"**

Su `/`, sezione "Top downline" — il gradient `from-lavender to-[#8B79B3]` ora è "blu chiaro → viola". Annotato come accettato nello spec, ma confermare che non sia visivamente rotto.

- [ ] **Step 4: Build di produzione locale (sanity check)**

```bash
npm run build
```

Expected: build completa con `Compiled successfully`. Se fallisce per type/lint, leggere l'errore e correggere — la causa più probabile è un import o tipo lucide mal scritto.

- [ ] **Step 5: Lint**

```bash
npm run lint
```

Expected: 0 errori, 0 warning nuovi rispetto al baseline. Se ci sono warning preesistenti li ignori, ma niente di nuovo.

---

## Task 6: Push finale

**Files:**
- Nessuna modifica codice, solo git push

- [ ] **Step 1: Verificare lo stato della branch**

```bash
git status
git log --oneline -10
```

Expected: `working tree clean`, gli ultimi 4 commit nuovi sono:
- `chore: add lucide-react for Ocean Pro sidebar icons`
- `feat(theme): rebrand tokens to Ocean Pro navy/blue palette`
- `feat(sidebar): apply Ocean Pro navy palette and lucide icons`
- `feat(layout): apply Ocean Pro to mobile header`

- [ ] **Step 2: Push su `weshare`**

```bash
git push origin weshare
```

Expected: push accettato. Vercel auto-redeploy parte entro ~30s.

- [ ] **Step 3: Verifica produzione**

Attendere ~2 minuti, aprire `https://metodo.growset.it` in browser pulito (o incognito). Login e ripetere la checklist del Task 5 step 2 ma su produzione.

Se qualcosa è rotto in produzione ma non in locale, controllare:
- Vercel build log via `gh run list` o dashboard Vercel
- Differenze tra `npm run build` locale e build Vercel (di solito var d'env mancanti, ma qui non dovrebbero servire nuove)

---

## Note finali

- **No test automatizzati**: il progetto non ha una test suite. La verifica è esclusivamente visiva + typecheck + lint + build.
- **No tailwind.config.ts**: questa migrazione lavora interamente dentro `@theme inline` come da setup Tailwind v4 esistente.
- **Lucide tree-shaking**: gli import nominali da `lucide-react` consentono a Next/Webpack di estrarre solo le 17 icone usate. Non importare mai da subpath `lucide-react/dist/*`.
- **Logout button** ora usa `text-[var(--op-sidebar-text)]` (era `text-coral`). Questa è una decisione di design: in dark sidebar la coerenza tipografica vince sul segnale "rosso = destructive". L'icona `LogOut` da sola comunica già l'intent.
