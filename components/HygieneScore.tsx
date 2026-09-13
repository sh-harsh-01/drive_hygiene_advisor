"use client";

import { HygieneScore } from "@/lib/analysis/score";

interface Props {
  score: HygieneScore;
}

const LABEL_COLORS: Record<string, { bg: string; text: string; ring: string }> = {
  Excellent:        { bg: "#e6f4ea", text: "#137333", ring: "#34a853" },
  Good:             { bg: "#e8f0fe", text: "#1a73e8", ring: "#1a73e8" },
  "Needs Attention":{ bg: "#fef7e0", text: "#b06000", ring: "#fbbc04" },
  Poor:             { bg: "#fce8e6", text: "#c5221f", ring: "#ea4335" },
};

/** Returns the SVG arc path for the gauge ring. */
function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const x1 = cx + r * Math.cos(toRad(startAngle));
  const y1 = cy + r * Math.sin(toRad(startAngle));
  const x2 = cx + r * Math.cos(toRad(endAngle));
  const y2 = cy + r * Math.sin(toRad(endAngle));
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`;
}

export default function HygieneScoreGauge({ score }: Props) {
  const colors = LABEL_COLORS[score.label] ?? LABEL_COLORS["Good"];

  // Semi-circle gauge: from 180° to 360° (left to right)
  const START = 180;
  const END = 360;
  const totalAngle = END - START;
  const fillAngle = START + (score.score / 100) * totalAngle;

  const cx = 100, cy = 95, r = 70;

  const trackPath = describeArc(cx, cy, r, START, END);
  const fillPath = describeArc(cx, cy, r, START, fillAngle);

  const breakdown = score.breakdown;

  return (
    <div className="card fade-in" style={{ padding: 28 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 16, textTransform: "uppercase", letterSpacing: "0.05em" }}>
        Drive Hygiene Score
      </div>

      {/* Gauge SVG */}
      <div style={{ display: "flex", alignItems: "center", gap: 32 }}>
        <div style={{ position: "relative", width: 200, height: 110 }}>
          <svg width="200" height="110" viewBox="0 0 200 110">
            {/* Track */}
            <path
              d={trackPath}
              fill="none"
              stroke="var(--surface-3)"
              strokeWidth="14"
              strokeLinecap="round"
            />
            {/* Fill */}
            <path
              d={fillPath}
              fill="none"
              stroke={colors.ring}
              strokeWidth="14"
              strokeLinecap="round"
              style={{ filter: `drop-shadow(0 0 6px ${colors.ring}40)` }}
            />
          </svg>

          {/* Center text */}
          <div
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              textAlign: "center",
              paddingBottom: 4,
            }}
          >
            <div style={{ fontSize: 40, fontWeight: 700, lineHeight: 1, color: colors.text }}>
              {score.score}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-hint)", marginTop: 2 }}>out of 100</div>
          </div>
        </div>

        {/* Label + breakdown */}
        <div style={{ flex: 1 }}>
          <div
            style={{
              display: "inline-block",
              background: colors.bg,
              color: colors.text,
              fontWeight: 600,
              fontSize: 15,
              borderRadius: 20,
              padding: "4px 14px",
              marginBottom: 16,
            }}
          >
            {score.label}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[
              { label: "Risk", value: breakdown.riskScore, weight: "40%" },
              { label: "Duplicates", value: breakdown.duplicateScore, weight: "30%" },
              { label: "Storage", value: breakdown.storageScore, weight: "30%" },
            ].map(({ label, value, weight }) => (
              <div key={label}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--text-secondary)", marginBottom: 4 }}>
                  <span>{label} <span style={{ color: "var(--text-hint)" }}>({weight})</span></span>
                  <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{value}</span>
                </div>
                <div style={{ height: 5, background: "var(--surface-3)", borderRadius: 3, overflow: "hidden" }}>
                  <div
                    style={{
                      height: "100%",
                      width: `${value}%`,
                      background: value >= 70 ? colors.ring : value >= 40 ? "#fbbc04" : "#ea4335",
                      borderRadius: 3,
                      transition: "width 0.6s ease",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>

          <p style={{ fontSize: 11, color: "var(--text-hint)", marginTop: 12, lineHeight: 1.5 }}>
            This score is an <em>attention indicator</em>, not a security or compliance rating.
          </p>
        </div>
      </div>
    </div>
  );
}
