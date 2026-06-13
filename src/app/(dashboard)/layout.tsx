"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { Sidebar } from "@/components/sidebar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex h-full w-full overflow-hidden">
      <Sidebar mobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)} />
      <div className="flex-1 flex flex-col min-w-0 bg-bg-main overflow-hidden">
        <header className="md:hidden flex items-center gap-3 px-4 py-3 border-b border-[var(--op-border)] bg-white">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Apri menu"
            className="w-9 h-9 rounded-lg hover:bg-[var(--op-surface)] flex items-center justify-center text-text-primary"
          >
            <Menu size={20} strokeWidth={1.75} />
          </button>
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-bold text-text-primary tracking-tight">WeShare</span>
            <span className="text-[10px] text-text-gentle tracking-wide">powered by Me.To.Do for you®</span>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
