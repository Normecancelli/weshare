import { AlertCircle, AlertTriangle, CheckCircle2, Info, type LucideIcon } from "lucide-react";

type Variant = "error" | "warning" | "success" | "info";

const VARIANT_STYLE: Record<Variant, { bg: string; text: string; icon: LucideIcon }> = {
  error: { bg: "bg-error/10", text: "text-error", icon: AlertCircle },
  warning: { bg: "bg-warning/10", text: "text-warning", icon: AlertTriangle },
  success: { bg: "bg-success/10", text: "text-success", icon: CheckCircle2 },
  info: { bg: "bg-info/10", text: "text-info", icon: Info },
};

type Props = {
  variant: Variant;
  children: React.ReactNode;
};

export function InlineMessage({ variant, children }: Props) {
  const { bg, text, icon: Icon } = VARIANT_STYLE[variant];
  return (
    <div className={`flex items-start gap-2 px-3 py-2.5 rounded-xl text-sm ${bg} ${text}`}>
      <Icon size={16} strokeWidth={2} className="shrink-0 mt-0.5" />
      <span>{children}</span>
    </div>
  );
}
