"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { sanitizeSlug } from "@/lib/auth/slug";

interface Sponsor {
  id: string;
  codice_amway: string;
  nome: string;
  qualifica: string;
  slug: string;
}

const QUALIFICA_LABEL: Record<string, string> = {
  nessuna: "Incaricato",
  "3%": "3%",
  "6%": "6%",
  "9%": "9%",
  "12%": "12%",
  "15%": "15%",
  "18%": "18%",
  silver: "Silver",
  gold: "Gold",
  platino: "Platino",
  rubino: "Rubino",
  zaffiro: "Zaffiro",
  smeraldo: "Smeraldo",
  diamante: "Diamante",
};

export default function InvitePage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [sponsor, setSponsor] = useState<Sponsor | null>(null);
  const [error, setError] = useState("");
  const [currentEmail, setCurrentEmail] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setCurrentEmail(data.user?.email ?? null);
    });

    const cleanSlug = sanitizeSlug(slug);
    if (!cleanSlug) {
      setError("Link non valido");
      setLoading(false);
      return;
    }

    fetch(`/api/sponsor/${encodeURIComponent(cleanSlug)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.sponsor) {
          setSponsor(data.sponsor);
        } else {
          const msg = typeof data.error === "string" && !data.error.startsWith("TypeError")
            ? data.error
            : "Sponsor non trovato. Verifica che il link sia corretto.";
          setError(msg);
        }
      })
      .catch(() => setError("Errore caricamento sponsor. Riprova tra poco."))
      .finally(() => setLoading(false));
  }, [slug, supabase]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-10 h-10 border-3 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !sponsor) {
    return (
      <div className="flex-1 flex items-center justify-center bg-bg-main px-4">
        <div className="w-full max-w-md text-center bg-bg-card border border-border rounded-2xl p-8">
          <p className="text-3xl mb-3">⚠️</p>
          <h1 className="text-lg font-bold text-text-primary mb-2">
            Link non valido
          </h1>
          <p className="text-sm text-text-secondary mb-5">
            {error || "Non abbiamo trovato lo sponsor associato a questo link."}
          </p>
          <button
            onClick={() => router.push("/login")}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-accent text-white hover:bg-accent-hover transition-all"
          >
            Vai al login
          </button>
        </div>
      </div>
    );
  }

  // Caso "già loggato" — mostra warning, niente azioni magiche
  if (currentEmail) {
    return (
      <div className="flex-1 flex items-center justify-center bg-bg-main px-4">
        <div className="w-full max-w-md text-center bg-bg-card border border-border rounded-2xl p-8">
          <p className="text-3xl mb-3">🙋</p>
          <h1 className="text-lg font-bold text-text-primary mb-2">
            Sei già iscritto
          </h1>
          <p className="text-sm text-text-secondary mb-5">
            Sei loggato come <span className="font-semibold">{currentEmail}</span>.
            L&apos;invito è ignorato — puoi continuare con il tuo account oppure
            uscire per registrare un nuovo profilo.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => router.push("/")}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-accent text-white hover:bg-accent-hover transition-all"
            >
              Vai alla dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex items-center justify-center bg-bg-main px-4 py-10 overflow-y-auto">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-text-primary">WeShare</h1>
          <p className="text-sm text-text-gentle mt-1">powered by Me.To.Do for you®</p>
        </div>

        <div className="bg-bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
          <div className="bg-gradient-to-br from-accent-glow to-coral-soft p-6 text-center border-b border-divider">
            <p className="text-xs uppercase tracking-wide text-text-secondary mb-2">
              Sei stato invitato da
            </p>
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-accent to-accent-hover flex items-center justify-center text-white text-xl font-bold mx-auto mb-3">
              {sponsor.nome.split(/\s+/).map((p) => p[0]?.toUpperCase() || "").join("").slice(0, 2)}
            </div>
            <div className="text-lg font-bold text-text-primary">
              {sponsor.nome}
            </div>
            <div className="text-xs text-text-secondary mt-1">
              {QUALIFICA_LABEL[sponsor.qualifica] || sponsor.qualifica}
              {" · "}cod. {sponsor.codice_amway}
            </div>
          </div>

          <div className="p-6">
            <h2 className="text-base font-semibold text-text-primary mb-3">
              Unisciti al gruppo
            </h2>
            <p className="text-sm text-text-secondary mb-5">
              Crea il tuo account WeShare per gestire clienti, ordini ed eventi del tuo team.
              La registrazione richiede 1 minuto.
            </p>
            <button
              onClick={() =>
                router.push(`/registrati?sponsor=${encodeURIComponent(sponsor.slug)}`)
              }
              className="w-full py-3 rounded-xl text-sm font-semibold bg-accent text-white hover:bg-accent-hover transition-all"
            >
              Registrati ora
            </button>
            <button
              onClick={() => router.push("/login")}
              className="w-full mt-2 py-2 text-xs text-text-secondary hover:text-accent transition-colors"
            >
              Hai già un account? Accedi
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
