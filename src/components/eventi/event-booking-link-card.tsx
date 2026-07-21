"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";

type Props = { url: string };

export function EventBookingLinkCard({ url }: Props) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    import("qrcode").then((mod) => {
      const QRCode = (mod.default ?? mod) as typeof import("qrcode");
      QRCode.toDataURL(url, { width: 320, margin: 2 }).then((dataUrl) => {
        if (!cancelled) setQrDataUrl(dataUrl);
      });
    });
    return () => { cancelled = true; };
  }, [url]);

  function copyLink() {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-text-secondary">
        Link pubblico per questo evento: chi lo apre può prenotarsi anche senza essere già un tuo contatto.
      </p>
      <div className="flex gap-2">
        <input readOnly value={url} className="w-full px-4 py-2.5 rounded-xl text-sm border border-border bg-bg-main focus:outline-none" />
        <button onClick={copyLink} className="px-3 py-2 rounded-xl text-sm font-semibold bg-bg-section text-text-primary hover:bg-accent-glow transition-all shrink-0">
          {copied ? "Copiato!" : "Copia"}
        </button>
      </div>
      {qrDataUrl && (
        <div className="flex flex-col items-center gap-2 pt-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrDataUrl} alt="QR prenotazione evento" className="w-40 h-40 rounded-xl border border-border" />
          <a href={qrDataUrl} download="weshare-qr-prenotazione.png" className="flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline">
            <Download size={14} strokeWidth={2} /> Scarica PNG
          </a>
        </div>
      )}
    </div>
  );
}
