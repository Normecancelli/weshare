import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const EDITABLE = ["titolo", "data_ora", "durata_min", "location", "note"];

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; appointmentId: string }> }
) {
  const supabase = await createClient();
  const { appointmentId } = await params;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const updates: Record<string, unknown> = {};
    for (const field of EDITABLE) {
      if (field in body) {
        const value = body[field];
        updates[field] =
          typeof value === "string" ? value.trim() || null : value;
      }
    }
    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "Nessun campo da aggiornare" },
        { status: 400 }
      );
    }
    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from("prospect_appointments")
      .update(updates)
      .eq("id", appointmentId)
      .eq("partner_id", user.id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ appointment: data });
  } catch {
    return NextResponse.json({ error: "Dati non validi" }, { status: 400 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; appointmentId: string }> }
) {
  const supabase = await createClient();
  const { appointmentId } = await params;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const { error } = await supabase
    .from("prospect_appointments")
    .delete()
    .eq("id", appointmentId)
    .eq("partner_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
