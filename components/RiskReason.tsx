"use client";

interface Props {
  reason: string;
}

export default function RiskReason({ reason }: Props) {
  return (
    <span
      style={{
        display: "inline-block",
        background: "var(--surface-3)",
        color: "var(--text-secondary)",
        fontSize: 11,
        borderRadius: 4,
        padding: "2px 8px",
        border: "1px solid var(--border)",
        lineHeight: 1.5,
      }}
    >
      {reason}
    </span>
  );
}
