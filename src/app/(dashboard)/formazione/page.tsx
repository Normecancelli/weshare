"use client";

import { useEffect, useState, useCallback } from "react";
import { GraduationCap, Plus } from "lucide-react";
import { canCreateEvent } from "@/lib/auth/roles";
import type { Contenuto } from "@/lib/types/contenuti";
import { ContenutiGrid } from "@/components/contenuti/contenuti-grid";
import { ContentPlayerModal } from "@/components/contenuti/content-player-modal";
import { ContenutoFormModal } from "@/components/contenuti/contenuto-form-modal";

export default function FormazionePage() {
  const [contenuti, setContenuti] = useState<Contenuto[]>([]);
  const [temi, setTemi] = useState<string[]>([]);
  const [selectedTema, setSelectedTema] = useState("");
  const [canManage, setCanManage] = useState(false);
  const [playing, setPlaying] = useState<Contenuto | null>(null);
  const [editing, setEditing] = useState<Contenuto | null>(null);
  const [showForm, setShowForm] = useState(false);

  const fetchAll = useCallback(async () => {
    const qs = selectedTema ? `?tipo=formazione&tema=${encodeURIComponent(selectedTema)}` : "?tipo=formazione";
    const [cRes, tRes] = await Promise.all([
      fetch(`/api/contenuti${qs}`),
      fetch("/api/contenuti/temi?tipo=formazione"),
    ]);
    setContenuti((await cRes.json()).contenuti || []);
    setTemi((await tRes.json()).temi || []);
  }, [selectedTema]);

  useEffect(() => {
    fetch("/api/auth/me").then((r) => r.json()).then((d) => setCanManage(canCreateEvent(d.ruolo, d.qualifica))).catch(() => {});
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  async function handleDelete(c: Contenuto) {
    if (!confirm(`Eliminare "${c.titolo}"?`)) return;
    await fetch(`/api/contenuti/${c.id}`, { method: "DELETE" });
    fetchAll();
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <GraduationCap size={22} strokeWidth={1.75} className="text-accent" />
          <h1 className="text-xl font-bold text-text-primary">Formazione</h1>
        </div>
        {canManage && (
          <button onClick={() => { setEditing(null); setShowForm(true); }} className="flex items-center gap-2 bg-accent hover:bg-accent-hover text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors">
            <Plus size={16} strokeWidth={2} /> Nuovo contenuto
          </button>
        )}
      </div>

      <ContenutiGrid
        contenuti={contenuti}
        temi={temi}
        selectedTema={selectedTema}
        onTemaChange={setSelectedTema}
        onOpen={setPlaying}
        canManage={canManage}
        onEdit={(c) => { setEditing(c); setShowForm(true); }}
        onDelete={handleDelete}
      />

      {playing && <ContentPlayerModal contenuto={playing} onClose={() => setPlaying(null)} />}
      {showForm && (
        <ContenutoFormModal
          tipo="formazione"
          contenuto={editing}
          onSaved={fetchAll}
          onClose={() => setShowForm(false)}
        />
      )}
    </div>
  );
}
