"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  type Prospect,
  type FollowUpFlag,
  SUB_TAG_LABELS,
  FOLLOW_UP_FLAG_LABELS,
} from "@/lib/types/prospects";
import { MessageTemplateModal } from "@/components/prospects/message-template-modal";

const FLAGS: FollowUpFlag[] = ["da_valutare", "inviare", "non_inviare", "sospeso"];

export default function FollowUpPage() {
  const router = useRouter();
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [loading, setLoading] = useState(true);
  const [msgTarget, setMsgTarget] = useState<{ p: Prospect; tipo: "email" | "whatsapp" } | null>(null);

  const fetchFollowUps = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/prospects?stato=follow_up");
    const data = await res.json();
    setProspects(data.prospects || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchFollowUps();
  }, [fetchFollowUps]);

  async function setFlag(p: Prospect, flag: FollowUpFlag) {
    setProspects((prev) =>
      prev.map((x) => (x.id === p.id ? { ...x, follow_up_flag: flag } : x))
    );
    await fetch(`/api/prospects/${p.id}/follow-up`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ follow_up_flag: flag }),
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-10 h-10 border-3 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <button onClick={() => router.push("/contatti")} className="text-sm text-text-secondary hover:text-text-primary mb-4 transition-colors">
        ← Contatti
      </button>

      <div className="mb-6">
        <h2 className="text-2xl font-bold tracking-tight">Follow-up</h2>
        <p className="text-text-secondary text-sm mt-1">
          {prospects.length} contatti da mantenere
        </p>
      </div>

      {prospects.length === 0 ? (
        <div className="text-center py-12 text-text-secondary text-sm">
          Nessun contatto in follow-up. Imposta lo stato &quot;Follow-up&quot; su un contatto per vederlo qui.
        </div>
      ) : (
        <div className="space-y-3">
          {prospects.map((p) => (
            <div key={p.id} className="bg-bg-card border border-border rounded-xl p-4 flex flex-col md:flex-row md:items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm text-text-primary">{p.nome}</div>
                <div className="text-xs text-text-secondary flex flex-wrap gap-x-3">
                  {p.sub_tag_follow_up && (
                    <span>{p.sub_tag_follow_up === "custom" ? p.sub_tag_custom : SUB_TAG_LABELS[p.sub_tag_follow_up]}</span>
                  )}
                  {p.prossima_data_reminder && (
                    <span>Prossima: {new Date(p.prossima_data_reminder).toLocaleDateString("it-IT")}</span>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-1">
                {FLAGS.map((f) => (
                  <button
                    key={f}
                    onClick={() => setFlag(p, f)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                      p.follow_up_flag === f
                        ? "bg-accent text-white"
                        : "bg-bg-section text-text-secondary hover:text-text-primary"
                    }`}
                  >
                    {FOLLOW_UP_FLAG_LABELS[f]}
                  </button>
                ))}
              </div>

              <div className="flex gap-2 shrink-0">
                <button onClick={() => setMsgTarget({ p, tipo: "email" })} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-bg-section text-text-primary hover:bg-accent-glow transition-all">Email</button>
                <button onClick={() => setMsgTarget({ p, tipo: "whatsapp" })} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#25D366] text-white hover:opacity-90 transition-all">WhatsApp</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {msgTarget && (
        <MessageTemplateModal
          prospectId={msgTarget.p.id}
          tipo={msgTarget.tipo}
          nome={msgTarget.p.nome}
          email={msgTarget.p.email}
          telefono={msgTarget.p.telefono}
          onSent={fetchFollowUps}
          onClose={() => setMsgTarget(null)}
        />
      )}
    </div>
  );
}
