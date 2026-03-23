import React from "react";
import {
  BarChart,
  Bar,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { usePipelineStore } from "@/store/usePipelineStore";

type CategoryDatum = {
  category: string;
  value: number;
};

export default function CategoryBarChart(): React.JSX.Element {
  const categories = usePipelineStore(
    (s) => (s.chartData?.categories ?? []) as CategoryDatum[]
  );

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-slate-900">Category Performance</h3>
        <p className="mt-1 text-xs text-slate-500">
          Top categories detected from the uploaded dataset.
        </p>
      </div>

      {categories.length === 0 ? (
        <div className="flex h-[280px] items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-500">
          No category data available yet.
        </div>
      ) : (
        <div className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={categories}
              margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                dataKey="category"
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
                cursor={{ fill: "#f8fafc" }}
                contentStyle={{
                  borderRadius: 12,
                  border: "1px solid #e2e8f0",
                  boxShadow: "0 4px 14px rgba(15,23,42,0.06)",
                }}
              />
              <Bar
                dataKey="value"
                fill="#0f172a"
                radius={[8, 8, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
