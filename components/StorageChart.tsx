"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { StorageByCategory } from "@/lib/analysis/storage";
import { formatBytes } from "@/lib/utils";

interface Props {
  data: StorageByCategory[];
}

const CATEGORY_COLORS: Record<string, string> = {
  Videos:        "#1a73e8",
  Archives:      "#ea4335",
  Images:        "#34a853",
  PDFs:          "#fbbc04",
  Documents:     "#4285f4",
  Spreadsheets:  "#0f9d58",
  Presentations: "#ff7043",
  Other:         "#9e9e9e",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload?.length) {
    const d = payload[0].payload as StorageByCategory;
    return (
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          padding: "10px 14px",
          fontSize: 13,
          boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: 4 }}>{d.category}</div>
        <div style={{ color: "var(--text-secondary)" }}>{formatBytes(d.bytes)}</div>
        <div style={{ color: "var(--text-hint)", fontSize: 11 }}>
          {d.fileCount} file{d.fileCount !== 1 ? "s" : ""} · {d.percentage}%
        </div>
      </div>
    );
  }
  return null;
};

export default function StorageChart({ data }: Props) {
  if (!data || data.length === 0) return null;

  const chartData = [...data].sort((a, b) => b.bytes - a.bytes);

  return (
    <div className="card" style={{ padding: "20px 24px" }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 16, textTransform: "uppercase", letterSpacing: "0.05em" }}>
        Storage by Type
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={chartData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
          <XAxis
            dataKey="category"
            tick={{ fontSize: 11, fill: "var(--text-secondary)" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tickFormatter={(v: number) => formatBytes(v, 0)}
            tick={{ fontSize: 10, fill: "var(--text-hint)" }}
            axisLine={false}
            tickLine={false}
            width={68}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: "var(--surface-3)", radius: 4 }} />
          <Bar dataKey="bytes" radius={[4, 4, 0, 0]}>
            {chartData.map((entry) => (
              <Cell key={entry.category} fill={CATEGORY_COLORS[entry.category] ?? "#9e9e9e"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
