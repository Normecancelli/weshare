"use client";

import { useState, useRef } from "react";

type ImportStatus = "idle" | "uploading" | "success" | "error";

interface ImportResult {
  totalProducts: number;
  categories: number;
  inserted: number;
  updated: number;
  deactivated: number;
}

export default function ProdottiImportPage() {
  const [status, setStatus] = useState<ImportStatus>("idle");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setFileName(file.name);
    setStatus("uploading");
    setError("");
    setResult(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/products/import", {
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
      <p className="text-text-secondary text-sm mb-8">
        Carica il listino prezzi Amway in formato Excel
      </p>

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
