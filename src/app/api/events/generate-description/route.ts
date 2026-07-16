import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAiUsage, AI_FREE_GENERATIONS_LIMIT } from "@/lib/auth/ai-limit";

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

  const admin = createAdminClient();
  const { hasPersonalKey, generationsCount, anthropicApiKey } = await getAiUsage(admin, user.id);

  let apiKey: string;
  if (hasPersonalKey && anthropicApiKey) {
    apiKey = anthropicApiKey;
  } else {
    if (generationsCount >= AI_FREE_GENERATIONS_LIMIT) {
      return NextResponse.json(
        {
          error:
            "Hai esaurito le 5 generazioni gratuite. Aggiungi la tua chiave Anthropic personale in Impostazioni per continuare.",
        },
        { status: 403 },
      );
    }
    const globalKey = process.env.ANTHROPIC_API_KEY;
    if (!globalKey) {
      return NextResponse.json(
        {
          error:
            "Configurazione AI mancante. Contatta l'amministratore (ANTHROPIC_API_KEY non impostata).",
        },
        { status: 500 },
      );
    }
    apiKey = globalKey;
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

  if (!hasPersonalKey) {
    await admin
      .from("profiles")
      .update({ ai_generations_count: generationsCount + 1 })
      .eq("id", user.id);
  }

  return NextResponse.json({ varianti: toolUseInput.varianti });
}
