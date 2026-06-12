import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

type Qualifica =
  | "nessuna"
  | "silver"
  | "gold"
  | "platino"
  | "smeraldo"
  | "diamante";

const QUALIFICHE: Qualifica[] = [
  "nessuna",
  "silver",
  "gold",
  "platino",
  "smeraldo",
  "diamante",
];

interface SignupPayload {
  sponsor_slug: string;
  nome: string;
  cognome: string;
  email: string;
  password: string;
  cellulare: string;
  codice_amway?: string;
  qualifica?: Qualifica;
  data_ingresso?: string; // YYYY-MM-DD
  platino_riferimento_id?: string;
  indirizzo?: string;
  citta?: string;
}

export async function POST(request: NextRequest) {
  let body: SignupPayload;
  try {
    body = (await request.json()) as SignupPayload;
  } catch {
    return NextResponse.json({ error: "Dati non validi" }, { status: 400 });
  }

  const required: (keyof SignupPayload)[] = [
    "sponsor_slug",
    "nome",
    "cognome",
    "email",
    "password",
    "cellulare",
  ];
  for (const k of required) {
    if (!body[k] || !String(body[k]).trim()) {
      return NextResponse.json(
        { error: `Campo obbligatorio mancante: ${k}` },
        { status: 400 },
      );
    }
  }

  if (body.password.length < 6) {
    return NextResponse.json(
      { error: "La password deve avere almeno 6 caratteri" },
      { status: 400 },
    );
  }

  const qualifica: Qualifica =
    body.qualifica && QUALIFICHE.includes(body.qualifica)
      ? body.qualifica
      : "nessuna";

  const supabase = createAdminClient();

  // 1) Verifica sponsor
  const slug = body.sponsor_slug.trim();
  const { data: sponsor } = await supabase
    .from("profiles")
    .select("id, codice_amway, nome")
    .or(`invite_url_slug.eq.${slug.toUpperCase()},invite_url_slug.eq.${slug}`)
    .maybeSingle();

  if (!sponsor) {
    return NextResponse.json(
      { error: "Sponsor non trovato. Verifica il link di invito." },
      { status: 404 },
    );
  }

  // 2) Verifica codice Amway non duplicato (se fornito)
  const codice = body.codice_amway?.trim() || null;
  if (codice) {
    const { data: clash } = await supabase
      .from("profiles")
      .select("id")
      .eq("codice_amway", codice)
      .maybeSingle();
    if (clash) {
      return NextResponse.json(
        { error: `Codice Amway ${codice} già usato da un altro partner` },
        { status: 409 },
      );
    }
  }

  // 3) Verifica platino (se fornito)
  let platino_id: string | null = null;
  if (body.platino_riferimento_id) {
    const { data: platino } = await supabase
      .from("profiles")
      .select("id, qualifica")
      .eq("id", body.platino_riferimento_id)
      .maybeSingle();
    if (!platino) {
      return NextResponse.json(
        { error: "Platino di riferimento non trovato" },
        { status: 400 },
      );
    }
    if (
      !["platino", "smeraldo", "diamante"].includes(platino.qualifica)
    ) {
      return NextResponse.json(
        { error: "Il riferimento selezionato non ha qualifica platino o superiore" },
        { status: 400 },
      );
    }
    platino_id = platino.id;
  }

  // 4) Crea utente auth
  const { data: userData, error: userErr } = await supabase.auth.admin.createUser({
    email: body.email.trim().toLowerCase(),
    password: body.password,
    email_confirm: true, // auto-confermato finché non attiviamo email verification
    user_metadata: {
      nome: body.nome.trim(),
      cognome: body.cognome.trim(),
      sponsor_codice: sponsor.codice_amway,
    },
  });

  if (userErr || !userData.user) {
    const msg = userErr?.message || "Errore creazione utente";
    const status = msg.toLowerCase().includes("already") ? 409 : 500;
    return NextResponse.json(
      {
        error: status === 409
          ? "Esiste già un account con questa email"
          : msg,
      },
      { status },
    );
  }

  const userId = userData.user.id;

  // 5) Crea profile collegato
  const fullName = `${body.nome.trim()} ${body.cognome.trim()}`.trim();
  const slugForNew = codice || null; // solo chi ha già codice Amway può invitare subito
  const dataIngresso = body.data_ingresso?.trim() || new Date().toISOString().slice(0, 10);

  const { error: profileErr } = await supabase.from("profiles").insert({
    id: userId,
    codice_amway: codice,
    nome: fullName,
    email: body.email.trim().toLowerCase(),
    telefono: body.cellulare.trim(),
    indirizzo: body.indirizzo?.trim() || null,
    citta: body.citta?.trim() || null,
    paese: "Italia",
    ruolo: "incaricato",
    qualifica,
    data_ingresso: dataIngresso,
    sponsor_id: sponsor.id,
    codice_sponsor: sponsor.codice_amway,
    platino_riferimento_id: platino_id,
    invite_url_slug: slugForNew,
    profilo_completato: false,
  });

  if (profileErr) {
    // rollback dell'utente auth se l'insert fallisce, per non lasciare orfani
    await supabase.auth.admin.deleteUser(userId);
    return NextResponse.json(
      { error: `Errore creazione profilo: ${profileErr.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({
    user_id: userId,
    sponsor: { codice_amway: sponsor.codice_amway, nome: sponsor.nome },
  }, { status: 201 });
}
