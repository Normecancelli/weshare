"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

type Mode = "login" | "recovery";

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError("Credenziali non valide. Riprova.");
      setLoading(false);
    } else {
      router.push("/");
      router.refresh();
    }
  }

  async function handleRecovery(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/update-password`,
    });

    setLoading(false);
    if (error) {
      setError(error.message);
    } else {
      setMessage(
        `Se l'indirizzo ${email} è registrato, riceverai una mail con il link per impostare una nuova password. Controlla anche la cartella spam.`,
      );
    }
  }

  function switchMode(next: Mode) {
    setMode(next);
    setError("");
    setMessage("");
    setPassword("");
  }

  return (
    <div className="flex-1 flex items-center justify-center bg-bg-main">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-text-primary">
            WeShare
          </h1>
          <p className="text-sm text-text-gentle mt-1">
            powered by Me.To.Do for you®
          </p>
        </div>

        {mode === "login" ? (
          <form
            onSubmit={handleLogin}
            className="bg-bg-card border border-border rounded-2xl p-8 shadow-sm"
          >
            <h2 className="text-lg font-semibold text-text-primary mb-6">
              Accedi
            </h2>

            {error && (
              <div className="bg-coral-soft text-coral text-sm p-3 rounded-xl mb-4">
                {error}
              </div>
            )}

            <div className="mb-4">
              <label className="block text-sm font-medium text-text-secondary mb-1.5">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-border bg-bg-main text-text-primary text-sm focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all"
                placeholder="nome@email.com"
                required
              />
            </div>

            <div className="mb-3">
              <label className="block text-sm font-medium text-text-secondary mb-1.5">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-border bg-bg-main text-text-primary text-sm focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all"
                placeholder="••••••••"
                required
              />
            </div>

            <div className="text-right mb-5">
              <button
                type="button"
                onClick={() => switchMode("recovery")}
                className="text-xs text-text-secondary hover:text-accent transition-colors"
              >
                Password dimenticata?
              </button>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-xl text-sm font-semibold bg-accent text-white hover:bg-accent-hover transition-all disabled:opacity-50"
            >
              {loading ? "Accesso..." : "Accedi"}
            </button>

            <p className="text-center text-xs text-text-gentle mt-4">
              Non hai un account? Chiedi un invito al tuo sponsor.
            </p>
          </form>
        ) : (
          <form
            onSubmit={handleRecovery}
            className="bg-bg-card border border-border rounded-2xl p-8 shadow-sm"
          >
            <h2 className="text-lg font-semibold text-text-primary mb-2">
              Recupera password
            </h2>
            <p className="text-xs text-text-secondary mb-6">
              Inserisci la tua email. Ti invieremo un link per impostare una nuova password.
            </p>

            {error && (
              <div className="bg-coral-soft text-coral text-sm p-3 rounded-xl mb-4">
                {error}
              </div>
            )}

            {message && (
              <div className="bg-accent-glow text-accent-hover text-sm p-3 rounded-xl mb-4">
                {message}
              </div>
            )}

            <div className="mb-5">
              <label className="block text-sm font-medium text-text-secondary mb-1.5">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-border bg-bg-main text-text-primary text-sm focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all"
                placeholder="nome@email.com"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-xl text-sm font-semibold bg-accent text-white hover:bg-accent-hover transition-all disabled:opacity-50 mb-3"
            >
              {loading ? "Invio in corso..." : "Invia link di recupero"}
            </button>

            <button
              type="button"
              onClick={() => switchMode("login")}
              className="w-full text-xs text-text-secondary hover:text-accent transition-colors"
            >
              ← Torna al login
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
