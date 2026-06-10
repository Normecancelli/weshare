"use client";

import { useEffect, useState } from "react";
import { PromemoriaPanel } from "@/components/promemoria-panel";

interface DashboardData {
  meseCorrente: string;
  meseCorrenteLabel: string;
  mesePrecedente: string | null;
  mesePrecedenteLabel: string | null;
  stats: {
    vpg: number;
    vpgPrev: number;
    vpgTrend: number | null;
    vpp: number;
    bonusPerc: number;
    teamTotale: number;
    teamAttivo: number;
    teamAttivoTrend: number;
    ordini: number;
    ordiniTrend: number | null;
    clienti: number;
    dimensioniGruppo: number;
    puntiLivelloSuccessivo: number;
  };
  topDownline: {
    nome: string;
    codice: string;
    vpg: number;
    vpp: number;
    bonus: number;
    dimensioni_gruppo: number;
  }[];
  trend: { mese: string; vpg: number }[];
}

const gradients = [
  "from-accent to-accent-hover",
  "from-coral to-lavender",
  "from-lavender to-[#8B79B3]",
  "from-success to-[#5A9E7E]",
  "from-accent to-coral",
];

const badgeColors = [
  { bg: "bg-accent-glow", text: "text-accent-hover" },
  { bg: "bg-coral-soft", text: "text-coral" },
  { bg: "bg-lavender-soft", text: "text-lavender" },
  { bg: "bg-[#E8F5EE]", text: "text-success" },
  { bg: "bg-bg-section", text: "text-text-secondary" },
];

function formatNumber(n: number): string {
  return n.toLocaleString("it-IT", { maximumFractionDigits: 0 });
}

function formatCurrency(n: number): string {
  return n.toLocaleString("it-IT", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  });
}

function getInitials(nome: string): string {
  if (!nome) return "??";
  const parts = nome.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return nome.slice(0, 2).toUpperCase();
}

function trendLabel(value: number | null, suffix = "%"): string {
  if (value === null || value === undefined) return "";
  const sign = value > 0 ? "+" : value < 0 ? "" : "";
  return `${sign}${value}${suffix}`;
}

function trendArrow(value: number | null): string {
  if (value === null || value === undefined) return "";
  return value > 0 ? "↑" : value < 0 ? "↓" : "";
}

export function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/dashboard")
      .then((res) => res.json())
      .then((json) => {
        if (json.empty) {
          setData(null);
        } else if (json.error) {
          setError(json.error);
        } else {
          setData(json);
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-3 border-accent border-t-transparent rounded-full animate-spin" />
          <p className="text-text-secondary text-sm">
            Caricamento dashboard...
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="bg-coral-soft border border-coral rounded-2xl p-6 max-w-md text-center">
          <p className="text-coral font-semibold mb-1">Errore</p>
          <p className="text-text-secondary text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div>
        <div className="mb-6">
          <h2 className="text-2xl font-bold tracking-tight">Buongiorno, Alejerry</h2>
          <p className="text-text-secondary text-sm mt-1">
            Importa un file Excel Amway per vedere i tuoi dati mensili.
          </p>
        </div>
        <div className="mb-6">
          <PromemoriaPanel />
        </div>
        <div className="bg-bg-card border border-border rounded-2xl p-6 text-center">
          <p className="text-2xl mb-2">📊</p>
          <p className="font-semibold text-text-primary mb-2">Dati mensili non ancora importati</p>
          <a
            href="/import"
            className="inline-block px-5 py-2.5 rounded-xl text-sm font-semibold bg-accent text-white hover:bg-accent-hover transition-all"
          >
            Vai all&apos;importazione
          </a>
        </div>
      </div>
    );
  }

  const { stats, topDownline, trend } = data;

  const statCards = [
    {
      label: "VPG",
      value: formatCurrency(stats.vpg),
      trend:
        stats.vpgTrend !== null
          ? `${trendArrow(stats.vpgTrend)} ${trendLabel(stats.vpgTrend)} vs. mese prec.`
          : "Nessun confronto",
      trendUp: stats.vpgTrend !== null && stats.vpgTrend > 0,
      accent: "border-t-3 border-accent",
    },
    {
      label: "Team attivo",
      value: `${stats.teamAttivo} / ${stats.teamTotale}`,
      trend:
        stats.teamAttivoTrend !== 0
          ? `${trendArrow(stats.teamAttivoTrend)} ${trendLabel(stats.teamAttivoTrend, "")} vs. mese prec.`
          : "Stabile",
      trendUp: stats.teamAttivoTrend > 0,
      accent: "border-t-3 border-coral bg-coral-soft",
    },
    {
      label: "Clienti",
      value: String(stats.clienti),
      trend: `Bonus: ${stats.bonusPerc}%`,
      trendUp: stats.bonusPerc > 0,
      accent: "border-t-3 border-lavender",
    },
    {
      label: "Ordini totali",
      value: formatNumber(stats.ordini),
      trend:
        stats.ordiniTrend !== null
          ? `${trendArrow(stats.ordiniTrend)} ${trendLabel(stats.ordiniTrend)} vs. mese prec.`
          : "Nessun confronto",
      trendUp: stats.ordiniTrend !== null && stats.ordiniTrend > 0,
      accent: "border-t-3 border-success",
    },
  ];

  // VPG trend mini-chart
  const maxVpg = Math.max(...trend.map((t) => t.vpg), 1);

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4 mb-6 md:mb-8">
        <div className="flex items-start gap-3 md:gap-0 md:block">
          <div className="md:hidden w-10 h-10 rounded-full bg-gradient-to-br from-coral to-lavender flex items-center justify-center text-white font-semibold text-sm shrink-0">
            AS
          </div>
          <div>
            <h2 className="text-xl md:text-2xl font-bold tracking-tight">
              Buongiorno, Alejerry
            </h2>
            <p className="text-text-secondary text-xs md:text-sm mt-0.5 md:mt-1">
              Dati aggiornati a{" "}
              <span className="font-semibold">{data.meseCorrenteLabel}</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 md:gap-4">
          <button className="flex-1 md:flex-none px-3 md:px-5 py-2 md:py-2.5 rounded-xl text-xs md:text-sm font-medium border border-border text-text-secondary hover:border-accent hover:text-accent transition-all">
            Genera invito
          </button>
          <button className="flex-1 md:flex-none px-3 md:px-5 py-2 md:py-2.5 rounded-xl text-xs md:text-sm font-semibold bg-accent text-white hover:bg-accent-hover transition-all">
            + Nuovo contatto
          </button>
          <div className="hidden md:flex w-10 h-10 rounded-full bg-gradient-to-br from-coral to-lavender items-center justify-center text-white font-semibold text-sm">
            AS
          </div>
        </div>
      </div>

      {/* Promemoria */}
      <div className="mb-8">
        <PromemoriaPanel />
      </div>

      {/* Progress toward next level */}
      {stats.puntiLivelloSuccessivo > 0 && (
        <div className="bg-gradient-to-r from-accent-glow to-coral-soft rounded-2xl p-4 md:p-6 mb-6 md:mb-8 border border-border">
          <h3 className="text-sm font-semibold">Progresso VPG</h3>
          <p className="text-xs text-text-secondary mb-3 md:mb-4">
            Volume Punti Gruppo &middot; {data.meseCorrenteLabel}
          </p>
          <div className="h-2.5 bg-white/60 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-accent to-coral rounded-full transition-all duration-1000"
              style={{
                width: `${Math.min(
                  (stats.vpg / (stats.vpg + stats.puntiLivelloSuccessivo)) *
                    100,
                  100
                )}%`,
              }}
            />
          </div>
          <div className="flex justify-between mt-2 text-xs text-text-secondary">
            <span>{formatCurrency(stats.vpg)} VPG attuali</span>
            <span className="font-semibold text-accent-hover">
              {formatCurrency(stats.vpg + stats.puntiLivelloSuccessivo)} prossimo
              livello
            </span>
          </div>
        </div>
      )}

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-5 mb-6 md:mb-8">
        {statCards.map((stat) => (
          <div
            key={stat.label}
            className={`bg-bg-card border border-border rounded-2xl p-4 md:p-5 hover:shadow-md transition-all ${stat.accent}`}
          >
            <div className="text-xs md:text-[13px] text-text-secondary font-medium mb-1.5 md:mb-2">
              {stat.label}
            </div>
            <div className="text-2xl xl:text-3xl font-bold tracking-tight mb-1.5 md:mb-2 whitespace-nowrap">
              {stat.value}
            </div>
            <div
              className={`text-[11px] md:text-xs font-semibold ${stat.trendUp ? "text-success" : "text-text-secondary"}`}
            >
              {stat.trend}
            </div>
          </div>
        ))}
      </div>

      {/* Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4 md:gap-6">
        {/* Left: Top Downline */}
        <div className="bg-bg-card border border-border rounded-2xl p-4 md:p-6">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 sm:gap-2 mb-4 md:mb-5">
            <h3 className="font-semibold">Top Downline diretti</h3>
            <span className="text-xs text-text-secondary">
              per VPG &middot; {data.meseCorrenteLabel}
            </span>
          </div>
          {topDownline.length === 0 ? (
            <p className="text-text-secondary text-sm py-4 text-center">
              Nessun downline diretto trovato
            </p>
          ) : (
            topDownline.map((member, i) => (
              <div
                key={member.codice}
                className="flex items-center gap-3.5 py-3.5 border-b border-divider last:border-b-0"
              >
                <div
                  className={`w-10 h-10 rounded-full bg-gradient-to-br ${gradients[i % gradients.length]} flex items-center justify-center text-white font-semibold text-sm shrink-0`}
                >
                  {getInitials(member.nome)}
                </div>
                <div className="flex-1">
                  <div className="text-sm font-semibold">
                    {member.nome || member.codice}
                  </div>
                  <div className="text-xs text-text-secondary">
                    VPP {formatCurrency(member.vpp)} &middot; Gruppo{" "}
                    {member.dimensioni_gruppo}
                  </div>
                </div>
                <div className="text-right">
                  <span
                    className={`px-3 py-1 rounded-full text-[11px] font-semibold ${badgeColors[i % badgeColors.length].bg} ${badgeColors[i % badgeColors.length].text}`}
                  >
                    {formatCurrency(member.vpg)} VPG
                  </span>
                  {member.bonus > 0 && (
                    <div className="text-[11px] text-text-secondary mt-1">
                      Bonus {member.bonus}%
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Right: VPG Trend */}
        <div className="bg-bg-card border border-border rounded-2xl p-4 md:p-6">
          <div className="flex justify-between items-center mb-4 md:mb-5">
            <h3 className="font-semibold">Andamento VPG</h3>
          </div>
          {trend.length === 0 ? (
            <p className="text-text-secondary text-sm py-4 text-center">
              Importa pi&ugrave; mesi per vedere l&apos;andamento
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {trend.map((t) => (
                <div key={t.mese} className="flex items-center gap-3">
                  <span className="text-xs text-text-secondary w-16 shrink-0">
                    {t.mese}
                  </span>
                  <div className="flex-1 h-6 bg-bg-section rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-accent to-accent-hover rounded-full transition-all duration-500 flex items-center justify-end pr-2"
                      style={{
                        width: `${Math.max((t.vpg / maxVpg) * 100, 8)}%`,
                      }}
                    >
                      <span className="text-[10px] font-semibold text-white whitespace-nowrap">
                        {formatNumber(t.vpg)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* VPP Summary */}
          <div className="mt-6 pt-4 border-t border-divider">
            <div className="flex justify-between text-xs text-text-secondary mb-2">
              <span>VPP personali</span>
              <span className="font-semibold text-text-primary">
                {formatCurrency(stats.vpp)}
              </span>
            </div>
            <div className="flex justify-between text-xs text-text-secondary mb-2">
              <span>Bonus %</span>
              <span className="font-semibold text-text-primary">
                {stats.bonusPerc}%
              </span>
            </div>
            <div className="flex justify-between text-xs text-text-secondary">
              <span>Dimensione gruppo</span>
              <span className="font-semibold text-text-primary">
                {stats.dimensioniGruppo}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
