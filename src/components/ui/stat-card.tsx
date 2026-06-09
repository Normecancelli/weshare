"use client";

interface StatCardProps {
  label: string;
  value: string | number;
  subtitle?: string;
  trend?: { value: number; label?: string } | null;
  color?: "accent" | "success" | "coral" | "lavender";
}

const colorMap = {
  accent: "border-t-accent",
  success: "border-t-success",
  coral: "border-t-coral",
  lavender: "border-t-lavender",
};

export function StatCard({
  label,
  value,
  subtitle,
  trend,
  color = "accent",
}: StatCardProps) {
  return (
    <div
      className={`bg-bg-card border border-border rounded-2xl p-4 md:p-6 border-t-3 ${colorMap[color]} hover:-translate-y-0.5 hover:shadow-md transition-all`}
    >
      <div className="text-[11px] md:text-[13px] text-text-secondary font-medium mb-1 md:mb-2">
        {label}
      </div>
      <div className="text-xl md:text-3xl font-bold tracking-tight mb-1 md:mb-2">
        {value}
      </div>
      {subtitle && (
        <div className="text-[10px] md:text-xs text-text-secondary">
          {subtitle}
        </div>
      )}
      {trend && (
        <div className="flex items-center gap-1">
          <span
            className={`text-[10px] md:text-xs font-semibold ${
              trend.value > 0
                ? "text-success"
                : trend.value < 0
                  ? "text-coral"
                  : "text-text-secondary"
            }`}
          >
            {trend.value > 0 ? "+" : trend.value < 0 ? "-" : ""}{" "}
            {Math.abs(trend.value)}
          </span>
          {trend.label && (
            <span className="text-[10px] md:text-xs text-text-gentle">
              {trend.label}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
