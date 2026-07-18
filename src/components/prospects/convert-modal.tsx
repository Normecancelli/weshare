"use client";

import { useState } from "react";
import type { Prospect } from "@/lib/types/prospects";
import { buildMailto, buildWhatsappUrl } from "@/lib/prospects/links";

const inputClass =
  "w-full px-4 py-2.5 rounded-xl text-sm border border-border bg-bg-main focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent";

type Props = {
  prospect: Prospect;
  onConverted: () => void;
  onClose: () => void;
};

export function ConvertModal({ prospect, onConverted, onClose }: Props) {
  const [mode, setMode] = useState<"choose" | "cliente" | "partner">("choose");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [custForm, setCustForm] = useState({
    nome: prospect.nome,
    cognome: "",
    telefono: prospect.telefono || "",
    email: prospect.email || "",
    indirizzo: "",
    citta: prospect.citta || "",
    note: prospect.note || "",
  });

  async function convertCliente(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    const res = await fetch(`/api/prospects/${prospect.id}/convert`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ convertTo: "cliente", customerData: custForm }),
    });
    if (res.ok) {
      onConverted();
      onClose();
    } else {
      const d = await res.json();
      setError(d.error || "Errore durante la conversione");
    }
    setSaving(false);
  }

  async function convertPartner() {
    setSaving(true);
    setError("");
    const res = await fetch(`/api/prospects/${prospect.id}/convert`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ convertTo: "partner" }),
    });
    const d = await res.json();
    if (res.ok) {
      const slug = d.inviteSlug;
      setInviteUrl(slug ? `${window.location.origin}/invite/${slug}?prospect=${prospect.id}` : null);
      setMode("partner");
      onConverted();
    } else {
      setError(d.error || "Errore durante la conversione");
    }
    setSaving(false);
  }

  function copyLink() {
    if (!inviteUrl) return;
    navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const inviteMessage = inviteUrl
    ? `Ciao ${prospect.nome.split(" ")[0]}! Ecco il link per registrarti: ${inviteUrl}`
    : "";

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center pt-8 md:pt-16 px-4 overflow-y-auto">
      <div className="bg-bg-card border border-border rounded-2xl w-full max-w-md shadow-xl mb-8">
        <div className="flex items-center justify-between p-5 border-b border-divider">
          <h3 className="text-lg font-bold text-text-primary">
            Converti {prospect.nome}
          </h3>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-bg-section flex items-center justify-center text-text-secondary transition-all">✕</button>
        </div>

        <div className="p-5 space-y-4">
          {error && <p className="text-sm text-coral">{error}</p>}

          {mode === "choose" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button onClick={() => setMode("cliente")} className="p-4 rounded-xl border border-border hover:border-accent hover:bg-accent-glow transition-all text-left">
                <div className="text-2xl mb-1">🛒</div>
                <div className="font-semibold text-sm text-text-primary">A Cliente</div>
                <div className="text-xs text-text-secondary">Crea una scheda cliente</div>
              </button>
              <button onClick={convertPartner} disabled={saving} className="p-4 rounded-xl border border-border hover:border-accent hover:bg-accent-glow transition-all text-left disabled:opacity-50">
                <div className="text-2xl mb-1">🤝</div>
                <div className="font-semibold text-sm text-text-primary">A Partner</div>
                <div className="text-xs text-text-secondary">Genera link di invito</div>
              </button>
            </div>
          )}

          {mode === "cliente" && (
            <form onSubmit={convertCliente} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-text-secondary mb-1 block">Nome *</label>
                  <input type="text" required value={custForm.nome} onChange={(e) => setCustForm({ ...custForm, nome: e.target.value })} className={inputClass} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-text-secondary mb-1 block">Cognome</label>
                  <input type="text" value={custForm.cognome} onChange={(e) => setCustForm({ ...custForm, cognome: e.target.value })} className={inputClass} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-text-secondary mb-1 block">Telefono</label>
                  <input type="tel" value={custForm.telefono} onChange={(e) => setCustForm({ ...custForm, telefono: e.target.value })} className={inputClass} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-text-secondary mb-1 block">Email</label>
                  <input type="email" value={custForm.email} onChange={(e) => setCustForm({ ...custForm, email: e.target.value })} className={inputClass} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-text-secondary mb-1 block">Indirizzo</label>
                  <input type="text" value={custForm.indirizzo} onChange={(e) => setCustForm({ ...custForm, indirizzo: e.target.value })} className={inputClass} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-text-secondary mb-1 block">Città</label>
                  <input type="text" value={custForm.citta} onChange={(e) => setCustForm({ ...custForm, citta: e.target.value })} className={inputClass} />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-divider">
                <button type="button" onClick={() => setMode("choose")} className="px-4 py-2 rounded-xl text-sm text-text-secondary hover:bg-bg-section transition-all">Indietro</button>
                <button type="submit" disabled={saving} className="px-5 py-2 rounded-xl text-sm font-semibold bg-accent text-white hover:bg-accent-hover transition-all disabled:opacity-50">
                  {saving ? "..." : "Crea cliente"}
                </button>
              </div>
            </form>
          )}

          {mode === "partner" && (
            <div className="space-y-3">
              {inviteUrl ? (
                <>
                  <p className="text-sm text-text-secondary">Condividi questo link con {prospect.nome.split(" ")[0]} per registrarsi come partner:</p>
                  <div className="flex gap-2">
                    <input readOnly value={inviteUrl} className={inputClass} />
                    <button onClick={copyLink} className="px-3 py-2 rounded-xl text-sm font-semibold bg-bg-section text-text-primary hover:bg-accent-glow transition-all shrink-0">
                      {copied ? "Copiato!" : "Copia"}
                    </button>
                  </div>
                  <div className="flex gap-2">
                    {prospect.email && (
                      <a href={buildMailto(prospect.email, "Il tuo link di registrazione", inviteMessage)} target="_blank" rel="noopener noreferrer" className="flex-1 text-center px-3 py-2 rounded-xl text-sm font-semibold bg-bg-section text-text-primary hover:bg-accent-glow transition-all">✉️ Email</a>
                    )}
                    {prospect.telefono && (
                      <a href={buildWhatsappUrl(prospect.telefono, inviteMessage)} target="_blank" rel="noopener noreferrer" className="flex-1 text-center px-3 py-2 rounded-xl text-sm font-semibold bg-[#25D366] text-white hover:opacity-90 transition-all">WhatsApp</a>
                    )}
                  </div>
                </>
              ) : (
                <p className="text-sm text-coral">Nessun link di invito disponibile. Imposta un codice Amway nel tuo profilo.</p>
              )}
              <div className="flex justify-end pt-2 border-t border-divider">
                <button type="button" onClick={onClose} className="px-5 py-2 rounded-xl text-sm font-semibold bg-accent text-white hover:bg-accent-hover transition-all">Fatto</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
