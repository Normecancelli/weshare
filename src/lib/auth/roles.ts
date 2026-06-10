import type { SupabaseClient } from "@supabase/supabase-js";

export type UserRole =
  | "topadmin"
  | "admin"
  | "coadmin"
  | "incaricato"
  | "nuovo_iscritto"
  | "prospect";

export const ADMIN_ROLES: UserRole[] = ["topadmin", "admin"];

export function isAdminRole(ruolo: UserRole | null | undefined): boolean {
  return !!ruolo && ADMIN_ROLES.includes(ruolo);
}

export async function getUserRole(
  supabase: SupabaseClient,
  userId: string,
): Promise<UserRole | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("ruolo")
    .eq("id", userId)
    .single();
  if (error || !data) return null;
  return data.ruolo as UserRole;
}
