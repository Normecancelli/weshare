"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function UpdatePasswordPage() {
  const router = useRouter();
  const supabase = createClient();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) {
        setUserEmail(data.session.user.email ?? null);
        setReady(true);
      } else {
        setError(
          "Link non valido o scaduto. Torna al login e richiedi un nuovo link di recupero.",
        );
      }
    });
  }, [supabase]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError("Le password non coincidono.");
      return;
    }
    if (password.length < 8) {
      setError("La password deve avere almeno 8 caratteri.");
      return;
    }

    setLoading(true);
    setError("");
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    setSuccess(true);
    setTimeout(() => router.push("/"), 1500);
  }

  return (
    <div className="flex-1 flex items-center justify-center bg-bg-main">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-text-primary">Amway Partner</h1>
          <p className="text-sm text-text-gentle mt-1">powered by ME.TO.DO®</p>
        </div>

        <div className="bg-bg-card border border-border rounded-2xl p-8 shadow-sm">
          <h2 className="text-lg font-semibold text-text-primary mb-2">
            Nuova password
          </h2>
          {userEmail && (
            <p className="text-xs text-text-secondary mb-6">
              Account: <span className="font-semibold">{userEmail}</span>
            </p>
          )}

          {error && (
            <div className="bg-coral-soft text-coral text-sm p-3 rounded-xl mb-4">
              {error}
            </div>
          )}

          {success ? (
            <div className="bg-accent-glow text-accent-hover text-sm p-3 rounded-xl">
              Password aggiornata. Ti sto reindirizzando…
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-text-secondary mb-1.5">
                  Nuova password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-border bg-bg-main text-text-primary text-sm focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all"
                  placeholder="Almeno 8 caratteri"
                  required
                  disabled={!ready}
                />
              </div>
              <div className="mb-5">
                <label className="block text-sm font-medium text-text-secondary mb-1.5">
                  Conferma password
                </label>
                <input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-border bg-bg-main text-text-primary text-sm focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all"
                  placeholder="••••••••"
                  required
                  disabled={!ready}
                />
              </div>
              <button
                type="submit"
                disabled={!ready || loading}
                className="w-full py-2.5 rounded-xl text-sm font-semibold bg-accent text-white hover:bg-accent-hover transition-all disabled:opacity-50"
              >
                {loading ? "Aggiornamento..." : "Imposta nuova password"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
