"use client";

import type { Contenuto, TemaIcona } from "@/lib/types/contenuti";
import { IconaTemaIcon } from "@/components/contenuti/icona-tema-icon";

type Props = {
  contenuti: Contenuto[];
  temi: TemaIcona[];
  selectedTema: string;
  onTemaChange: (tema: string) => void;
  onOpen: (contenuto: Contenuto) => void;
  canManage: boolean;
  onEdit: (contenuto: Contenuto) => void;
  onDelete: (contenuto: Contenuto) => void;
};

export function ContenutiGrid({ contenuti, temi, selectedTema, onTemaChange, onOpen, canManage, onEdit, onDelete }: Props) {
  const iconaPerTema = new Map(temi.map((t) => [t.tema, t.icona]));

  return (
    <div>
      {temi.length > 0 && (
        <select
          value={selectedTema}
          onChange={(e) => onTemaChange(e.target.value)}
          className="mb-4 px-3 py-2 rounded-xl text-sm border border-border bg-bg-main"
        >
          <option value="">Tutti i temi</option>
          {temi.map((t) => <option key={t.tema} value={t.tema}>{t.tema}</option>)}
        </select>
      )}

      {contenuti.length === 0 ? (
        <p className="text-sm text-text-secondary py-8 text-center">Nessun contenuto disponibile.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {contenuti.map((c) => (
            <div key={c.id} className="bg-bg-card border border-border rounded-2xl p-4 flex flex-col">
              <button onClick={() => onOpen(c)} className="text-left flex-1">
                <p className="font-semibold text-sm text-text-primary mb-1">{c.titolo}</p>
                {c.descrizione && <p className="text-xs text-text-secondary line-clamp-2 mb-2">{c.descrizione}</p>}
                <div className="flex items-center gap-2 flex-wrap">
                  {c.tema && (
                    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-bg-section text-text-secondary">
                      <IconaTemaIcon nome={iconaPerTema.get(c.tema) || ""} size={12} />
                      {c.tema}
                    </span>
                  )}
                  <span className="text-xs px-2 py-0.5 rounded-full bg-accent-glow text-accent">{c.media_tipo === "file" ? "File" : "Link"}</span>
                </div>
              </button>
              {canManage && (
                <div className="flex gap-2 mt-3 pt-3 border-t border-divider">
                  <button onClick={() => onEdit(c)} className="text-xs font-semibold text-accent hover:opacity-70">Modifica</button>
                  <button onClick={() => onDelete(c)} className="text-xs font-semibold text-error hover:opacity-70">Elimina</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
