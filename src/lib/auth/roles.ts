import type { SupabaseClient } from "@supabase/supabase-js";

export type UserRole =
  | "topadmin"
  | "admin"
  | "coadmin"
  | "incaricato"
  | "nuovo_iscritto"
  | "prospect";

export type UserQualifica =
  | "nessuna"
  | "silver"
  | "gold"
  | "platino"
  | "smeraldo"
  | "diamante";

export const ADMIN_ROLES: UserRole[] = ["topadmin", "admin"];
export const EVENT_CREATOR_QUALIFICHE: UserQualifica[] = ["platino", "smeraldo", "diamante"];
export const EVENT_ORGANIZER_QUALIFICHE: UserQualifica[] = ["platino", "smeraldo", "diamante"];

export function isAdminRole(ruolo: UserRole | null | undefined): boolean {
  return !!ruolo && ADMIN_ROLES.includes(ruolo);
}

export function canCreateEvent(
  ruolo: UserRole | null,
  qualifica: UserQualifica | null
): boolean {
  return (
    isAdminRole(ruolo) ||
    (!!qualifica && EVENT_CREATOR_QUALIFICHE.includes(qualifica))
  );
}

export function canManageEvent(
  ruolo: UserRole | null,
  qualifica: UserQualifica | null,
  createdBy: string,
  userId: string
): boolean {
  return createdBy === userId || isAdminRole(ruolo);
}

export function canViewAttendees(
  ruolo: UserRole | null,
  qualifica: UserQualifica | null,
  createdBy: string,
  userId: string
): boolean {
  return (
    createdBy === userId ||
    isAdminRole(ruolo) ||
    (!!qualifica && ["smeraldo", "diamante"].includes(qualifica))
  );
}

export function canSendReminder(
  ruolo: UserRole | null,
  qualifica: UserQualifica | null,
  createdBy: string,
  userId: string
): boolean {
  return (
    createdBy === userId ||
    isAdminRole(ruolo) ||
    (!!qualifica && EVENT_CREATOR_QUALIFICHE.includes(qualifica))
  );
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

export async function getUserQualifica(
  supabase: SupabaseClient,
  userId: string
): Promise<UserQualifica | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("qualifica")
    .eq("id", userId)
    .single();
  if (error || !data) return null;
  return data.qualifica as UserQualifica;
}

export async function getUserRoleAndQualifica(
  supabase: SupabaseClient,
  userId: string
): Promise<{ ruolo: UserRole | null; qualifica: UserQualifica | null }> {
  const { data, error } = await supabase
    .from("profiles")
    .select("ruolo, qualifica")
    .eq("id", userId)
    .single();
  if (error || !data) return { ruolo: null, qualifica: null };
  return {
    ruolo: data.ruolo as UserRole,
    qualifica: data.qualifica as UserQualifica,
  };
}
