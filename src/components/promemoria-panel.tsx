"use client";

import { useEffect, useState } from "react";

interface Promemoria {
  id: string;
  customer_id: string;
  customer_nome: string;
  telefono: string | null;
  descrizione: string;
  data_originale: string;
  data_prossima: string;
  giorni: number;
  eta_compiuti: number | null;
}

function buildWaLink(telefono: string | null, testo: string): string | null {
  if (!telefono) return null;
  const clean = telefono.replace(/\s+/g, "").replace(/^\+/, "");
  return `https://wa.me/${clean}?text=${encodeURIComponent(testo)}`;
}

function buildTemplate(p: Promemoria): string {
  const nome = p.customer_nome.split(" ")[0];
  const desc = p.descrizione.toLowerCase();
  if (desc.includes("compleanno") || desc.includes("buon compleanno")) {
    return `Ciao ${nome}! 🎂 Tantissimi auguri di buon compleanno${p.eta_compiuti ? `, ${p.eta_compiuti} anni vissuti splendidamente!` : "!"} Un abbraccio.`;
  }
  if (desc.includes("anniversario")) {
    return `Ciao ${nome}! 💐 Tanti auguri per il vostro anniversario, una giornata speciale!`;
  }
  if (desc.includes("onomastico")) {
    return `Ciao ${nome}! ✨ Buon onomastico!`;
  }
  return `Ciao ${nome}! Volevo ricordarti la data di oggi: ${p.descrizione}. Un caro saluto!`;
}

function formatLabel(p: Promemoria): string {
  if (p.giorni === 0) return "Oggi";
  if (p.giorni === 1) return "Domani";
  if (p.giorni <= 7) return `Tra ${p.giorni} giorni`;
  const d = new Date(p.data_prossima);
  return d.toLocaleDateString("it-IT", { day: "numeric", month: "short" });
}

function urgencyClass(giorni: number): string {
  if (giorni === 0) return "bg-coral-soft text-coral";
  if (giorni <= 3) return "bg-accent-glow text-accent-hover";
  if (giorni <= 7) return "bg-[#E3F2FD] text-[#1976D2]";
  return "bg-bg-section text-text-secondary";
}

export function PromemoriaPanel() {
  const [items, setItems] = useState<Promemoria[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dashboard/promemoria")
      .then((r) => r.json())
      .then((d) => setItems(d.promemoria || []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="bg-bg-card border border-border rounded-2xl p-5 md:p-6">
      <div className="flex items-baseline justify-between mb-4">
        <h3 className="font-semibold text-text-primary">Date in arrivo</h3>
        <span className="text-xs text-text-secondary">prossimi 60 giorni</span>
      </div>

      {loading ? (
        <div className="py-6 text-center text-sm text-text-secondary">Caricamento…</div>
      ) : items.length === 0 ? (
        <div className="py-6 text-center">
          <p className="text-2xl mb-2">📅</p>
          <p className="text-sm text-text-secondary">
            Nessuna data nei prossimi 60 giorni.
          </p>
          <a
            href="/clienti"
            className="inline-block mt-3 text-sm text-accent font-semibold hover:underline"
          >
            Aggiungi date ai clienti →
          </a>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((p) => {
            const waLink = buildWaLink(p.telefono, buildTemplate(p));
            return (
              <div
                key={p.id}
                className="flex items-center gap-3 p-3 bg-bg-main rounded-xl"
              >
                <div className="w-10 h-10 rounded-lg bg-accent-glow flex items-center justify-center text-accent shrink-0">
                  <span className="text-base">📅</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm text-text-primary truncate">
                    {p.descrizione}
                    {p.eta_compiuti !== null && (
                      <span className="ml-1.5 text-xs text-text-gentle font-normal">
                        ({p.eta_compiuti} anni)
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-text-secondary truncate">
                    {p.customer_nome}
                  </div>
                </div>
                <span
                  className={`text-[11px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${urgencyClass(p.giorni)}`}
                >
                  {formatLabel(p)}
                </span>
                {waLink && (
                  <a
                    href={waLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={`Auguri ${p.customer_nome.split(" ")[0]} su WhatsApp`}
                    className="shrink-0 w-9 h-9 rounded-full bg-[#25D366] text-white flex items-center justify-center hover:opacity-80 transition-opacity"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                    </svg>
                  </a>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
