import type { LucideIcon } from "lucide-react";

type Props = {
  icon: LucideIcon;
  title: string;
  description: string;
};

export function ComingSoon({ icon: Icon, title, description }: Props) {
  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto">
      <div className="bg-bg-card rounded-2xl border border-divider p-10 flex flex-col items-center text-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-bg-section flex items-center justify-center text-text-secondary">
          <Icon size={22} strokeWidth={1.75} />
        </div>
        <h1 className="text-lg font-bold text-text-primary">{title}</h1>
        <p className="text-sm text-text-secondary max-w-sm">{description}</p>
        <span className="mt-1 text-xs font-semibold uppercase tracking-wide text-accent bg-accent-glow px-3 py-1 rounded-full">
          In arrivo
        </span>
      </div>
    </div>
  );
}
