import React from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { usePipelineStore } from "@/store/usePipelineStore";

type TrendDatum = {
  date: string;
  value: number;
};

export default function TrendChart(): React.JSX.Element {
  const trend = usePipelineStore((s) => (s.chartData?.trend ?? []) as TrendDatum[]);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-slate-900">Trend Overview</h3>
        <p className="mt-1 text-xs text-slate-500">
          Time-based movement across the detected metric.
        </p>
      </div>

      {trend.length === 0 ? (
        <div className="flex h-[280px] items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-500">
          No trend data available yet.
        </div>
      ) : (
        <div className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={trend}
              margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                dataKey="date"
                tick={{ fill: "#64748b", fontSize: 12 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: "#64748b", fontSize: 12 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: 12,
                  border: "1px solid #e2e8f0",
                  boxShadow: "0 4px 14px rgba(15,23,42,0.06)",
                }}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke="#4f46e5"
                strokeWidth={3}
                dot={{ r: 3, fill: "#4f46e5" }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
