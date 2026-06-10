import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const { data: rows, error } = await supabase
    .from("customer_dates")
    .select(
      "id, data, descrizione, customer:customers(id, nome, cognome, telefono, partner_id)"
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const horizonDays = 60;

  type Row = {
    id: string;
    data: string;
    descrizione: string;
    customer: {
      id: string;
      nome: string;
      cognome: string | null;
      telefono: string | null;
      partner_id: string;
    } | null;
  };

  const items = (rows as unknown as Row[])
    .filter((r) => r.customer && r.customer.partner_id === user.id)
    .map((r) => {
      const [y, m, d] = r.data.split("-").map(Number);
      let next = new Date(today.getFullYear(), m - 1, d);
      next.setHours(0, 0, 0, 0);
      if (next < today) {
        next = new Date(today.getFullYear() + 1, m - 1, d);
      }
      const giorni = Math.round(
        (next.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
      );
      const eta = y > 1900 ? next.getFullYear() - y : null;
      return {
        id: r.id,
        customer_id: r.customer!.id,
        customer_nome: `${r.customer!.nome}${r.customer!.cognome ? " " + r.customer!.cognome : ""}`,
        telefono: r.customer!.telefono,
        descrizione: r.descrizione,
        data_originale: r.data,
        data_prossima: next.toISOString().slice(0, 10),
        giorni,
        eta_compiuti: eta,
      };
    })
    .filter((it) => it.giorni <= horizonDays)
    .sort((a, b) => a.giorni - b.giorni);

  return NextResponse.json({ promemoria: items });
}
