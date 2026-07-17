"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Calendar, MapPin } from "lucide-react";
import type { Evento } from "@/lib/types/events";
import type { Contenuto, TemaIcona } from "@/lib/types/contenuti";
import { ContenutiGrid } from "@/components/contenuti/contenuti-grid";
import { ContentPlayerModal } from "@/components/contenuti/content-player-modal";
import { InlineMessage } from "@/components/ui/inline-message";
import { buildWhatsappUrl } from "@/lib/prospects/links";

interface VetrinaData {
  partnerNome: string;
  partnerTelefono: string | null;
  eventi: Evento[];
  contenuti: Contenuto[];
  temi: TemaIcona[];
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("it-IT", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export default function AnteprimaPage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<VetrinaData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedTema, setSelectedTema] = useState("");
  const [playing, setPlaying] = useState<Contenuto | null>(null);

  useEffect(() => {
    fetch(`/api/anteprima/${token}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) { setError(d.error || "Link non valido"); return; }
        setData(d);
      })
      .catch(() => setError("Errore di caricamento. Riprova più tardi."))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-screen">
        <div className="w-10 h-10 border-3 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex-1 flex items-center justify-center bg-bg-main px-4 min-h-screen">
        <div className="w-full max-w-md text-center bg-bg-card border border-border rounded-2xl p-8">
          <InlineMessage variant="warning">{error || "Link non più valido, contatta chi te l'ha inviato."}</InlineMessage>
        </div>
      </div>
    );
  }

  const contenutiFiltrati = selectedTema ? data.contenuti.filter((c) => c.tema === selectedTema) : data.contenuti;

  const waMessage = `Ciao ${data.partnerNome.split(" ")[0]}, ho visto la tua pagina e sono interessato!`;

  return (
    <div className="min-h-screen bg-bg-main pb-24">
      <div className="bg-gradient-to-br from-accent-glow to-coral-soft p-8 text-center border-b border-divider">
        <p className="text-xs uppercase tracking-wide text-text-secondary mb-2">Ti ha invitato</p>
        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-accent to-accent-hover flex items-center justify-center text-white text-xl font-bold mx-auto mb-3">
          {data.partnerNome.split(/\s+/).map((p) => p[0]?.toUpperCase() || "").join("").slice(0, 2)}
        </div>
        <div className="text-lg font-bold text-text-primary">{data.partnerNome}</div>
      </div>

      <div className="max-w-3xl mx-auto p-4 md:p-6 space-y-8">
        {data.eventi.length > 0 && (
          <section>
            <h2 className="text-sm font-bold uppercase tracking-wide text-text-secondary mb-3">Prossimi eventi</h2>
            <div className="space-y-3">
              {data.eventi.map((e) => (
                <div key={e.id} className="bg-bg-card border border-border rounded-2xl p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Calendar size={14} strokeWidth={1.75} className="text-accent" />
                    <p className="font-semibold text-sm text-text-primary">{e.nome}</p>
                  </div>
                  <p className="text-xs text-text-secondary">{formatDate(e.data_inizio)}</p>
                  {e.location && (
                    <p className="text-xs text-text-secondary flex items-center gap-1 mt-1">
                      <MapPin size={12} strokeWidth={1.75} /> {e.location}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {data.contenuti.length > 0 && (
          <section>
            <h2 className="text-sm font-bold uppercase tracking-wide text-text-secondary mb-3">Formazione e presentazioni</h2>
            <ContenutiGrid
              contenuti={contenutiFiltrati}
              temi={data.temi}
              selectedTema={selectedTema}
              onTemaChange={setSelectedTema}
              onOpen={setPlaying}
              canManage={false}
              onEdit={() => {}}
              onDelete={() => {}}
            />
          </section>
        )}
      </div>

      {data.partnerTelefono && (
        <a
          href={buildWhatsappUrl(data.partnerTelefono, waMessage)}
          target="_blank"
          rel="noopener noreferrer"
          className="fixed bottom-4 left-4 right-4 max-w-md mx-auto py-3.5 rounded-xl text-sm font-semibold bg-[#25D366] text-white text-center shadow-lg hover:opacity-90 transition-all"
        >
          Scrivimi su WhatsApp
        </a>
      )}

      {playing && <ContentPlayerModal contenuto={playing} onClose={() => setPlaying(null)} />}
    </div>
  );
}
