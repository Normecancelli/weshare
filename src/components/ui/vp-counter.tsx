"use client";

interface VpCounterProps {
  current: number;
  max: number;
  label?: string;
}

export function VpCounter({
  current,
  max,
  label = "VP Carrello Personale",
}: VpCounterProps) {
  const percentage = Math.min((current / max) * 100, 100);
  const remaining = Math.max(max - current, 0);
  const isNearLimit = percentage > 85;
  const isOverLimit = current > max;

  return (
    <div className="bg-bg-card border border-border rounded-xl p-3 md:p-4">
      <div className="flex justify-between items-center mb-2">
        <span className="text-xs md:text-sm font-semibold text-text-primary">
          {label}
        </span>
        <span
          className={`text-sm md:text-lg font-bold ${
            isOverLimit
              ? "text-coral"
              : isNearLimit
                ? "text-warning"
                : "text-accent-hover"
          }`}
        >
          {current.toFixed(2)}{" "}
          <span className="text-text-secondary font-normal text-xs md:text-sm">
            / {max}
          </span>
        </span>
      </div>
      <div className="h-2 md:h-3 bg-bg-section rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${
            isOverLimit
              ? "bg-coral"
              : isNearLimit
                ? "bg-warning"
                : "bg-gradient-to-r from-accent to-accent-hover"
          }`}
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
      </div>
      <div className="flex justify-between mt-1 text-[10px] md:text-xs text-text-gentle">
        <span>{Math.round(percentage)}% utilizzato</span>
        <span>
          {isOverLimit
            ? `Superato di ${(current - max).toFixed(2)} VP!`
            : `Rimangono ${remaining.toFixed(2)} VP`}
        </span>
      </div>
    </div>
  );
}
