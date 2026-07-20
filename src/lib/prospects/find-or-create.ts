import type { SupabaseClient } from "@supabase/supabase-js";

export interface ProspectInput {
  nome: string;
  telefono: string;
  email: string;
  source: string;
}

export async function findOrCreateProspect(
  admin: SupabaseClient,
  partnerId: string,
  input: ProspectInput
): Promise<{ id: string } | { error: string }> {
  const { nome, telefono, email, source } = input;

  let existingId: string | null = null;

  if (telefono) {
    const { data, error } = await admin
      .from("prospects")
      .select("id")
      .eq("partner_id", partnerId)
      .eq("telefono", telefono)
      .maybeSingle();
    if (error) return { error: error.message };
    if (data) existingId = data.id;
  }
  if (!existingId && email) {
    const { data, error } = await admin
      .from("prospects")
      .select("id")
      .eq("partner_id", partnerId)
      .eq("email", email)
      .maybeSingle();
    if (error) return { error: error.message };
    if (data) existingId = data.id;
  }

  if (existingId) {
    const { data, error } = await admin
      .from("prospects")
      .update({
        nome,
        ...(telefono ? { telefono } : {}),
        ...(email ? { email } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("id", existingId)
      .select("id")
      .single();
    if (error || !data) return { error: error?.message || "Errore durante il salvataggio" };
    return { id: data.id };
  }

  const { data, error } = await admin
    .from("prospects")
    .insert({
      partner_id: partnerId,
      nome,
      telefono: telefono || null,
      email: email || null,
      source,
      stato: "nuovo_contatto",
    })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message || "Errore durante il salvataggio" };
  return { id: data.id };
}
