import * as Icons from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ICONA_TEMA_DEFAULT } from "@/lib/contenuti/icone-temi";

type Props = {
  nome: string;
  size?: number;
  className?: string;
};

export function IconaTemaIcon({ nome, size = 16, className }: Props) {
  const IconComponent = ((Icons as unknown as Record<string, LucideIcon>)[nome]) ||
    (Icons as unknown as Record<string, LucideIcon>)[ICONA_TEMA_DEFAULT];
  return <IconComponent size={size} strokeWidth={1.75} className={className} />;
}
