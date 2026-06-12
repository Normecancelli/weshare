"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface ProfileSnapshot {
  id: string;
  nome: string;
  codice_amway: string | null;
  citta: string | null;
  indirizzo: string | null;
  profilo_completato: boolean;
}

const slides = [
  {
    icon: "📇",
    title: "I tuoi Clienti",
    body:
      "Tieni traccia di tutti i tuoi clienti Amway in un unico posto. Aggiungi note, date da ricordare (compleanni, anniversari) e contatti.",
  },
  {
    icon: "🛒",
    title: "Ordini intelligenti",
    body:
      "Crea ordini per i clienti dal catalogo. Se ricevi messaggi WhatsApp, l'AI ti estrae i prodotti automaticamente.",
  },
  {
    icon: "📅",
    title: "Eventi del gruppo",
    body:
      "Vedi gli eventi organizzati dal tuo gruppo, conferma la partecipazione, ricevi notifiche.",
  },
  {
    icon: "💡",
    title: "Mancano un paio di info",
    body:
      "Completa il tuo profilo: codice Amway (se ce l'hai), indirizzo. Puoi farlo anche dopo da Impostazioni.",
  },
];

const input =
  "w-full px-3 py-2.5 rounded-xl text-sm border border-border bg-bg-main focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent";

export default function BenvenutoPage() {
  const router = useRouter();
  const supabase = createClient();
  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState<ProfileSnapshot | null>(null);
  const [extra, setExtra] = useState({
    codice_amway: "",
    indirizzo: "",
    citta: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) {
        router.push("/login");
        return;
      }
      const { data: prof } = await supabase
        .from("profiles")
        .select("id, nome, codice_amway, citta, indirizzo, profilo_completato")
        .eq("id", data.user.id)
        .single();
      if (prof) {
        setProfile(prof);
        setExtra({
          codice_amway: prof.codice_amway || "",
          indirizzo: prof.indirizzo || "",
          citta: prof.citta || "",
        });
        if (prof.profilo_completato) router.push("/");
      }
    });
  }, [router, supabase]);

  async function handleFinish() {
    if (!profile) return;
    setSaving(true);
    setError("");

    const updates: Record<string, unknown> = { profilo_completato: true };
    const codice = extra.codice_amway.trim();
    if (codice && codice !== profile.codice_amway) {
      // verifica unicità
      const { data: clash } = await supabase
        .from("profiles")
        .select("id")
        .eq("codice_amway", codice)
        .neq("id", profile.id)
        .maybeSingle();
      if (clash) {
        setSaving(false);
        setError(`Codice Amway ${codice} già usato da un altro partner`);
        return;
      }
      updates.codice_amway = codice;
      updates.invite_url_slug = codice;
    }
    if (extra.indirizzo.trim()) updates.indirizzo = extra.indirizzo.trim();
    if (extra.citta.trim()) updates.citta = extra.citta.trim();

    const { error: updErr } = await supabase
      .from("profiles")
      .update(updates)
      .eq("id", profile.id);

    setSaving(false);
    if (updErr) {
      setError(updErr.message);
      return;
    }
    router.push("/");
    router.refresh();
  }

  if (!profile) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-10 h-10 border-3 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const isLastSlide = step === slides.length - 1;
  const current = slides[step];

  return (
    <div className="flex-1 flex items-center justify-center bg-bg-main px-4 py-8 overflow-y-auto">
      <div className="w-full max-w-md">
        <div className="bg-bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
          <div className="bg-gradient-to-br from-accent-glow to-coral-soft p-6 text-center border-b border-divider">
            <div className="text-4xl mb-2">{current.icon}</div>
            <h2 className="text-xl font-bold text-text-primary">{current.title}</h2>
          </div>

          <div className="p-6">
            <p className="text-sm text-text-secondary mb-5">{current.body}</p>

            {isLastSlide && (
              <div className="space-y-3 mb-5">
                {error && (
                  <div className="bg-coral-soft text-coral text-xs p-2.5 rounded-xl">
                    {error}
                  </div>
                )}
                <div>
                  <label className="text-xs font-semibold text-text-secondary mb-1 block">
                    Codice Amway
                    <span className="text-text-gentle font-normal"> · se ce l&apos;hai</span>
                  </label>
                  <input
                    className={`${input} font-mono`}
                    value={extra.codice_amway}
                    onChange={(e) =>
                      setExtra({ ...extra, codice_amway: e.target.value })
                    }
                    placeholder="es. 8044484"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-text-secondary mb-1 block">
                    Indirizzo
                  </label>
                  <input
                    className={input}
                    value={extra.indirizzo}
                    onChange={(e) =>
                      setExtra({ ...extra, indirizzo: e.target.value })
                    }
                    placeholder="Via, numero"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-text-secondary mb-1 block">
                    Città
                  </label>
                  <input
                    className={input}
                    value={extra.citta}
                    onChange={(e) =>
                      setExtra({ ...extra, citta: e.target.value })
                    }
                  />
                </div>
              </div>
            )}

            <div className="flex items-center justify-between">
              <div className="flex gap-1">
                {slides.map((_, i) => (
                  <div
                    key={i}
                    className={`h-1.5 rounded-full transition-all ${
                      i === step ? "w-6 bg-accent" : "w-1.5 bg-bg-section"
                    }`}
                  />
                ))}
              </div>
              <div className="flex gap-2">
                {step > 0 && (
                  <button
                    type="button"
                    onClick={() => setStep(step - 1)}
                    className="px-3 py-2 text-sm text-text-secondary hover:text-text-primary"
                  >
                    Indietro
                  </button>
                )}
                {!isLastSlide ? (
                  <button
                    type="button"
                    onClick={() => setStep(step + 1)}
                    className="px-4 py-2 rounded-xl text-sm font-semibold bg-accent text-white hover:bg-accent-hover transition-all"
                  >
                    Avanti
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleFinish}
                    disabled={saving}
                    className="px-4 py-2 rounded-xl text-sm font-semibold bg-accent text-white hover:bg-accent-hover transition-all disabled:opacity-50"
                  >
                    {saving ? "Avvio..." : "Entra"}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => router.push("/")}
          className="block mx-auto mt-4 text-xs text-text-gentle hover:text-accent"
        >
          Salta e completa dopo
        </button>
      </div>
    </div>
  );
}
