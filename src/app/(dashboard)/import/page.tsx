"use client";

import { useState, useRef } from "react";

type ImportStatus = "idle" | "uploading" | "success" | "error";

interface ImportResult {
  meseRiferimento: string;
  totalRows: number;
  sheetName: string;
}

export default function ImportPage() {
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
      const res = await fetch("/api/import", {
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

  function formatMese(mese: string): string {
    const anno = mese.slice(0, 4);
    const meseNum = mese.slice(4, 6);
    const mesi = [
      "",
      "Gennaio",
      "Febbraio",
      "Marzo",
      "Aprile",
      "Maggio",
      "Giugno",
      "Luglio",
      "Agosto",
      "Settembre",
      "Ottobre",
      "Novembre",
      "Dicembre",
    ];
    return `${mesi[parseInt(meseNum)]} ${anno}`;
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold tracking-tight mb-2">Importa dati</h2>
      <p className="text-text-secondary text-sm mb-8">
        Carica il file Excel mensile scaricato dal sito Amway
      </p>

      {/* Drop zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileRef.current?.click()}
        className={`
          border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all
          ${
            dragOver
              ? "border-accent bg-accent-glow scale-[1.01]"
              : status === "success"
                ? "border-success bg-[#E8F5EE]"
                : status === "error"
                  ? "border-error bg-coral-soft"
                  : "border-border bg-bg-card hover:border-accent hover:bg-accent-glow/50"
          }
        `}
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
            <div className="text-4xl mb-4">📊</div>
            <p className="text-text-primary font-semibold mb-1">
              Trascina il file qui oppure clicca per selezionarlo
            </p>
            <p className="text-text-gentle text-sm">
              Formato accettato: .xlsx (file Amway mensile)
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
              Importazione completata!
            </p>
            <p className="text-text-secondary text-sm">
              {result.totalRows} membri importati per{" "}
              {formatMese(result.meseRiferimento)}
            </p>
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

      {/* Reset button */}
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
          {status === "success" ? "Carica un altro mese" : "Riprova"}
        </button>
      )}

      {/* Info box */}
      <div className="mt-8 bg-bg-section rounded-2xl p-6">
        <h3 className="text-sm font-semibold text-text-primary mb-3">
          Come funziona
        </h3>
        <ul className="space-y-2 text-sm text-text-secondary">
          <li>
            1. Scarica il report mensile dal sito Amway
          </li>
          <li>
            2. Trascina il file .xlsx qui sopra
          </li>
          <li>
            3. Il sistema legge automaticamente mese, team e dati
          </li>
          <li>
            4. I dati vengono salvati nello storico per confronti nel tempo
          </li>
        </ul>
        <div className="mt-4 p-3 bg-accent-glow rounded-xl text-xs text-text-secondary">
          <strong className="text-accent-hover">Nota:</strong> Se carichi lo
          stesso mese due volte, i dati precedenti vengono sostituiti.
        </div>
      </div>
    </div>
  );
}
