# AI Genera Titolo+Descrizione Evento — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aggiungere un modale AI nel form crea/modifica evento che genera 3 varianti di titolo+descrizione (formale/entusiasta/diretto) a partire da un'idea libera dell'organizzatore.

**Architecture:** Nuovo endpoint `POST /api/events/generate-description` replica il pattern già in produzione di `src/app/api/orders/parse-whatsapp/route.ts` (Anthropic SDK, `claude-haiku-4-5`, tool-forced JSON output, nessun prompt caching perché non c'è un blocco grande e stabile da cachare). Nuovo componente client `AiGenerateModal` mostra le 3 varianti e le applica al form padre tramite callback. `EventForm` aggiunge solo un pulsante + stato di apertura modale.

**Tech Stack:** Next.js 15 App Router, TypeScript, `@anthropic-ai/sdk`, Supabase SSR client, Tailwind CSS v4.

## Global Constraints

- Modello AI: `claude-haiku-4-5` (stesso di `parse-whatsapp/route.ts`), nessun prompt caching per questa feature.
- Endpoint richiede solo utente autenticato (`supabase.auth.getUser()`), nessun role-gate aggiuntivo — il form eventi è già visibile solo a chi può creare eventi.
- Esattamente 3 varianti sempre, toni fissi: `formale`, `entusiasta`, `diretto` — non configurabile.
- Lingua italiana in tutto (UI, prompt, errori). Numeri/date formattati `it-IT` dove applicabile.
- **Questo progetto non ha framework di test automatici** (nessun `jest`/`vitest`/`playwright` in `package.json`, convenzione consolidata di test manuale via dev server/curl — vedi sessioni precedenti in `CLAUDE.md`). I task qui sotto quindi usano verifica manuale (curl per l'API, dev server per la UI) invece di test automatici, seguendo la convenzione esistente del progetto.
- `ANTHROPIC_API_KEY` **non è presente in `.env.local`** in locale (verificato: solo `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_DB_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`). È la stessa situazione preesistente della feature WhatsApp AI già in produzione (che gira solo con la chiave su Vercel) — non è un blocco introdotto da questo piano. La verifica manuale del Task 1 senza chiave locale deve controllare che l'endpoint risponda 500 con il messaggio corretto, non un crash.

---

## Task 1: Endpoint `POST /api/events/generate-description`

**Files:**
- Create: `src/app/api/events/generate-description/route.ts`

**Interfaces:**
- Consumes: `createClient` da `@/lib/supabase/server` (già usato identico in `src/app/api/orders/parse-whatsapp/route.ts:3`); `Anthropic` da `@anthropic-ai/sdk`; env var `process.env.ANTHROPIC_API_KEY`.
- Produces: endpoint HTTP consumato dal Task 3 (`AiGenerateModal`). Contratto:
  - Request body: `{ idea: string; contesto?: { data_inizio?: string; location?: string; modalita?: "presenza"|"online"|"hybrid"; prezzo?: number; visibilita?: "globale"|"gruppo" } }`
  - Response 200: `{ varianti: Array<{ tono: "formale"|"entusiasta"|"diretto"; titolo: string; descrizione: string }> }` (esattamente 3 elementi)
  - Response errore: `{ error: string }` con status 401/400/500/502

- [ ] **Step 1: Scrivi il file dell'endpoint**

```typescript
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";

type Tono = "formale" | "entusiasta" | "diretto";

interface Variante {
  tono: Tono;
  titolo: string;
  descrizione: string;
}

interface ToolInput {
  varianti: Variante[];
}

interface Contesto {
  data_inizio?: string;
  location?: string;
  modalita?: "presenza" | "online" | "hybrid";
  prezzo?: number;
  visibilita?: "globale" | "gruppo";
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "Configurazione AI mancante. Contatta l'amministratore (ANTHROPIC_API_KEY non impostata).",
      },
      { status: 500 },
    );
  }

  let body: { idea?: string; contesto?: Contesto };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Dati non validi" }, { status: 400 });
  }

  const idea = (body.idea || "").trim();
  if (!idea) {
    return NextResponse.json(
      { error: "Descrivi l'evento in poche parole" },
      { status: 400 },
    );
  }
  if (idea.length > 500) {
    return NextResponse.json(
      { error: "Idea troppo lunga (max 500 caratteri)" },
      { status: 400 },
    );
  }

  const contesto = body.contesto || {};
  const contestoRighe: string[] = [];
  if (contesto.data_inizio) {
    const d = new Date(contesto.data_inizio);
    if (!isNaN(d.getTime())) {
      contestoRighe.push(
        `Data e ora: ${d.toLocaleDateString("it-IT", {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        })} alle ${d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}`,
      );
    }
  }
  if (contesto.location) contestoRighe.push(`Luogo: ${contesto.location}`);
  if (contesto.modalita) {
    const label = { presenza: "In presenza", online: "Online", hybrid: "Ibrido" }[
      contesto.modalita
    ];
    contestoRighe.push(`Modalità: ${label}`);
  }
  if (typeof contesto.prezzo === "number" && contesto.prezzo > 0) {
    contestoRighe.push(`Prezzo: €${contesto.prezzo}`);
  }
  if (contesto.visibilita) {
    contestoRighe.push(
      `Visibilità: ${contesto.visibilita === "globale" ? "aperto a tutti" : "solo il gruppo"}`,
    );
  }
  const contestoText =
    contestoRighe.length > 0
      ? contestoRighe.join("\n")
      : "Nessun dettaglio aggiuntivo fornito.";

  const anthropic = new Anthropic({ apiKey });

  const tool: Anthropic.Tool = {
    name: "genera_varianti_evento",
    description:
      "Genera 3 varianti di titolo+descrizione per un evento, una per ciascun tono richiesto.",
    input_schema: {
      type: "object",
      properties: {
        varianti: {
          type: "array",
          description:
            "Esattamente 3 varianti, una per tono, in ordine: formale, entusiasta, diretto.",
          items: {
            type: "object",
            properties: {
              tono: {
                type: "string",
                enum: ["formale", "entusiasta", "diretto"],
              },
              titolo: {
                type: "string",
                description: "Titolo evento, max 80 caratteri, niente emoji.",
              },
              descrizione: {
                type: "string",
                description: "Descrizione evento, 2-4 frasi, niente markdown.",
              },
            },
            required: ["tono", "titolo", "descrizione"],
          },
          minItems: 3,
          maxItems: 3,
        },
      },
      required: ["varianti"],
    },
  };

  const systemPrompt = `Sei un copywriter che scrive titoli e descrizioni per eventi di un team Amway italiano (formazioni, presentazioni prodotto, eventi di gruppo).

REGOLE:
- Genera SEMPRE esattamente 3 varianti, una per ciascun tono: "formale" (istituzionale, professionale), "entusiasta" (caldo, coinvolgente, energico ma senza esagerare), "diretto" (breve, concreto, va dritto al punto).
- Usa il contesto fornito (data, luogo, modalità, prezzo, visibilità) solo se presente. NON inventare dettagli che non ti sono stati dati (es. non inventare un luogo se non specificato).
- Titolo: max 80 caratteri, niente emoji, niente virgolette.
- Descrizione: 2-4 frasi in italiano naturale, niente markdown, niente elenchi puntati.
- Rispondi SEMPRE chiamando l'unica tool "genera_varianti_evento".

CONTESTO EVENTO GIÀ NOTO:
${contestoText}`;

  let toolUseInput: ToolInput | null = null;

  try {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 1024,
      system: systemPrompt,
      tools: [tool],
      tool_choice: { type: "tool", name: "genera_varianti_evento" },
      messages: [
        {
          role: "user",
          content: `Idea per l'evento:\n"""${idea}"""`,
        },
      ],
    });

    const block = response.content.find((b) => b.type === "tool_use");
    if (block && block.type === "tool_use") {
      toolUseInput = block.input as ToolInput;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "errore AI";
    return NextResponse.json({ error: `Errore AI: ${msg}` }, { status: 502 });
  }

  if (
    !toolUseInput ||
    !Array.isArray(toolUseInput.varianti) ||
    toolUseInput.varianti.length === 0
  ) {
    return NextResponse.json(
      { error: "L'AI non ha restituito un risultato valido. Riprova." },
      { status: 502 },
    );
  }

  return NextResponse.json({ varianti: toolUseInput.varianti });
}
```

- [ ] **Step 2: Verifica TypeScript**

Run: `npx tsc --noEmit`
Expected: nessun errore relativo a `src/app/api/events/generate-description/route.ts`

- [ ] **Step 3: Avvia il dev server e verifica manualmente il caso "non autenticato"**

Run: `npm run dev` (in background), poi:
```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/events/generate-description \
  -H "Content-Type: application/json" \
  -d '{"idea":"serata formazione SA8"}'
```
Expected: `401` (nessun cookie di sessione passato da curl)

- [ ] **Step 4: Verifica manuale del caso "idea mancante" e "idea troppo lunga"**

Nota: senza sessione autenticata questi casi non sono raggiungibili da curl puro (si viene bloccati prima al check auth). Verificarli invece dal browser al Task 3 Step 4, loggati come `alessandro@iseven.it`, usando gli strumenti di rete del browser o semplicemente il comportamento del modale (messaggio di errore visibile se si clicca "Genera" con textarea vuota).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/events/generate-description/route.ts
git commit -m "feat(eventi): endpoint AI genera titolo+descrizione evento"
```

---

## Task 2: Componente `AiGenerateModal`

**Files:**
- Create: `src/components/eventi/ai-generate-modal.tsx`

**Interfaces:**
- Consumes: endpoint del Task 1 (`POST /api/events/generate-description`); tipi `EventModalita`, `EventVisibilita` da `@/lib/types/events`.
- Produces: componente `AiGenerateModal` con props:
  ```typescript
  interface AiGenerateModalProps {
    contesto: {
      data_inizio: string;   // form.data_inizio, formato "datetime-local" (es. "2026-09-12T19:00") o ""
      location: string;
      modalita: EventModalita | "";
      prezzo: string;
      visibilita: EventVisibilita;
    };
    onApply: (nome: string, descrizione: string) => void;
    onClose: () => void;
  }
  export function AiGenerateModal(props: AiGenerateModalProps): JSX.Element
  ```
  Consumato dal Task 3 (`event-form.tsx`).

- [ ] **Step 1: Scrivi il componente**

```tsx
"use client";

import { useState } from "react";
import { X, Sparkles, RefreshCw } from "lucide-react";
import type { EventModalita, EventVisibilita } from "@/lib/types/events";

type Tono = "formale" | "entusiasta" | "diretto";

interface Variante {
  tono: Tono;
  titolo: string;
  descrizione: string;
}

const TONO_LABELS: Record<Tono, string> = {
  formale: "Formale",
  entusiasta: "Entusiasta",
  diretto: "Diretto",
};

interface AiGenerateModalProps {
  contesto: {
    data_inizio: string;
    location: string;
    modalita: EventModalita | "";
    prezzo: string;
    visibilita: EventVisibilita;
  };
  onApply: (nome: string, descrizione: string) => void;
  onClose: () => void;
}

export function AiGenerateModal({ contesto, onApply, onClose }: AiGenerateModalProps) {
  const [idea, setIdea] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [varianti, setVarianti] = useState<Variante[] | null>(null);

  async function handleGenera() {
    if (!idea.trim()) {
      setError("Descrivi l'evento in poche parole.");
      return;
    }
    setError(null);
    setLoading(true);
    setVarianti(null);
    try {
      const res = await fetch("/api/events/generate-description", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idea: idea.trim(),
          contesto: {
            data_inizio: contesto.data_inizio
              ? new Date(contesto.data_inizio).toISOString()
              : undefined,
            location: contesto.location || undefined,
            modalita: contesto.modalita || undefined,
            prezzo: contesto.prezzo ? Number(contesto.prezzo) : undefined,
            visibilita: contesto.visibilita,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Errore durante la generazione.");
        return;
      }
      setVarianti(data.varianti);
    } catch {
      setError("Errore di rete. Riprova.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-divider">
          <h3 className="font-semibold text-text-primary flex items-center gap-2">
            <Sparkles size={16} strokeWidth={1.75} className="text-accent" />
            Genera con AI
          </h3>
          <button onClick={onClose} className="text-text-secondary hover:text-text-primary">
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wide mb-1">
              Descrivi l&apos;evento in poche parole
            </label>
            <textarea
              className="w-full px-4 py-2.5 rounded-xl text-sm border border-border bg-bg-main focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
              rows={2}
              placeholder="es. serata formazione prodotti SA8, aperta a tutto il gruppo"
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
            />
          </div>

          {error && (
            <div className="bg-[#fee2e2] text-[#991b1b] text-sm px-4 py-2.5 rounded-xl">
              {error}
            </div>
          )}

          <button
            type="button"
            disabled={loading}
            onClick={handleGenera}
            className="w-full flex items-center justify-center gap-2 bg-accent hover:bg-accent-hover text-white font-semibold px-4 py-2.5 rounded-xl text-sm transition-colors disabled:opacity-50"
          >
            {varianti ? (
              <RefreshCw size={14} strokeWidth={1.75} />
            ) : (
              <Sparkles size={14} strokeWidth={1.75} />
            )}
            {loading ? "Generazione…" : varianti ? "Rigenera" : "Genera"}
          </button>

          {varianti && (
            <div className="space-y-3 pt-2">
              {varianti.map((v) => (
                <div key={v.tono} className="border border-divider rounded-xl p-3 space-y-1.5">
                  <span className="text-xs font-semibold text-accent uppercase tracking-wide">
                    {TONO_LABELS[v.tono]}
                  </span>
                  <p className="text-sm font-semibold text-text-primary">{v.titolo}</p>
                  <p className="text-sm text-text-secondary">{v.descrizione}</p>
                  <button
                    type="button"
                    onClick={() => onApply(v.titolo, v.descrizione)}
                    className="text-xs font-medium text-accent hover:underline"
                  >
                    Usa questa
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verifica TypeScript**

Run: `npx tsc --noEmit`
Expected: nessun errore relativo a `src/components/eventi/ai-generate-modal.tsx`

- [ ] **Step 3: Commit**

```bash
git add src/components/eventi/ai-generate-modal.tsx
git commit -m "feat(eventi): componente modale AI genera descrizione"
```

---

## Task 3: Integrazione nel form evento

**Files:**
- Modify: `src/components/eventi/event-form.tsx:1-6` (imports), `:36-55` (state), `:144-150` (JSX tra Locandina e Nome)

**Interfaces:**
- Consumes: `AiGenerateModal` dal Task 2 (props `contesto`, `onApply`, `onClose`).
- Produces: nessuna nuova interfaccia esterna — è il punto di integrazione finale.

- [ ] **Step 1: Aggiungi gli import**

In `src/components/eventi/event-form.tsx`, sostituisci le righe 1-6:

```typescript
"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Upload, X } from "lucide-react";
import type { Evento, EventModalita, EventVisibilita } from "@/lib/types/events";
```

con:

```typescript
"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Upload, X, Sparkles } from "lucide-react";
import type { Evento, EventModalita, EventVisibilita } from "@/lib/types/events";
import { AiGenerateModal } from "./ai-generate-modal";
```

- [ ] **Step 2: Aggiungi lo stato di apertura del modale**

Nello stesso file, subito dopo la riga (attuale) `const [coverFile, setCoverFile] = useState<File | null>(null);` (riga 39) e prima di `const [form, setForm] = useState({`, aggiungi:

```typescript
  const [showAiModal, setShowAiModal] = useState(false);
```

- [ ] **Step 3: Aggiungi il pulsante e il rendering del modale**

Nel blocco JSX, tra la chiusura del blocco "Locandina" (`</div>` seguito da riga vuota, attuale riga 144) e l'apertura del blocco "Nome" (attuale riga 146 `{/* Nome */}`), inserisci:

```tsx
      {/* AI genera titolo+descrizione */}
      <div>
        <button
          type="button"
          onClick={() => setShowAiModal(true)}
          className="flex items-center gap-2 text-sm font-medium text-accent hover:underline"
        >
          <Sparkles size={14} strokeWidth={1.75} />
          Genera con AI
        </button>
      </div>

```

Poi, subito prima della chiusura del `<form>` (dopo il blocco `{/* Actions */}` e prima di `</form>`, attuale riga 272-273), inserisci:

```tsx

      {/* Modale AI */}
      {showAiModal && (
        <AiGenerateModal
          contesto={{
            data_inizio: form.data_inizio,
            location: form.location,
            modalita: form.modalita,
            prezzo: form.prezzo,
            visibilita: form.visibilita,
          }}
          onApply={(nome, descrizione) => {
            set("nome", nome);
            set("descrizione", descrizione);
            setShowAiModal(false);
          }}
          onClose={() => setShowAiModal(false)}
        />
      )}
```

- [ ] **Step 4: Verifica TypeScript**

Run: `npx tsc --noEmit`
Expected: nessun errore

- [ ] **Step 5: Verifica manuale end-to-end nel browser**

```bash
npm run dev
```

Poi nel browser, loggato come `alessandro@iseven.it`:
1. Vai su `/eventi/nuovo`.
2. Compila Data inizio, Luogo, Modalità (per popolare il contesto).
3. Clicca "Genera con AI".
4. Verifica: textarea vuota + click "Genera" → mostra errore "Descrivi l'evento in poche parole." (nessuna chiamata di rete).
5. Scrivi un'idea (es. "serata formazione prodotti SA8, aperta a tutto il gruppo") e clicca "Genera".
   - Se `ANTHROPIC_API_KEY` non è settata in locale: verifica che compaia l'errore "Configurazione AI mancante..." senza crash della pagina (comportamento atteso, vedi Global Constraints).
   - Se la chiave è stata aggiunta per il test: verifica che compaiano 3 card (Formale/Entusiasta/Diretto) con titolo+descrizione coerenti col contesto inserito.
6. Clicca "Usa questa" su una card → verifica che i campi "Nome evento" e "Descrizione" del form si popolino con quel testo e il modale si chiuda.
7. Verifica che i campi restino modificabili a mano dopo l'applicazione.

- [ ] **Step 6: Commit**

```bash
git add src/components/eventi/event-form.tsx
git commit -m "feat(eventi): integra pulsante e modale AI nel form evento"
```

---

## Self-Review

**Spec coverage:**
- Flusso UI (pulsante, modale, textarea, contesto silenzioso, 3 card per tono, "Usa questa", "Rigenera") → Task 2 + Task 3. ✓
- Backend (endpoint, auth check, env check, validazione idea, tool-forced Anthropic call, error handling) → Task 1. ✓
- Permessi (solo auth, nessun role-gate aggiuntivo) → Task 1 Step 1 (`supabase.auth.getUser()`, nessun check ruolo). ✓
- File coinvolti (nuovo endpoint, nuovo modale, form modificato) → coincidono esattamente con i 3 task. ✓
- Fuori scope (no persistenza, no immagini, no numero varianti configurabile, no role-gate diverso) → nessun task lo introduce. ✓

**Placeholder scan:** nessun TBD/TODO; ogni step ha codice completo.

**Type consistency:** `Variante`/`Tono` definiti identicamente in Task 1 (`route.ts`) e Task 2 (`ai-generate-modal.tsx`); props `AiGenerateModalProps` usate in Task 3 corrispondono esattamente alla definizione del Task 2; `onApply(nome, descrizione)` in Task 3 chiama `set("nome", ...)`/`set("descrizione", ...)`, funzione `set` già esistente in `event-form.tsx` (riga 57-59, non modificata da questo piano).
