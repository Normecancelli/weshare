"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { InlineMessage } from "@/components/ui/inline-message";

type Props = {
  slug: string | null;
};

export function ContactQrCard({ slug }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!slug) {
      setUrl(null);
      return;
    }
    setUrl(`${window.location.origin}/contatto/${slug}`);
  }, [slug]);

  useEffect(() => {
    if (!url) {
      setQrDataUrl(null);
      return;
    }
    let cancelled = false;
    import("qrcode").then((mod) => {
      const QRCode = (mod.default ?? mod) as typeof import("qrcode");
      QRCode.toDataURL(url, { width: 320, margin: 2 }).then((dataUrl) => {
        if (!cancelled) setQrDataUrl(dataUrl);
      });
    });
    return () => {
      cancelled = true;
    };
  }, [url]);

  function copyLink() {
    if (!url) return;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (!slug) {
    return (
      <InlineMessage variant="warning">
        Imposta il tuo codice Amway per generare il link contatti.
      </InlineMessage>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-text-secondary">
        Link fisso da condividere: chi lo apre compila un mini-form e diventa un tuo contatto in automatico.
      </p>
      <div className="flex gap-2">
        <input
          readOnly
          value={url || ""}
          className="w-full px-4 py-2.5 rounded-xl text-sm border border-border bg-bg-main focus:outline-none"
        />
        <button
          onClick={copyLink}
          className="px-3 py-2 rounded-xl text-sm font-semibold bg-bg-section text-text-primary hover:bg-accent-glow transition-all shrink-0"
        >
          {copied ? "Copiato!" : "Copia"}
        </button>
      </div>
      {qrDataUrl && (
        <div className="flex flex-col items-center gap-2 pt-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrDataUrl} alt="QR contatti" className="w-40 h-40 rounded-xl border border-border" />
          <a
            href={qrDataUrl}
            download="weshare-qr-contatti.png"
            className="flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline"
          >
            <Download size={14} strokeWidth={2} />
            Scarica PNG
          </a>
        </div>
      )}
    </div>
  );
}
