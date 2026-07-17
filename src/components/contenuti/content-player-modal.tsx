"use client";

import type { Contenuto } from "@/lib/types/contenuti";
import { toEmbeddableUrl } from "@/lib/contenuti/embed";
import { InlineMessage } from "@/components/ui/inline-message";

type Props = {
  contenuto: Contenuto;
  onClose: () => void;
};

export function ContentPlayerModal({ contenuto, onClose }: Props) {
  const hasSource = !!contenuto.url;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-bg-card border border-border rounded-2xl w-full max-w-2xl shadow-xl overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-divider">
          <h3 className="text-base font-bold text-text-primary truncate pr-2">{contenuto.titolo}</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-bg-section flex items-center justify-center text-text-secondary transition-all shrink-0">✕</button>
        </div>
        <div className="aspect-video bg-black flex items-center justify-center">
          {!hasSource ? (
            <div className="p-6"><InlineMessage variant="error">Contenuto non disponibile, riprova più tardi.</InlineMessage></div>
          ) : contenuto.media_tipo === "file" ? (
            <video src={contenuto.url} controls className="w-full h-full" />
          ) : (
            <iframe src={toEmbeddableUrl(contenuto.url)} className="w-full h-full" allow="autoplay; encrypted-media" allowFullScreen />
          )}
        </div>
        {contenuto.descrizione && (
          <p className="p-4 text-sm text-text-secondary">{contenuto.descrizione}</p>
        )}
      </div>
    </div>
  );
}
