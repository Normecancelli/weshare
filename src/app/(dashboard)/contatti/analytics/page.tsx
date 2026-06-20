"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  type ProspectAnalytics,
  type ProspectStato,
  STATO_LABELS,
} from "@/lib/types/prospects";
import { StatCard } from "@/components/ui/stat-card";

const PIPELINE_ORDER: ProspectStato[] = [
  "nuovo_contatto",
  "primo_appt",
  "secondo_appt",
  "follow_up",
  "convertito_cliente",
  "convertito_partner",
];

export default function AnalyticsPage() {
  const router = useRouter();
  const [data, setData] = useState<ProspectAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  async function fetchAnalytics() {
    setLoading(true);
    const res = await fetch("/api/prospects/analytics");
    const d = await res.json();
    setData(d);
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchAnalytics();
  }, []);

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-10 h-10 border-3 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const maxCount = Math.max(1, ...PIPELINE_ORDER.map((s) => data.pipeline[s]));
  const trend =
    data.conversione.convertiti_questo_mese - data.conversione.convertiti_mese_scorso;

  return (
    <div>
      <button onClick={() => router.push("/contatti")} className="text-sm text-text-secondary hover:text-text-primary mb-4 transition-colors">
        ← Contatti
      </button>

      <div className="mb-6">
        <h2 className="text-2xl font-bold tracking-tight">Analytics pipeline</h2>
        <p className="text-text-secondary text-sm mt-1">{data.totale} contatti totali</p>
      </div>

      {/* Pipeline bars */}
      <div className="bg-bg-card border border-border rounded-2xl p-5 mb-6">
        <h3 className="text-sm font-bold uppercase tracking-wide text-text-secondary mb-4">Pipeline</h3>
        <div className="space-y-3">
          {PIPELINE_ORDER.map((s) => (
            <div key={s} className="flex items-center gap-3">
              <div className="w-40 text-sm text-text-secondary shrink-0">{STATO_LABELS[s]}</div>
              <div className="flex-1 bg-bg-section rounded-lg h-7 overflow-hidden">
                <div
                  className="h-full bg-accent rounded-lg flex items-center justify-end px-2"
                  style={{ width: `${(data.pipeline[s] / maxCount) * 100}%` }}
                >
                  {data.pipeline[s] > 0 && (
                    <span className="text-xs font-bold text-white">{data.pipeline[s]}</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Conversion metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Conversione cliente"
          value={`${data.conversione.cliente_percent}%`}
          subtitle={`${data.conversione.cliente} su ${data.totale}`}
          color="success"
        />
        <StatCard
          label="Conversione partner"
          value={`${data.conversione.partner_percent}%`}
          subtitle={`${data.conversione.partner} su ${data.totale}`}
          color="accent"
        />
        <StatCard
          label="Tempo medio conversione"
          value={data.conversione.tempo_medio_giorni !== null ? `${data.conversione.tempo_medio_giorni}g` : "—"}
          subtitle="da contatto a conversione"
          color="lavender"
        />
        <StatCard
          label="Convertiti questo mese"
          value={data.conversione.convertiti_questo_mese}
          trend={{ value: trend, label: "vs mese scorso" }}
          color="coral"
        />
      </div>
    </div>
  );
}
