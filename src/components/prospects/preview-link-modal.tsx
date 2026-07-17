"use client";

import { useState } from "react";
import type { Prospect } from "@/lib/types/prospects";
import { buildMailto, buildWhatsappUrl } from "@/lib/prospects/links";
import { InlineMessage } from "@/components/ui/inline-message";

const inputClass =
  "w-full px-4 py-2.5 rounded-xl text-sm border border-border bg-bg-main focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent";

type Props = {
  prospect: Prospect;
  onClose: () => void;
};

export function PreviewLinkModal({ prospect, onClose }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  async function generate() {
    setLoading(true);
    setError("");
    const res = await fetch(`/api/prospects/${prospect.id}/preview-link`, { method: "POST" });
    const d = await res.json();
    if (res.ok) {
      setUrl(d.url);
    } else {
      setError(d.error || "Errore durante la generazione del link");
    }
    setLoading(false);
  }

  function copyLink() {
    if (!url) return;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const message = url
    ? `Ciao ${prospect.nome.split(" ")[0]}! Dai un'occhiata qui, ci sono i prossimi eventi e qualche contenuto utile: ${url}`
    : "";

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center pt-8 md:pt-16 px-4 overflow-y-auto">
      <div className="bg-bg-card border border-border rounded-2xl w-full max-w-md shadow-xl mb-8">
        <div className="flex items-center justify-between p-5 border-b border-divider">
          <h3 className="text-lg font-bold text-text-primary">Link vetrina per {prospect.nome}</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-bg-section flex items-center justify-center text-text-secondary transition-all">✕</button>
        </div>
        <div className="p-5 space-y-3">
          {error && <InlineMessage variant="error">{error}</InlineMessage>}

          {!url ? (
            <>
              <p className="text-sm text-text-secondary">Genera un link personale (valido 30 giorni) con eventi e contenuti selezionati da mostrare a {prospect.nome}.</p>
              <button onClick={generate} disabled={loading} className="w-full py-3 rounded-xl text-sm font-semibold bg-accent text-white hover:bg-accent-hover transition-all disabled:opacity-50">
                {loading ? "Generazione..." : "Genera link"}
              </button>
            </>
          ) : (
            <>
              <div className="flex gap-2">
                <input readOnly value={url} className={inputClass} />
                <button onClick={copyLink} className="px-3 py-2 rounded-xl text-sm font-semibold bg-bg-section text-text-primary hover:bg-accent-glow transition-all shrink-0">
                  {copied ? "Copiato!" : "Copia"}
                </button>
              </div>
              <div className="flex gap-2">
                {prospect.email && (
                  <a href={buildMailto(prospect.email, "Dai un'occhiata qui", message)} target="_blank" rel="noopener noreferrer" className="flex-1 text-center px-3 py-2 rounded-xl text-sm font-semibold bg-bg-section text-text-primary hover:bg-accent-glow transition-all">✉️ Email</a>
                )}
                {prospect.telefono && (
                  <a href={buildWhatsappUrl(prospect.telefono, message)} target="_blank" rel="noopener noreferrer" className="flex-1 text-center px-3 py-2 rounded-xl text-sm font-semibold bg-[#25D366] text-white hover:opacity-90 transition-all">WhatsApp</a>
                )}
              </div>
              <button onClick={generate} disabled={loading} className="text-xs text-text-secondary hover:text-accent transition-colors">
                Rigenera link (invalida quello precedente)
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
