"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const menuSections = [
  {
    label: "Panoramica",
    items: [
      { name: "Dashboard", icon: "◉", href: "/" },
      { name: "Performance", icon: "★", href: "/performance", badge: "Q2" },
    ],
  },
  {
    label: "Persone",
    items: [
      { name: "Contatti", icon: "◎", href: "/contatti" },
      { name: "Il mio Team", icon: "♦", href: "/team" },
      { name: "Prospect", icon: "◇", href: "/prospect" },
    ],
  },
  {
    label: "Attività",
    items: [
      { name: "Fatturati", icon: "▤", href: "/ordini" },
      { name: "Ordini Clienti", icon: "🛒", href: "/ordini-clienti" },
      { name: "Prodotti", icon: "▢", href: "/prodotti" },
      { name: "Importa dati", icon: "📊", href: "/import" },
    ],
  },
  {
    label: "Eventi",
    items: [{ name: "Tutti gli eventi", icon: "◈", href: "/eventi" }],
  },
  {
    label: "Clienti",
    items: [
      { name: "I miei Clienti", icon: "👥", href: "/clienti" },
    ],
  },
  {
    label: "Crescita",
    items: [
      { name: "Entrate", icon: "↗", href: "/entrate" },
      { name: "Obiettivi", icon: "◎", href: "/obiettivi" },
      { name: "Formazione", icon: "▵", href: "/formazione" },
      { name: "Presentazioni", icon: "▭", href: "/presentazioni" },
    ],
  },
];

export function Sidebar() {
  const [active, setActive] = useState("Dashboard");
  const router = useRouter();

  return (
    <nav className="w-64 bg-bg-section border-r border-border flex flex-col shrink-0 py-7">
      <div className="px-6 pb-7 border-b border-divider mb-5">
        <h1 className="text-lg font-bold text-text-primary tracking-tight">
          Amway Partner
        </h1>
        <span className="text-[11px] text-text-gentle tracking-wide">
          powered by ME.TO.DO®
        </span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {menuSections.map((section) => (
          <div key={section.label} className="px-4 mb-2">
            <div className="text-[10px] font-semibold uppercase tracking-[1.2px] text-text-gentle px-3 pt-3 pb-1.5">
              {section.label}
            </div>
            {section.items.map((item) => (
              <button
                key={item.name}
                onClick={() => {
                  setActive(item.name);
                  router.push(item.href);
                }}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm transition-all ${
                  active === item.name
                    ? "bg-accent-glow text-accent-hover font-semibold"
                    : "text-text-primary/80 hover:bg-bg-main hover:text-text-primary"
                }`}
              >
                <span className="w-5 text-center text-base">{item.icon}</span>
                {item.name}
                {item.badge && (
                  <span className="ml-auto bg-coral-soft text-coral text-[11px] font-semibold px-2 py-0.5 rounded-full">
                    {item.badge}
                  </span>
                )}
              </button>
            ))}
          </div>
        ))}
      </div>

      <div className="px-4 mt-auto">
        <button className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-text-secondary hover:bg-bg-main hover:text-text-primary transition-all">
          <span className="w-5 text-center text-base">⚙</span>
          Impostazioni
        </button>
      </div>
    </nav>
  );
}
