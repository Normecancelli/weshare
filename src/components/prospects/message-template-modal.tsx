"use client";

import { useState } from "react";
import {
  EMAIL_TEMPLATES,
  WHATSAPP_TEMPLATES,
  fillTemplate,
} from "@/lib/prospects/templates";
import { buildMailto, buildWhatsappUrl } from "@/lib/prospects/links";

const inputClass =
  "w-full px-4 py-2.5 rounded-xl text-sm border border-border bg-bg-main focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent";

type Props = {
  prospectId: string;
  tipo: "email" | "whatsapp";
  nome: string;
  email: string | null;
  telefono: string | null;
  onSent: () => void;
  onClose: () => void;
};

export function MessageTemplateModal({
  prospectId,
  tipo,
  nome,
  email,
  telefono,
  onSent,
  onClose,
}: Props) {
  const templates = tipo === "email" ? EMAIL_TEMPLATES : WHATSAPP_TEMPLATES;
  const [templateId, setTemplateId] = useState(templates[0].id);
  const selected = templates.find((t) => t.id === templateId) || templates[0];

  const [subject, setSubject] = useState(
    tipo === "email" ? fillTemplate(EMAIL_TEMPLATES[0].subject, nome) : ""
  );
  const [bodyText, setBodyText] = useState(fillTemplate(selected.body, nome));
  const [sending, setSending] = useState(false);

  function selectTemplate(id: string) {
    setTemplateId(id);
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    setBodyText(fillTemplate(t.body, nome));
    if (tipo === "email" && "subject" in t) {
      setSubject(fillTemplate((t as { subject: string }).subject, nome));
    }
  }

  const missingTarget = tipo === "email" ? !email : !telefono;

  async function handleSend() {
    setSending(true);
    // Open the prefilled native-app link
    const url =
      tipo === "email"
        ? buildMailto(email || "", subject, bodyText)
        : buildWhatsappUrl(telefono || "", bodyText);
    window.open(url, "_blank");

    // Log the send (also advances the next reminder)
    await fetch(`/api/prospects/${prospectId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tipo, template_id: templateId }),
    });
    setSending(false);
    onSent();
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center pt-8 md:pt-16 px-4 overflow-y-auto">
      <div className="bg-bg-card border border-border rounded-2xl w-full max-w-lg shadow-xl mb-8">
        <div className="flex items-center justify-between p-5 border-b border-divider">
          <h3 className="text-lg font-bold text-text-primary">
            {tipo === "email" ? "Email a " : "WhatsApp a "} {nome}
          </h3>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-bg-section flex items-center justify-center text-text-secondary transition-all">✕</button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs font-semibold text-text-secondary mb-1 block">Template</label>
            <div className="flex flex-wrap gap-2">
              {templates.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => selectTemplate(t.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    templateId === t.id
                      ? "bg-accent text-white"
                      : "bg-bg-section text-text-secondary hover:text-text-primary"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {tipo === "email" && (
            <div>
              <label className="text-xs font-semibold text-text-secondary mb-1 block">Oggetto</label>
              <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} className={inputClass} />
            </div>
          )}

          <div>
            <label className="text-xs font-semibold text-text-secondary mb-1 block">Messaggio</label>
            <textarea value={bodyText} onChange={(e) => setBodyText(e.target.value)} rows={8} className={`${inputClass} resize-none`} />
          </div>

          {missingTarget && (
            <p className="text-xs text-coral">
              {tipo === "email"
                ? "Questo contatto non ha un'email."
                : "Questo contatto non ha un numero di telefono."}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-divider">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-text-secondary hover:bg-bg-section transition-all">Annulla</button>
            <button
              type="button"
              onClick={handleSend}
              disabled={sending || missingTarget}
              className="px-5 py-2 rounded-xl text-sm font-semibold bg-accent text-white hover:bg-accent-hover transition-all disabled:opacity-50"
            >
              {sending ? "..." : tipo === "email" ? "Apri email" : "Apri WhatsApp"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
