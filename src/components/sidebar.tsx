"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  LayoutDashboard,
  TrendingUp,
  Users,
  Contact,
  Network,
  Receipt,
  ShoppingCart,
  Package,
  Upload,
  Calendar,
  Wallet,
  Target,
  GraduationCap,
  Presentation,
  Settings,
  LogOut,
  X,
  type LucideIcon,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type MenuItem = {
  name: string;
  icon: LucideIcon;
  href: string;
  badge?: string;
};

type MenuSection = {
  label: string;
  items: MenuItem[];
};

const menuSections: MenuSection[] = [
  {
    label: "Panoramica",
    items: [
      { name: "Dashboard", icon: LayoutDashboard, href: "/" },
      { name: "Performance", icon: TrendingUp, href: "/performance", badge: "Q2" },
    ],
  },
  {
    label: "Persone",
    items: [
      { name: "I miei Clienti", icon: Users, href: "/clienti" },
      { name: "Contatti", icon: Contact, href: "/contatti" },
      { name: "Il mio Team", icon: Network, href: "/team" },
    ],
  },
  {
    label: "Attività",
    items: [
      { name: "Fatturati", icon: Receipt, href: "/ordini" },
      { name: "Ordini Clienti", icon: ShoppingCart, href: "/ordini-clienti" },
      { name: "Prodotti", icon: Package, href: "/prodotti" },
      { name: "Importa dati", icon: Upload, href: "/import" },
    ],
  },
  {
    label: "Eventi",
    items: [{ name: "Tutti gli eventi", icon: Calendar, href: "/eventi" }],
  },
  {
    label: "Crescita",
    items: [
      { name: "Entrate", icon: Wallet, href: "/entrate" },
      { name: "Obiettivi", icon: Target, href: "/obiettivi" },
      { name: "Formazione", icon: GraduationCap, href: "/formazione" },
      { name: "Presentazioni", icon: Presentation, href: "/presentazioni" },
    ],
  },
];

type SidebarProps = {
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
};

function isItemActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar({ mobileOpen = false, onCloseMobile }: SidebarProps) {
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserEmail(data.user?.email ?? null);
    });
  }, [supabase]);

  function handleNav(href: string) {
    router.push(href);
    onCloseMobile?.();
  }

  async function handleLogout() {
    setLoggingOut(true);
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <>
      {mobileOpen && (
        <div
          onClick={onCloseMobile}
          className="md:hidden fixed inset-0 bg-black/40 z-40"
          aria-hidden
        />
      )}
      <nav
        className={`
          bg-[var(--op-sidebar-bg)] flex flex-col py-7
          fixed inset-y-0 left-0 z-50 w-64 transform transition-transform duration-200
          ${mobileOpen ? "translate-x-0" : "-translate-x-full"}
          md:relative md:translate-x-0 md:shrink-0 md:z-0
        `}
      >
        <div className="px-6 pb-7 border-b border-[var(--op-sidebar-divider)] mb-5 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold text-white tracking-tight">
              WeShare
            </h1>
            <span className="text-[11px] text-white/50 tracking-wide">
              powered by Me.To.Do for you®
            </span>
          </div>
          {onCloseMobile && (
            <button
              type="button"
              onClick={onCloseMobile}
              aria-label="Chiudi menu"
              className="md:hidden w-8 h-8 rounded-lg hover:bg-white/10 flex items-center justify-center text-white/65"
            >
              <X size={18} strokeWidth={2} />
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {menuSections.map((section) => (
            <div key={section.label} className="px-4 mb-2">
              <div className="text-[10px] font-semibold uppercase tracking-[1.2px] text-white/50 px-3 pt-3 pb-1.5">
                {section.label}
              </div>
              {section.items.map((item) => {
                const Icon = item.icon;
                const isActive = isItemActive(pathname, item.href);
                return (
                  <button
                    key={item.name}
                    onClick={() => handleNav(item.href)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm transition-all ${
                      isActive
                        ? "bg-[var(--op-sidebar-active)] text-white font-semibold"
                        : "text-[var(--op-sidebar-text)] hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    <Icon size={18} strokeWidth={1.75} className="shrink-0" />
                    {item.name}
                    {item.badge && (
                      <span className="ml-auto bg-[var(--op-blue-50)] text-[var(--op-blue-800)] text-[11px] font-semibold px-2 py-0.5 rounded-full">
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div className="px-4 mt-auto pt-3 border-t border-[var(--op-sidebar-divider)]">
          {userEmail && (
            <div className="px-3 pb-2 text-[11px] text-white/50 truncate" title={userEmail}>
              {userEmail}
            </div>
          )}
          <button
            onClick={() => router.push("/impostazioni")}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-[var(--op-sidebar-text)] hover:bg-white/5 hover:text-white transition-all"
          >
            <Settings size={18} strokeWidth={1.75} className="shrink-0" />
            Impostazioni
          </button>
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-[var(--op-sidebar-text)] hover:bg-white/5 hover:text-white transition-all disabled:opacity-50"
          >
            <LogOut size={18} strokeWidth={1.75} className="shrink-0" />
            {loggingOut ? "Uscita..." : "Esci"}
          </button>
        </div>
      </nav>
    </>
  );
}
