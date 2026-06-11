import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";

interface CatalogProduct {
  id: string;
  codice_amway: string;
  descrizione: string;
  contenuto: string | null;
}

interface ExtractedItem {
  codice_amway: string;
  quantita: number;
  matched_text: string;
  confidence: "alta" | "media" | "bassa";
  note?: string;
}

interface ToolInput {
  matches: ExtractedItem[];
  unmatched: string[];
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

  let body: {
    message?: string;
    image?: { data: string; media_type: "image/jpeg" | "image/png" | "image/gif" | "image/webp" };
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Dati non validi" }, { status: 400 });
  }
  const message = (body.message || "").trim();
  const image = body.image;

  if (!message && !image) {
    return NextResponse.json(
      { error: "Devi fornire un messaggio di testo o un'immagine" },
      { status: 400 },
    );
  }
  if (message.length > 4000) {
    return NextResponse.json(
      { error: "Messaggio troppo lungo (max 4000 caratteri)" },
      { status: 400 },
    );
  }
  if (image) {
    if (!image.data || !image.media_type) {
      return NextResponse.json(
        { error: "Formato immagine non valido" },
        { status: 400 },
      );
    }
    // Limite ~6MB base64 (~4.5MB binari) per non saturare il modello
    if (image.data.length > 8_000_000) {
      return NextResponse.json(
        { error: "Immagine troppo grande (max 4-5MB). Riduci la risoluzione." },
        { status: 400 },
      );
    }
  }

  const { data: catalogRows, error: catalogError } = await supabase
    .from("products")
    .select("id, codice_amway, descrizione, contenuto")
    .eq("attivo", true)
    .order("descrizione");

  if (catalogError || !catalogRows) {
    return NextResponse.json(
      { error: "Impossibile caricare il catalogo" },
      { status: 500 },
    );
  }

  const catalog = catalogRows as CatalogProduct[];

  // Build a stable, cacheable catalog block
  const catalogText = catalog
    .map(
      (p) =>
        `${p.codice_amway} | ${p.descrizione}${p.contenuto ? ` | ${p.contenuto}` : ""}`,
    )
    .join("\n");

  const codeToProduct = new Map(catalog.map((p) => [p.codice_amway, p]));

  const anthropic = new Anthropic({ apiKey });

  const tool: Anthropic.Tool = {
    name: "registra_ordine",
    description:
      "Registra i prodotti riconosciuti nel messaggio del cliente e i pezzi di testo che non sei riuscito ad attribuire.",
    input_schema: {
      type: "object",
      properties: {
        matches: {
          type: "array",
          description: "Prodotti riconosciuti.",
          items: {
            type: "object",
            properties: {
              codice_amway: {
                type: "string",
                description:
                  "Codice esatto del catalogo (es. '124485' o '0001'). Mai inventato.",
              },
              quantita: {
                type: "integer",
                minimum: 1,
                description:
                  "Quantità richiesta. Se non specificata nel messaggio, vale 1.",
              },
              matched_text: {
                type: "string",
                description: "Pezzo testuale del messaggio originale che indica questo prodotto.",
              },
              confidence: {
                type: "string",
                enum: ["alta", "media", "bassa"],
                description:
                  "Quanto sei sicuro del match. 'bassa' se ci sono ambiguità o sinonimi rischiosi.",
              },
              note: {
                type: "string",
                description:
                  "Spiegazione breve quando confidence è media/bassa (es. 'S8 interpretato come SA8').",
              },
            },
            required: ["codice_amway", "quantita", "matched_text", "confidence"],
          },
        },
        unmatched: {
          type: "array",
          description:
            "Pezzi di testo che sembrano prodotti ma non sei riuscito ad attribuire a un codice del catalogo.",
          items: { type: "string" },
        },
      },
      required: ["matches", "unmatched"],
    },
  };

  const systemPrompt = `Sei un assistente che estrae ordini Amway da messaggi WhatsApp di clienti italiani.

REGOLE:
- Usa SOLO i codici presenti nel catalogo qui sotto. Mai inventare codici.
- Gestisci sinonimi e abbreviazioni: "S8" o "SA8" = stessa famiglia; "L.O.C." = "LOC"; "doppia X" = "Doppia X"; "omega 3" = "Omega-3". I clienti spesso usano nomi inglesi (es. "All Fabric Bleach" = "Smacchiante Candeggiante per Tutti i Tessuti").
- Riconosci la quantità da pattern come "nr.1", "n.1", "x2", "due", "tre", "un paio". Se non specificata, quantita = 1.
- Se un riferimento è ambiguo (più candidati nel catalogo), scegli quello più probabile e segna confidence "bassa" + spiega in note. Non includere mai duplicati: stesso codice = una riga sola con quantità sommata.
- Saluti, ringraziamenti, frasi di cortesia NON sono prodotti.
- Testi che sembrano prodotti ma non hanno match nel catalogo vanno in "unmatched".
- Rispondi SEMPRE chiamando l'unica tool "registra_ordine".

- L'input può essere un messaggio di testo, un'immagine (es. screenshot WhatsApp, foto di lista scritta a mano, scontrino) o entrambi. In caso di immagine, leggi prima il testo dall'immagine e poi applica le stesse regole.

CATALOGO (codice | descrizione | contenuto):
${catalogText}`;

  let toolUseInput: ToolInput | null = null;

  try {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 2048,
      system: [
        {
          type: "text",
          text: systemPrompt,
          cache_control: { type: "ephemeral" },
        },
      ],
      tools: [tool],
      tool_choice: { type: "tool", name: "registra_ordine" },
      messages: [
        {
          role: "user",
          content: [
            ...(image
              ? [
                  {
                    type: "image" as const,
                    source: {
                      type: "base64" as const,
                      media_type: image.media_type,
                      data: image.data,
                    },
                  },
                ]
              : []),
            {
              type: "text" as const,
              text: message
                ? `Messaggio del cliente:\n"""${message}"""`
                : "Estrai i prodotti dall'immagine sopra. Ignora UI di WhatsApp (timestamp, spunte di lettura, intestazioni). Leggi solo il contenuto del messaggio.",
            },
          ],
        },
      ],
    });

    const block = response.content.find((b) => b.type === "tool_use");
    if (block && block.type === "tool_use") {
      toolUseInput = block.input as ToolInput;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "errore AI";
    return NextResponse.json(
      { error: `Errore AI: ${msg}` },
      { status: 502 },
    );
  }

  if (!toolUseInput) {
    return NextResponse.json(
      { error: "L'AI non ha restituito un risultato valido. Riprova." },
      { status: 502 },
    );
  }

  // Map back to enriched product info, drop hallucinated codes
  const matches = (toolUseInput.matches || [])
    .map((m) => {
      const product = codeToProduct.get(m.codice_amway);
      if (!product) return null;
      return {
        product_id: product.id,
        codice_amway: product.codice_amway,
        descrizione: product.descrizione,
        contenuto: product.contenuto,
        quantita: Math.max(1, Math.floor(m.quantita || 1)),
        matched_text: m.matched_text,
        confidence: m.confidence,
        note: m.note || null,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  // Deduplicate by product_id summing quantities
  const dedup = new Map<string, typeof matches[number]>();
  for (const m of matches) {
    const existing = dedup.get(m.product_id);
    if (existing) {
      existing.quantita += m.quantita;
    } else {
      dedup.set(m.product_id, { ...m });
    }
  }

  return NextResponse.json({
    matches: Array.from(dedup.values()),
    unmatched: toolUseInput.unmatched || [],
  });
}
