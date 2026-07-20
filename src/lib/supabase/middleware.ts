import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseUrl, getSupabaseAnonKey } from "./env";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    getSupabaseUrl(),
    getSupabaseAnonKey(),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublicPath =
    path.startsWith("/login") ||
    path.startsWith("/auth") ||
    path.startsWith("/invite") ||
    path.startsWith("/anteprima") ||
    path.startsWith("/registrati") ||
    path.startsWith("/contatto") ||
    path.startsWith("/prenota") ||
    path === "/api/sponsor" ||
    path.startsWith("/api/sponsor/") ||
    path === "/api/profiles/platino-search" ||
    path === "/api/auth/signup" ||
    path.startsWith("/api/anteprima/") ||
    path.startsWith("/api/contatto/") ||
    path.startsWith("/api/prospects/public/") ||
    path.startsWith("/api/prenota/");

  if (!user && !isPublicPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
