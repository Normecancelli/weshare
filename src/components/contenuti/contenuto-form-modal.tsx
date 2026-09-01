"use client";

import { useEffect, useState } from "react";
import type { Contenuto, ContenutoMediaTipo, ContenutoTipo, TemaIcona } from "@/lib/types/contenuti";
import { UPLOAD_LIMIT_MB } from "@/lib/types/contenuti";
import { InlineMessage } from "@/components/ui/inline-message";
import { ICONE_TEMA_DISPONIBILI, type IconaTema } from "@/lib/contenuti/icone-temi";
import { IconaTemaIcon } from "@/components/contenuti/icona-tema-icon";
import { createClient } from "@/lib/supabase/client";

const inputClass =
  "w-full px-4 py-2.5 rounded-xl text-sm border border-border bg-bg-main focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent";

type Props = {
  tipo: ContenutoTipo;
  contenuto: Contenuto | null;
  onSaved: () => void;
  onClose: () => void;
};

export function ContenutoFormModal({ tipo, contenuto, onSaved, onClose }: Props) {
  const isEdit = !!contenuto;
  const [titolo, setTitolo] = useState(contenuto?.titolo || "");
  const [descrizione, setDescrizione] = useState(contenuto?.descrizione || "");
  const [tema, setTema] = useState(contenuto?.tema || "");
  const [temiSuggeriti, setTemiSuggeriti] = useState<TemaIcona[]>([]);
  const [icona, setIcona] = useState<IconaTema | null>(null);
  const [mediaTipo, setMediaTipo] = useState<ContenutoMediaTipo>(contenuto?.media_tipo || "link_esterno");
  const [urlEsterno, setUrlEsterno] = useState(contenuto?.url_esterno || "");
  const [filePath, setFilePath] = useState(contenuto?.file_path || "");
  const [visibileProspect, setVisibileProspect] = useState(contenuto?.visibile_prospect || false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/contenuti/temi?tipo=${tipo}`)
      .then((r) => r.json())
      .then((d) => setTemiSuggeriti(d.temi || []))
      .catch(() => {});
  }, [tipo]);

  useEffect(() => {
    const match = temiSuggeriti.find((t) => t.tema === tema.trim());
    setIcona(match ? (match.icona as IconaTema) : null);
  }, [tema, temiSuggeriti]);

  async function handleUpload(file: File) {
    setError("");
    setUploading(true);
    try {
      const urlRes = await fetch("/api/contenuti/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo, mimeType: file.type, size: file.size }),
      });
      if (!urlRes.ok) {
        const d = await urlRes.json().catch(() => ({}));
        setError(d.error || "Errore durante il caricamento");
        return;
      }
      const { path, token } = await urlRes.json();

      const supabase = createClient();
      const { error: uploadError } = await supabase.storage
        .from("contenuti")
        .uploadToSignedUrl(path, token, file);

      if (uploadError) {
        setError(uploadError.message || "Errore durante il caricamento");
        return;
      }
      setFilePath(path);
    } catch {
      setError("Errore durante il caricamento — riprova");
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!titolo.trim()) { setError("Il titolo è obbligatorio"); return; }
    if (mediaTipo === "link_esterno" && !urlEsterno.trim()) { setError("Inserisci un URL"); return; }
    if (mediaTipo === "file" && !filePath) { setError("Carica un file prima di salvare"); return; }
    if (tema.trim() && !icona) { setError("Scegli un'icona per il tema"); return; }

    setSaving(true);

    if (tema.trim() && icona) {
      const iconRes = await fetch(`/api/contenuti/temi/${encodeURIComponent(tema.trim())}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ icona }),
      });
      if (!iconRes.ok) {
        const d = await iconRes.json();
        setError(d.error || "Errore durante il salvataggio dell'icona tema");
        setSaving(false);
        return;
      }
    }

    const body = {
      tipo, titolo, descrizione, tema, media_tipo: mediaTipo,
      url_esterno: mediaTipo === "link_esterno" ? urlEsterno : null,
      file_path: mediaTipo === "file" ? filePath : null,
      visibile_prospect: visibileProspect,
    };
    const res = await fetch(isEdit ? `/api/contenuti/${contenuto!.id}` : "/api/contenuti", {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      onSaved();
      onClose();
    } else {
      const d = await res.json();
      setError(d.error || "Errore durante il salvataggio");
    }
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center pt-8 md:pt-16 px-4 overflow-y-auto">
      <div className="bg-bg-card border border-border rounded-2xl w-full max-w-lg shadow-xl mb-8">
        <div className="flex items-center justify-between p-5 border-b border-divider">
          <h3 className="text-lg font-bold text-text-primary">{isEdit ? "Modifica contenuto" : "Nuovo contenuto"}</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-bg-section flex items-center justify-center text-text-secondary transition-all">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-3">
          {error && <InlineMessage variant="error">{error}</InlineMessage>}

          <div>
            <label className="text-xs font-semibold text-text-secondary mb-1 block">Titolo *</label>
            <input type="text" value={titolo} onChange={(e) => setTitolo(e.target.value)} className={inputClass} />
          </div>

          <div>
            <label className="text-xs font-semibold text-text-secondary mb-1 block">Descrizione</label>
            <textarea value={descrizione} onChange={(e) => setDescrizione(e.target.value)} rows={2} className={`${inputClass} resize-none`} />
          </div>

          <div>
            <label className="text-xs font-semibold text-text-secondary mb-1 block">Tema</label>
            <input
              type="text"
              list="temi-suggeriti"
              value={tema}
              onChange={(e) => setTema(e.target.value)}
              placeholder="es. prodotto, business, evento..."
              className={inputClass}
            />
            <datalist id="temi-suggeriti">
              {temiSuggeriti.map((t) => <option key={t.tema} value={t.tema} />)}
            </datalist>
          </div>

          {tema.trim() && (
            <div>
              <label className="text-xs font-semibold text-text-secondary mb-1 block">Icona tema *</label>
              <div className="grid grid-cols-6 gap-2">
                {ICONE_TEMA_DISPONIBILI.map((n) => (
                  <button
                    type="button"
                    key={n}
                    onClick={() => setIcona(n)}
                    className={`aspect-square rounded-xl border flex items-center justify-center transition-all ${icona === n ? "border-accent bg-accent-glow text-accent" : "border-border text-text-secondary hover:border-accent/50"}`}
                  >
                    <IconaTemaIcon nome={n} size={18} />
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <button type="button" onClick={() => setMediaTipo("link_esterno")} className={`flex-1 py-2 rounded-xl text-sm font-semibold border transition-all ${mediaTipo === "link_esterno" ? "border-accent bg-accent-glow text-accent" : "border-border text-text-secondary"}`}>Link esterno</button>
            <button type="button" onClick={() => setMediaTipo("file")} className={`flex-1 py-2 rounded-xl text-sm font-semibold border transition-all ${mediaTipo === "file" ? "border-accent bg-accent-glow text-accent" : "border-border text-text-secondary"}`}>File</button>
          </div>

          {mediaTipo === "link_esterno" ? (
            <div>
              <label className="text-xs font-semibold text-text-secondary mb-1 block">URL (YouTube, Drive, PDF pubblico)</label>
              <input type="url" value={urlEsterno} onChange={(e) => setUrlEsterno(e.target.value)} className={inputClass} placeholder="https://..." />
            </div>
          ) : (
            <div>
              <label className="text-xs font-semibold text-text-secondary mb-1 block">File (max {UPLOAD_LIMIT_MB[tipo]}MB)</label>
              {tipo === "presentazione" && (
                <p className="text-xs text-text-gentle mb-2">Preferisci un link Drive/YouTube per file pesanti.</p>
              )}
              <input
                type="file"
                accept="video/mp4,video/webm,application/pdf,audio/mpeg,audio/mp4,audio/wav,audio/ogg"
                onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])}
                className="text-sm"
              />
              {uploading && <p className="text-xs text-text-secondary mt-1">Caricamento...</p>}
              {filePath && !uploading && <p className="text-xs text-success mt-1">File caricato ✓</p>}
            </div>
          )}

          <label className="flex items-center gap-2 text-sm text-text-primary pt-2">
            <input type="checkbox" checked={visibileProspect} onChange={(e) => setVisibileProspect(e.target.checked)} />
            Visibile anche nella vetrina prospect
          </label>

          <div className="flex justify-end gap-2 pt-3 border-t border-divider">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-text-secondary hover:bg-bg-section transition-all">Annulla</button>
            <button type="submit" disabled={saving || uploading} className="px-5 py-2 rounded-xl text-sm font-semibold bg-accent text-white hover:bg-accent-hover transition-all disabled:opacity-50">
              {saving ? "..." : "Salva"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
