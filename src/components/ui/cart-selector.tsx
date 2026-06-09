"use client";

import type { CartType } from "@/lib/types/orders";

interface CartSelectorProps {
  value: CartType;
  onChange: (cart: CartType) => void;
  compact?: boolean;
}

const carts: {
  type: CartType;
  label: string;
  shortLabel: string;
  color: string;
  activeColor: string;
}[] = [
  {
    type: "personale",
    label: "Personale",
    shortLabel: "Pers.",
    color: "bg-bg-section text-text-secondary",
    activeColor: "bg-accent text-white",
  },
  {
    type: "non_registrato",
    label: "Non registrato",
    shortLabel: "Non reg.",
    color: "bg-bg-section text-text-secondary",
    activeColor: "bg-[#1976D2] text-white",
  },
  {
    type: "programmato",
    label: "Programmato",
    shortLabel: "Progr.",
    color: "bg-bg-section text-text-secondary",
    activeColor: "bg-[#9C27B0] text-white",
  },
];

export function CartSelector({
  value,
  onChange,
  compact = false,
}: CartSelectorProps) {
  return (
    <div className="flex gap-1">
      {carts.map((cart) => (
        <button
          key={cart.type}
          onClick={() => onChange(cart.type)}
          className={`px-2 md:px-3 py-1 md:py-1.5 rounded-md text-[10px] md:text-xs font-semibold transition-all ${
            value === cart.type ? cart.activeColor : cart.color
          }`}
        >
          {compact ? cart.shortLabel : cart.label}
        </button>
      ))}
    </div>
  );
}
