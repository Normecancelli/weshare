"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";

type ImportStatus = "idle" | "uploading" | "success" | "error";

interface ImportResult {
  totalProducts: number;
  categories: number;
  inserted: number;
  updated: number;
  deactivated: number;
}

export default function ProdottiImportPage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [status, setStatus] = useState<ImportStatus>("idle");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState("");
  const [partial, setPartial] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        setIsAdmin(!!d.isAdmin);
        setAuthChecked(true);
      })
      .catch(() => setAuthChecked(true));
  }, []);

  if (!authChecked) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-10 h-10 border-3 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="max-w-md mx-auto py-12 text-center">
        <p className="text-3xl mb-3">🔒</p>
        <h2 className="text-xl font-bold mb-2">Area riservata</h2>
        <p className="text-text-secondary text-sm mb-5">
          Solo un amministratore può aggiornare il listino prezzi. Contatta il referente WeShare del tuo gruppo.
        </p>
        <button
          onClick={() => router.push("/prodotti")}
          className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-accent text-white hover:bg-accent-hover transition-all"
        >
          Torna al catalogo
        </button>
      </div>
    );
  }

  async function handleFile(file: File) {
    setFileName(file.name);
    setStatus("uploading");
    setError("");
    setResult(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const url = partial
        ? "/api/products/import?partial=true"
        : "/api/products/import";
      const res = await fetch(url, {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        setStatus("error");
        setError(data.error || "Errore durante l'importazione");
        return;
      }

      setStatus("success");
      setResult(data);
    } catch {
      setStatus("error");
      setError("Errore di connessione. Riprova.");
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold tracking-tight mb-2">
        Importa Listino Prezzi
      </h2>
      <p className="text-text-secondary text-sm mb-6">
        Carica il listino prezzi Amway in formato Excel
      </p>

      <label className="flex items-center gap-3 mb-6 cursor-pointer select-none">
        <div
          onClick={() => setPartial((v) => !v)}
          className={`w-11 h-6 rounded-full transition-colors flex-shrink-0 ${partial ? "bg-accent" : "bg-border"}`}
        >
          <div className={`w-5 h-5 bg-white rounded-full shadow mt-0.5 transition-transform ${partial ? "translate-x-5.5" : "translate-x-0.5"}`} />
        </div>
        <div>
          <span className="text-sm font-medium text-text-primary">Aggiornamento parziale</span>
          <p className="text-xs text-text-secondary mt-0.5">
            {partial
              ? "Aggiorna/aggiunge solo i prodotti nel file — il resto del catalogo non viene toccato"
              : "Listino completo — i prodotti non presenti nel file verranno disattivati"}
          </p>
        </div>
      </label>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileRef.current?.click()}
        className={`border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all ${
          dragOver
            ? "border-accent bg-accent-glow scale-[1.01]"
            : status === "success"
              ? "border-success bg-[#E8F5EE]"
              : status === "error"
                ? "border-error bg-coral-soft"
                : "border-border bg-bg-card hover:border-accent hover:bg-accent-glow/50"
        }`}
      >
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls"
          onChange={handleInputChange}
          className="hidden"
        />

        {status === "idle" && (
          <>
            <div className="text-4xl mb-4">📦</div>
            <p className="text-text-primary font-semibold mb-1">
              Trascina il listino qui oppure clicca per selezionarlo
            </p>
            <p className="text-text-gentle text-sm">
              Formato: PriceList_*.xlsx (listino prezzi Amway)
            </p>
          </>
        )}

        {status === "uploading" && (
          <>
            <div className="text-4xl mb-4 animate-pulse">⏳</div>
            <p className="text-text-primary font-semibold mb-1">
              Importazione in corso...
            </p>
            <p className="text-text-secondary text-sm">{fileName}</p>
          </>
        )}

        {status === "success" && result && (
          <>
            <div className="text-4xl mb-4">✅</div>
            <p className="text-success font-semibold mb-1">
              Listino importato!
            </p>
            <p className="text-text-secondary text-sm">
              {result.totalProducts} prodotti · {result.categories} categorie
            </p>
            <div className="mt-3 flex justify-center gap-4 text-xs text-text-secondary">
              <span>{result.inserted} nuovi</span>
              <span>{result.updated} aggiornati</span>
              {result.deactivated > 0 && (
                <span className="text-coral">
                  {result.deactivated} rimossi
                </span>
              )}
            </div>
          </>
        )}

        {status === "error" && (
          <>
            <div className="text-4xl mb-4">❌</div>
            <p className="text-error font-semibold mb-1">
              Errore nell&apos;importazione
            </p>
            <p className="text-text-secondary text-sm">{error}</p>
          </>
        )}
      </div>

      {(status === "success" || status === "error") && (
        <button
          onClick={() => {
            setStatus("idle");
            setResult(null);
            setError("");
            setFileName("");
          }}
          className="mt-4 w-full py-2.5 rounded-xl text-sm font-medium border border-border text-text-secondary hover:border-accent hover:text-accent transition-all"
        >
          {status === "success" ? "Carica un nuovo listino" : "Riprova"}
        </button>
      )}
    </div>
  );
}
