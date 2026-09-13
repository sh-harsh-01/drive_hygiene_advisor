"use client";

import { RiskLevel } from "@/lib/analysis/risk";

interface Props {
  level: RiskLevel;
  size?: "sm" | "md";
}

const CONFIG: Record<RiskLevel, { label: string; bg: string; text: string; dot: string }> = {
  HIGH:   { label: "High",   bg: "var(--google-red-light)",   text: "var(--google-red)",   dot: "#ea4335" },
  MEDIUM: { label: "Medium", bg: "var(--google-yellow-light)", text: "#b06000",             dot: "#f9ab00" },
  LOW:    { label: "Low",    bg: "var(--google-green-light)",  text: "var(--google-green)", dot: "#34a853" },
};

export default function RiskBadge({ level, size = "md" }: Props) {
  const c = CONFIG[level];
  const isSmall = size === "sm";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: isSmall ? 4 : 6,
        background: c.bg,
        color: c.text,
        fontWeight: 600,
        fontSize: isSmall ? 11 : 12,
        borderRadius: 20,
        padding: isSmall ? "2px 8px" : "4px 10px",
        whiteSpace: "nowrap",
      }}
    >
      <span
        style={{
          width: isSmall ? 6 : 7,
          height: isSmall ? 6 : 7,
          borderRadius: "50%",
          background: c.dot,
          display: "inline-block",
          flexShrink: 0,
        }}
      />
      {c.label}
    </span>
  );
}
