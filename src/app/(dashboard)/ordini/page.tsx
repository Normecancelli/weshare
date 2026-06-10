"use client";

import { useEffect, useState, useMemo, useCallback } from "react";

// --- Types ---

interface Membro {
  codice: string;
  codiceSponsor: string | null;
  nome: string;
  livello: number;
  ordiniPersonali: number;
  ordiniMulticarrello: number;
  vpp: number;
  vpCliente: number;
  dimensioniGruppo: number;
  ordiniPrev: number | null;
  vppPrev: number | null;
}

interface TreeNode extends Membro {
  children: TreeNode[];
  depth: number;
}

interface OrdiniData {
  meseCorrente: string;
  meseCorrenteLabel: string;
  mesePrecedente: string | null;
  mesePrecedenteLabel: string | null;
  mesiDisponibili: { value: string; label: string }[];
  stats: {
    totaleOrdini: number;
    totaleMulticarrello: number;
    membriConOrdini: number;
    membriSenzaOrdini: number;
    totaleTeam: number;
    mediaOrdiniPerPersona: number;
    totaleVpp: number;
    ordiniTrend: number | null;
    membriAttiviTrend: number | null;
    mioOrdini: number;
    mioVpp: number;
  };
  distribuzione: {
    livello: number;
    membri: number;
    ordini: number;
    media: number;
  }[];
  membri: Membro[];
}

type SortField =
  | "nome"
  | "codice"
  | "livello"
  | "ordiniPersonali"
  | "vpp"
  | "vpCliente";
type SortDir = "asc" | "desc";
type FilterView = "tutti" | "con_ordini" | "senza_ordini" | "diretti";

// --- Helpers ---

function formatCurrency(n: number): string {
  return n.toLocaleString("it-IT", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  });
}

function formatNumber(n: number): string {
  return n.toLocaleString("it-IT", { maximumFractionDigits: 0 });
}

function getInitials(nome: string): string {
  if (!nome) return "??";
  return nome
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function trendBadge(value: number | null, suffix = "%") {
  if (value === null || value === undefined) return null;
  const isUp = value > 0;
  const isDown = value < 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-semibold ${
        isUp
          ? "text-success"
          : isDown
            ? "text-coral"
            : "text-text-secondary"
      }`}
    >
      {isUp ? "↑" : isDown ? "↓" : "–"} {Math.abs(value)}
      {suffix}
    </span>
  );
}

// --- Tree builder ---

function buildTree(membri: Membro[]): TreeNode[] {
  const byCode = new Map<string, TreeNode>();
  const childrenOf = new Map<string, TreeNode[]>();

  // Create nodes
  for (const m of membri) {
    const node: TreeNode = { ...m, children: [], depth: 0 };
    byCode.set(m.codice, node);
  }

  // Link parent-child
  for (const m of membri) {
    if (m.codiceSponsor) {
      const list = childrenOf.get(m.codiceSponsor) || [];
      list.push(byCode.get(m.codice)!);
      childrenOf.set(m.codiceSponsor, list);
    }
  }

  // Assign children and find roots
  const roots: TreeNode[] = [];
  byCode.forEach((node, code) => {
    node.children = (childrenOf.get(code) || []).sort(
      (a, b) => (parseInt(a.codice, 10) || 0) - (parseInt(b.codice, 10) || 0)
    );
    // Root: sponsor not in our dataset, or livello 1
    if (
      node.livello === 1 ||
      !node.codiceSponsor ||
      !byCode.has(node.codiceSponsor)
    ) {
      roots.push(node);
    }
  });

  // Set depths
  function setDepth(nodes: TreeNode[], d: number) {
    for (const n of nodes) {
      n.depth = d;
      setDepth(n.children, d + 1);
    }
  }
  setDepth(roots, 0);

  return roots.sort(
    (a, b) => (parseInt(a.codice, 10) || 0) - (parseInt(b.codice, 10) || 0)
  );
}

function flattenTree(
  nodes: TreeNode[],
  expanded: Set<string>
): TreeNode[] {
  const result: TreeNode[] = [];
  function walk(list: TreeNode[]) {
    for (const node of list) {
      result.push(node);
      if (node.children.length > 0 && expanded.has(node.codice)) {
        walk(node.children);
      }
    }
  }
  walk(nodes);
  return result;
}

// --- Component ---

export default function OrdiniPage() {
  const [data, setData] = useState<OrdiniData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [meseSelezionato, setMeseSelezionato] = useState<string>("");
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>("ordiniPersonali");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [filterView, setFilterView] = useState<FilterView>("tutti");
  const [treeView, setTreeView] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function loadData(mese?: string) {
    setLoading(true);
    const url = mese ? `/api/ordini?mese=${mese}` : "/api/ordini";
    fetch(url)
      .then((res) => res.json())
      .then((json) => {
        if (json.empty) {
          setData(null);
        } else if (json.error) {
          setError(json.error);
        } else {
          setData(json);
          if (!meseSelezionato) {
            setMeseSelezionato(json.meseCorrente);
          }
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleMeseChange(mese: string) {
    setMeseSelezionato(mese);
    setExpanded(new Set());
    loadData(mese);
  }

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  }

  const toggleExpand = useCallback((codice: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(codice)) {
        next.delete(codice);
      } else {
        next.add(codice);
      }
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    if (!data) return;
    const all = new Set<string>();
    for (const m of data.membri) {
      all.add(m.codice);
    }
    setExpanded(all);
  }, [data]);

  const collapseAll = useCallback(() => {
    setExpanded(new Set());
  }, []);

  // --- Flat list (sorted + filtered) ---
  const filteredFlat = useMemo(() => {
    if (!data) return [];
    let list = data.membri;

    switch (filterView) {
      case "con_ordini":
        list = list.filter((m) => m.ordiniPersonali > 0);
        break;
      case "senza_ordini":
        list = list.filter((m) => m.ordiniPersonali === 0 && m.livello > 1);
        break;
      case "diretti":
        list = list.filter((m) => m.livello === 2);
        break;
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (m) =>
          (m.nome && m.nome.toLowerCase().includes(q)) ||
          m.codice.toLowerCase().includes(q)
      );
    }

    list = [...list].sort((a, b) => {
      let va: number | string = 0;
      let vb: number | string = 0;
      switch (sortField) {
        case "nome":
          va = (a.nome || "").toLowerCase();
          vb = (b.nome || "").toLowerCase();
          return sortDir === "asc"
            ? (va as string).localeCompare(vb as string)
            : (vb as string).localeCompare(va as string);
        case "codice":
          va = parseInt(a.codice, 10) || 0;
          vb = parseInt(b.codice, 10) || 0;
          break;
        case "livello":
          va = a.livello;
          vb = b.livello;
          break;
        case "ordiniPersonali":
          va = a.ordiniPersonali;
          vb = b.ordiniPersonali;
          break;
        case "vpp":
          va = a.vpp;
          vb = b.vpp;
          break;
        case "vpCliente":
          va = a.vpCliente;
          vb = b.vpCliente;
          break;
      }
      return sortDir === "asc"
        ? (va as number) - (vb as number)
        : (vb as number) - (va as number);
    });

    return list;
  }, [data, filterView, search, sortField, sortDir]);

  // --- Tree list ---
  const treeRoots = useMemo(() => {
    if (!data) return [];
    let list = data.membri;

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (m) =>
          (m.nome && m.nome.toLowerCase().includes(q)) ||
          m.codice.toLowerCase().includes(q)
      );
    }

    return buildTree(list);
  }, [data, search]);

  const visibleTree = useMemo(
    () => flattenTree(treeRoots, expanded),
    [treeRoots, expanded]
  );

  // Which list to render
  const displayList = treeView ? visibleTree : filteredFlat;

  // Count children for each member (for tree view badge)
  const childCountMap = useMemo(() => {
    if (!data) return new Map<string, number>();
    const map = new Map<string, number>();
    for (const m of data.membri) {
      if (m.codiceSponsor) {
        map.set(m.codiceSponsor, (map.get(m.codiceSponsor) || 0) + 1);
      }
    }
    return map;
  }, [data]);

  // --- RENDER ---

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-3 border-accent border-t-transparent rounded-full animate-spin" />
          <p className="text-text-secondary text-sm">
            Caricamento fatturati...
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
      <div className="flex items-center justify-center h-64">
        <div className="bg-bg-card border border-border rounded-2xl p-8 max-w-md text-center">
          <p className="text-2xl mb-3">📦</p>
          <p className="font-semibold text-text-primary mb-2">
            Nessun dato fatturati
          </p>
          <p className="text-text-secondary text-sm mb-4">
            Importa un file Excel Amway per visualizzare i fatturati del team.
          </p>
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

  const { stats, distribuzione } = data;
  const percAttivi =
    stats.totaleTeam > 0
      ? Math.round((stats.membriConOrdini / (stats.totaleTeam + 1)) * 100)
      : 0;

  return (
    <div>
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Fatturati</h2>
          <p className="text-text-secondary text-sm mt-1">
            Panoramica fatturato del team
          </p>
        </div>
        <select
          value={meseSelezionato}
          onChange={(e) => handleMeseChange(e.target.value)}
          className="px-4 py-2.5 rounded-xl text-sm font-medium border border-border bg-bg-card text-text-primary hover:border-accent transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent/30"
        >
          {data.mesiDisponibili.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-4 gap-5 mb-8">
        <div className="bg-bg-card border border-border rounded-2xl p-6 border-t-3 border-t-accent hover:-translate-y-0.5 hover:shadow-md transition-all">
          <div className="text-[13px] text-text-secondary font-medium mb-2">
            Fatturati totali
          </div>
          <div className="text-3xl font-bold tracking-tight mb-2">
            {formatNumber(stats.totaleOrdini)}
          </div>
          <div className="flex items-center gap-2">
            {trendBadge(stats.ordiniTrend)}
            {stats.ordiniTrend !== null && (
              <span className="text-xs text-text-gentle">vs. mese prec.</span>
            )}
          </div>
        </div>

        <div className="bg-bg-card border border-border rounded-2xl p-6 border-t-3 border-t-success hover:-translate-y-0.5 hover:shadow-md transition-all">
          <div className="text-[13px] text-text-secondary font-medium mb-2">
            Membri con fatturato
          </div>
          <div className="text-3xl font-bold tracking-tight mb-2">
            {stats.membriConOrdini}{" "}
            <span className="text-lg text-text-secondary font-normal">
              / {stats.totaleTeam + 1}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-success">
              {percAttivi}% attivi
            </span>
            {trendBadge(stats.membriAttiviTrend, "")}
          </div>
        </div>

        <div className="bg-bg-card border border-border rounded-2xl p-6 border-t-3 border-t-coral hover:-translate-y-0.5 hover:shadow-md transition-all">
          <div className="text-[13px] text-text-secondary font-medium mb-2">
            Senza fatturato
          </div>
          <div className="text-3xl font-bold tracking-tight mb-2 text-coral">
            {stats.membriSenzaOrdini}
          </div>
          <div className="text-xs text-text-secondary">
            su {stats.totaleTeam} membri del team
          </div>
        </div>

        <div className="bg-bg-card border border-border rounded-2xl p-6 border-t-3 border-t-lavender hover:-translate-y-0.5 hover:shadow-md transition-all">
          <div className="text-[13px] text-text-secondary font-medium mb-2">
            VPP totale team
          </div>
          <div className="text-3xl font-bold tracking-tight mb-2">
            {formatCurrency(stats.totaleVpp)}
          </div>
          <div className="text-xs text-text-secondary">
            Media {stats.mediaOrdiniPerPersona} fatt. / persona
          </div>
        </div>
      </div>

      {/* Content grid */}
      <div className="grid grid-cols-[2fr_1fr] gap-6 mb-8">
        <div className="bg-bg-card border border-border rounded-2xl p-6">
          <h3 className="font-semibold mb-4">
            Distribuzione fatturati per livello
          </h3>
          <div className="space-y-3">
            {distribuzione.map((d) => {
              const maxOrdini = Math.max(
                ...distribuzione.map((x) => x.ordini),
                1
              );
              return (
                <div key={d.livello} className="flex items-center gap-3">
                  <span className="text-xs text-text-secondary w-14 shrink-0">
                    Liv. {d.livello}
                  </span>
                  <div className="flex-1 h-7 bg-bg-section rounded-full overflow-hidden relative">
                    <div
                      className="h-full bg-gradient-to-r from-accent to-accent-hover rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.max((d.ordini / maxOrdini) * 100, 4)}%`,
                      }}
                    />
                    <span className="absolute inset-0 flex items-center px-3 text-[11px] font-semibold text-text-primary">
                      {d.ordini} fatt. &middot; {d.membri} membri &middot;
                      media {d.media}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-bg-card border border-border rounded-2xl p-6">
          <h3 className="font-semibold mb-4">Il mio fatturato</h3>
          <div className="space-y-4">
            <div className="bg-accent-glow rounded-xl p-4">
              <div className="text-xs text-text-secondary mb-1">
                Fatturati personali
              </div>
              <div className="text-2xl font-bold text-accent-hover">
                {stats.mioOrdini}
              </div>
            </div>
            <div className="bg-bg-section rounded-xl p-4">
              <div className="text-xs text-text-secondary mb-1">
                VPP personali
              </div>
              <div className="text-2xl font-bold text-text-primary">
                {formatCurrency(stats.mioVpp)}
              </div>
            </div>
            <div className="bg-bg-section rounded-xl p-4">
              <div className="text-xs text-text-secondary mb-1">
                Multicarrello
              </div>
              <div className="text-2xl font-bold text-text-primary">
                {formatNumber(stats.totaleMulticarrello)}
              </div>
              <div className="text-xs text-text-gentle mt-1">totale team</div>
            </div>
          </div>
        </div>
      </div>

      {/* Members table */}
      <div className="bg-bg-card border border-border rounded-2xl p-6">
        <div className="flex justify-between items-center mb-5">
          <h3 className="font-semibold">Dettaglio fatturato</h3>
          <span className="text-xs text-text-secondary">
            {displayList.length} risultati
          </span>
        </div>

        {/* Filters row */}
        <div className="flex items-center gap-3 mb-5 flex-wrap">
          {/* Search */}
          <div className="relative flex-1 max-w-xs">
            <input
              type="text"
              placeholder="Cerca per nome o codice..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-xl text-sm border border-border bg-bg-main text-text-primary placeholder-text-gentle focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-all"
            />
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-gentle text-sm">
              ⌕
            </span>
          </div>

          {/* Filter buttons (flat view only) */}
          {!treeView && (
            <div className="flex gap-1 bg-bg-section rounded-xl p-1">
              {(
                [
                  { key: "tutti", label: "Tutti" },
                  { key: "con_ordini", label: "Con fatturato" },
                  { key: "senza_ordini", label: "Senza fatturato" },
                  { key: "diretti", label: "Diretti" },
                ] as const
              ).map((f) => (
                <button
                  key={f.key}
                  onClick={() => setFilterView(f.key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    filterView === f.key
                      ? "bg-bg-card text-accent-hover shadow-sm"
                      : "text-text-secondary hover:text-text-primary"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          )}

          {/* Tree toggle */}
          <button
            onClick={() => {
              setTreeView(!treeView);
              if (!treeView) setExpanded(new Set());
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${
              treeView
                ? "bg-accent text-white border-accent"
                : "bg-bg-card text-text-secondary border-border hover:border-accent hover:text-accent"
            }`}
          >
            🌳 Per sponsor
          </button>

          {/* Expand/collapse all (tree view) */}
          {treeView && (
            <div className="flex gap-1">
              <button
                onClick={expandAll}
                className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-text-secondary hover:text-accent transition-all"
                title="Espandi tutti"
              >
                + Tutti
              </button>
              <button
                onClick={collapseAll}
                className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-text-secondary hover:text-accent transition-all"
                title="Chiudi tutti"
              >
                − Tutti
              </button>
            </div>
          )}
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-divider">
                <th className="text-left py-3 pl-0 pr-2 text-xs font-semibold text-text-secondary">
                  {treeView ? (
                    "Nome"
                  ) : (
                    <span
                      className="inline-flex items-center gap-1 cursor-pointer hover:text-accent transition-colors select-none"
                      onClick={() => toggleSort("nome")}
                    >
                      Nome
                      {sortField === "nome" && (
                        <span className="text-accent">
                          {sortDir === "asc" ? "↑" : "↓"}
                        </span>
                      )}
                    </span>
                  )}
                </th>
                {(
                  [
                    { field: "codice" as SortField, label: "Codice" },
                    { field: "livello" as SortField, label: "Liv." },
                    {
                      field: "ordiniPersonali" as SortField,
                      label: "Fatt.",
                    },
                    { field: "vpp" as SortField, label: "VPP" },
                    { field: "vpCliente" as SortField, label: "VP Cliente" },
                  ] as const
                ).map((col) => (
                  <th
                    key={col.field}
                    onClick={() => !treeView && toggleSort(col.field)}
                    className={`text-left py-3 px-2 text-xs font-semibold text-text-secondary select-none ${
                      !treeView
                        ? "cursor-pointer hover:text-accent transition-colors"
                        : ""
                    }`}
                  >
                    <span className="inline-flex items-center gap-1">
                      {col.label}
                      {!treeView && sortField === col.field && (
                        <span className="text-accent">
                          {sortDir === "asc" ? "↑" : "↓"}
                        </span>
                      )}
                    </span>
                  </th>
                ))}
                <th className="text-right py-3 px-2 text-xs font-semibold text-text-secondary">
                  Multi.
                </th>
                <th className="text-right py-3 px-2 text-xs font-semibold text-text-secondary">
                  vs. prec.
                </th>
              </tr>
            </thead>
            <tbody>
              {displayList.map((m) => {
                const ordiniDiff =
                  m.ordiniPrev !== null
                    ? m.ordiniPersonali - m.ordiniPrev
                    : null;

                const hasChildren = (childCountMap.get(m.codice) || 0) > 0;
                const isExpanded = expanded.has(m.codice);
                const depth = treeView && "depth" in m ? (m as TreeNode).depth : 0;

                return (
                  <tr
                    key={m.codice}
                    className={`border-b border-divider last:border-b-0 hover:bg-bg-main/50 transition-colors ${
                      m.ordiniPersonali === 0 && m.livello > 1
                        ? "opacity-60"
                        : ""
                    }`}
                  >
                    {/* Nome with tree indent + expand button */}
                    <td className="py-3 pl-0 pr-2">
                      <div
                        className="flex items-center gap-2"
                        style={
                          treeView
                            ? { paddingLeft: `${depth * 24}px` }
                            : undefined
                        }
                      >
                        {/* Expand/collapse button */}
                        {treeView && (
                          <button
                            onClick={() =>
                              hasChildren && toggleExpand(m.codice)
                            }
                            className={`w-6 h-6 rounded-md text-xs font-bold flex items-center justify-center shrink-0 transition-all ${
                              hasChildren
                                ? "bg-accent-glow text-accent-hover hover:bg-accent hover:text-white cursor-pointer"
                                : "text-transparent"
                            }`}
                          >
                            {hasChildren
                              ? isExpanded
                                ? "−"
                                : "+"
                              : "·"}
                          </button>
                        )}

                        {/* Avatar */}
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-[11px] font-semibold shrink-0 ${
                            m.ordiniPersonali > 0
                              ? "bg-gradient-to-br from-accent to-accent-hover"
                              : "bg-gradient-to-br from-gray-300 to-gray-400"
                          }`}
                        >
                          {getInitials(m.nome)}
                        </div>

                        {/* Name + children count */}
                        <div className="min-w-0">
                          <div className="font-medium text-text-primary text-[13px] flex items-center gap-1.5">
                            <span className="truncate">
                              {m.nome || m.codice}
                            </span>
                            {treeView && hasChildren && !isExpanded && (
                              <span className="shrink-0 bg-bg-section text-text-secondary text-[10px] font-semibold px-1.5 py-0.5 rounded-full">
                                +{childCountMap.get(m.codice)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-2 text-text-secondary text-[12px] font-mono">
                      {m.codice}
                    </td>
                    <td className="py-3 px-2 text-text-secondary">
                      {m.livello}
                    </td>
                    <td className="py-3 px-2">
                      <span
                        className={`font-semibold ${
                          m.ordiniPersonali > 0
                            ? "text-text-primary"
                            : "text-coral"
                        }`}
                      >
                        {m.ordiniPersonali}
                      </span>
                    </td>
                    <td className="py-3 px-2 text-text-primary">
                      {formatCurrency(m.vpp)}
                    </td>
                    <td className="py-3 px-2 text-text-secondary">
                      {formatCurrency(m.vpCliente)}
                    </td>
                    <td className="py-3 px-2 text-right text-text-secondary">
                      {m.ordiniMulticarrello > 0 ? m.ordiniMulticarrello : "–"}
                    </td>
                    <td className="py-3 px-2 text-right">
                      {ordiniDiff !== null ? (
                        <span
                          className={`text-xs font-semibold ${
                            ordiniDiff > 0
                              ? "text-success"
                              : ordiniDiff < 0
                                ? "text-coral"
                                : "text-text-gentle"
                          }`}
                        >
                          {ordiniDiff > 0
                            ? `+${ordiniDiff}`
                            : ordiniDiff === 0
                              ? "="
                              : ordiniDiff}
                        </span>
                      ) : (
                        <span className="text-xs text-text-gentle">–</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {displayList.length === 0 && (
            <div className="text-center py-8 text-text-secondary text-sm">
              Nessun membro trovato con i filtri selezionati
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
