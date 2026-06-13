"use client";

import { useState } from "react";

const WHATSAPP_NUMBER = "393498588020";

export default function NotFound() {
  const [idea, setIdea] = useState("");

  const intro = "Ciao Ale! Sono finito su una pagina in costruzione e volevo lasciarti la mia idea:";
  const fallback = "Ciao Ale! Sono finito su una pagina in costruzione e volevo farti i complimenti per il lavoro che stai facendo.";

  const body = idea.trim() ? `${intro}\n\n${idea.trim()}` : fallback;
  const waUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(body)}`;

  return (
    <main className="flex-1 h-full overflow-y-auto bg-bg-main">
      <div className="min-h-full flex items-center justify-center px-4 py-10 sm:py-16">
        <div className="w-full max-w-xl bg-bg-card rounded-2xl shadow-lg border border-border p-6 sm:p-10">
          <div className="flex flex-col items-center text-center">
            <div className="w-32 h-32 sm:w-36 sm:h-36 rounded-full overflow-hidden ring-4 ring-accent-glow shadow-md mb-5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/ale-jerry.jpg"
                alt="Ale Jerry"
                className="w-full h-full object-cover"
              />
            </div>

            <span className="text-xs font-semibold uppercase tracking-wider text-accent">
              Pagina in costruzione
            </span>
            <h1 className="mt-2 text-2xl sm:text-3xl font-bold text-text-primary">
              Ale Jerry ci sta lavorando
            </h1>

            <p className="mt-5 text-text-secondary leading-relaxed">
              Appena i neuroni gli tornano dalle ferie, vedrai che meraviglia ha creato
              per te — per farti apprezzare di più la tua attività e renderla più fluida
              possibile.
            </p>

            <p className="mt-4 text-text-secondary leading-relaxed">
              Nel frattempo le tue osservazioni sono gradite: scrivi qui la tua idea
              e mandami un WhatsApp.
            </p>
          </div>

          <label className="block mt-7">
            <span className="block text-sm font-medium text-text-primary mb-2">
              La tua idea
            </span>
            <textarea
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
              rows={4}
              placeholder="Es: vorrei poter filtrare i clienti per città, oppure ricevere una notifica quando..."
              className="w-full rounded-xl border border-border bg-bg-main px-4 py-3 text-text-primary placeholder:text-text-gentle focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent resize-none"
            />
          </label>

          <a
            href={waUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#25D366] hover:bg-[#1FB857] text-white font-semibold px-5 py-3 transition shadow-md"
          >
            <svg
              className="w-5 h-5"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413z" />
            </svg>
            Mandami un WhatsApp
          </a>

          <p className="mt-5 text-center text-sm text-text-gentle">
            Grazie!
          </p>
        </div>
      </div>
    </main>
  );
}
