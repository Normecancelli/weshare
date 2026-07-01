"use client";

import { useEffect, useState } from "react";
import { Mail, RotateCcw, Eye } from "lucide-react";
import { DEFAULT_EMAIL_TEMPLATE } from "@/lib/events/email";

export default function EmailTemplatePage() {
  const [template, setTemplate] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  useEffect(() => {
    fetch("/api/settings/email-template")
      .then((r) => r.json())
      .then((d) => {
        setTemplate(d.template || DEFAULT_EMAIL_TEMPLATE);
        setLoading(false);
      });
  }, []);

  async function handleSave() {
    setSaving(true);
    await fetch("/api/settings/email-template", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ template }),
    });
    setSaving(false);
    showToast("Template salvato!");
  }

  function handleReset() {
    if (!confirm("Ripristinare il template di default?")) return;
    setTemplate(DEFAULT_EMAIL_TEMPLATE);
  }

  if (loading) return <div className="p-6 text-text-secondary text-sm">Caricamento…</div>;

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-[#0B2545] text-white text-sm px-4 py-2 rounded-xl shadow-lg">
          {toast}
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Mail size={20} strokeWidth={1.75} className="text-accent" />
          <h1 className="text-xl font-bold text-text-primary">Template email reminder</h1>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setPreview((p) => !p)}
            className="flex items-center gap-1 text-sm text-text-secondary border border-border px-3 py-1.5 rounded-xl hover:bg-bg-section transition-colors"
          >
            <Eye size={14} strokeWidth={1.75} />
            {preview ? "Modifica" : "Anteprima"}
          </button>
          <button
            onClick={handleReset}
            className="flex items-center gap-1 text-sm text-text-secondary border border-border px-3 py-1.5 rounded-xl hover:bg-bg-section transition-colors"
          >
            <RotateCcw size={14} strokeWidth={1.75} /> Reset
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-accent hover:bg-accent-hover text-white text-sm font-semibold px-4 py-1.5 rounded-xl transition-colors disabled:opacity-50"
          >
            {saving ? "Salvataggio…" : "Salva"}
          </button>
        </div>
      </div>

      <div className="bg-bg-card rounded-2xl border border-divider p-5">
        <p className="text-xs text-text-secondary mb-4">
          Variabili disponibili: <code className="bg-bg-section px-1 rounded">{"{nome}"}</code>{" "}
          <code className="bg-bg-section px-1 rounded">{"{nome_evento}"}</code>{" "}
          <code className="bg-bg-section px-1 rounded">{"{data}"}</code>{" "}
          <code className="bg-bg-section px-1 rounded">{"{ora}"}</code>{" "}
          <code className="bg-bg-section px-1 rounded">{"{location}"}</code>{" "}
          <code className="bg-bg-section px-1 rounded">{"{link_evento}"}</code>{" "}
          <code className="bg-bg-section px-1 rounded">{"{locandina_url}"}</code>{" "}
          <code className="bg-bg-section px-1 rounded">{"{testo_reminder}"}</code>{" "}
          <code className="bg-bg-section px-1 rounded">{"{link_app}"}</code>
          {" | Blocchi condizionali: "}
          <code className="bg-bg-section px-1 rounded">{"{{#if var}}...{{/if}}"}</code>
        </p>

        {preview ? (
          <iframe
            srcDoc={template
              .replace(/{nome}/g, "Mario Rossi")
              .replace(/{nome_evento}/g, "Evento di Esempio")
              .replace(/{data}/g, "lunedì 15 luglio 2026")
              .replace(/{ora}/g, "19:00")
              .replace(/{location}/g, "Hotel Milano")
              .replace(/{link_app}/g, "https://weshare.growset.it/eventi/example")
              .replace(/\{\{#if \w+\}\}[\s\S]*?\{\{\/if\}\}/g, (m) =>
                m.includes("locandina_url") || m.includes("link_evento") ? "" : m
              )
            }
            className="w-full h-[600px] border-0 rounded-xl bg-[#F0F4F8]"
            title="Preview template"
          />
        ) : (
          <textarea
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
            className="w-full h-96 px-4 py-3 rounded-xl text-xs font-mono border border-border bg-bg-main focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent resize-y"
            spellCheck={false}
          />
        )}
      </div>
    </div>
  );
}
