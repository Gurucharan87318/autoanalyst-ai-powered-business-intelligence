// components/dashboard/KPICard.tsx
import React, { useMemo } from "react";

type Props = {
  title: string;
  value: string | number | null | undefined;
  trend?: string;
  format?: "number" | "currency" | "compact";
  currency?: string; // e.g. "INR", "USD"
};

function formatValue(
  value: string | number | null | undefined,
  opts: { format: Props["format"]; currency: string }
): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value;

  if (!Number.isFinite(value)) return "—";

  const { format, currency } = opts;

  if (format === "currency") {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  }

  if (format === "compact") {
    return new Intl.NumberFormat(undefined, {
      notation: "compact",
      maximumFractionDigits: 2,
    }).format(value);
  }

  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 2,
  }).format(value);
}

export function KPICard({
  title,
  value,
  trend,
  format = "number",
  currency = "INR",
}: Props): React.JSX.Element {
  const formatted = useMemo(
    () => formatValue(value, { format, currency }),
    [value, format, currency]
  );

  const trendColor =
    trend && trend.trim().startsWith("-") ? "text-rose-600" : "text-emerald-600";

  return (
    <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200 font-sans">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium text-slate-500">{title}</div>
          <div className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
            {formatted}
          </div>
        </div>

        {trend ? (
          <div className={`text-xs font-semibold ${trendColor} mt-1 whitespace-nowrap`}>
            {trend}
          </div>
        ) : (
          <div className="mt-1 text-xs font-semibold text-slate-400"> </div>
        )}
      </div>
    </div>
  );
}
