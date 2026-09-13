"use client";

import { type LucideIcon } from "lucide-react";

interface StatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  color?: "blue" | "red" | "yellow" | "green" | "gray";
  subtitle?: string;
}

const COLORS = {
  blue:   { bg: "var(--google-blue-light)",  text: "var(--google-blue)",  icon: "#1a73e8" },
  red:    { bg: "var(--google-red-light)",   text: "var(--google-red)",   icon: "#ea4335" },
  yellow: { bg: "var(--google-yellow-light)", text: "#b06000",            icon: "#f9ab00" },
  green:  { bg: "var(--google-green-light)", text: "var(--google-green)", icon: "#34a853" },
  gray:   { bg: "var(--surface-3)",          text: "var(--text-secondary)", icon: "#5f6368" },
};

export default function StatCard({ label, value, icon: Icon, color = "blue", subtitle }: StatCardProps) {
  const c = COLORS[color];
  return (
    <div
      className="card fade-in"
      style={{
        padding: "20px 22px",
        display: "flex",
        alignItems: "flex-start",
        gap: 14,
        transition: "box-shadow 0.15s, transform 0.15s",
        cursor: "default",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 16px rgba(0,0,0,0.12)";
        (e.currentTarget as HTMLElement).style.transform = "translateY(-1px)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.boxShadow = "";
        (e.currentTarget as HTMLElement).style.transform = "";
      }}
    >
      <div
        style={{
          width: 42,
          height: 42,
          borderRadius: 10,
          background: c.bg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Icon size={20} color={c.icon} strokeWidth={2} />
      </div>
      <div>
        <div style={{ fontSize: 26, fontWeight: 700, color: c.text, lineHeight: 1.1 }}>{value}</div>
        <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 3 }}>{label}</div>
        {subtitle && (
          <div style={{ fontSize: 11, color: "var(--text-hint)", marginTop: 2 }}>{subtitle}</div>
        )}
      </div>
    </div>
  );
}
