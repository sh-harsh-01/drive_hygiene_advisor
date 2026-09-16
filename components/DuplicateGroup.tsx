"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, ExternalLink, Copy } from "lucide-react";
import { DuplicateGroup as DuplicateGroupType } from "@/lib/analysis/duplicates";
import { formatBytes, formatDate } from "@/lib/utils";

interface Props {
  group: DuplicateGroupType;
  index: number;
}

const TIER_CONFIG = {
  EXACT: { label: "Exact duplicate", bg: "#fce8e6", text: "#c5221f", border: "#f5c6c2" },
  STRONG: { label: "Strong candidate", bg: "#fef7e0", text: "#b06000", border: "#f9d976" },
  POSSIBLE: { label: "Possible candidate", bg: "var(--google-blue-light)", text: "var(--google-blue)", border: "#c5d9f7" },
};

export default function DuplicateGroup({ group, index }: Props) {
  const [expanded, setExpanded] = useState(index < 3);
  const cfg = TIER_CONFIG[group.tier];

  return (
    <div
      className="card fade-in"
      style={{ overflow: "hidden" }}
    >
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          width: "100%",
          padding: "16px 20px",
          display: "flex",
          alignItems: "center",
          gap: 12,
          background: "none",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
          transition: "background 0.12s",
        }}
        onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "var(--surface-2)")}
        onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "none")}
        id={`dup-group-${index}`}
        aria-expanded={expanded}
      >
        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <Copy size={16} color={cfg.text} />
          <span style={{ fontWeight: 600, fontSize: 14, color: "var(--text-primary)" }}>
            {group.files[0].name}
          </span>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              background: cfg.bg,
              color: cfg.text,
              border: `1px solid ${cfg.border}`,
              borderRadius: 20,
              padding: "2px 8px",
            }}
          >
            {cfg.label}
          </span>
          <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            {group.files.length} files
          </span>
          {group.combinedBytes !== null && (
            <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
              · {formatBytes(group.combinedBytes)} combined
            </span>
          )}
        </div>
        {expanded ? <ChevronUp size={16} color="var(--text-hint)" /> : <ChevronDown size={16} color="var(--text-hint)" />}
      </button>

      {/* Reason */}
      {expanded && (
        <div style={{ borderTop: "1px solid var(--border)" }}>
          <div
            style={{
              background: cfg.bg,
              padding: "10px 20px",
              fontSize: 12,
              color: cfg.text,
              borderLeft: `3px solid ${cfg.text}`,
            }}
          >
            {group.reason}
          </div>

          {/* File list */}
          <div>
            {group.files.map((file, i) => (
              <div
                key={file.id}
                style={{
                  padding: "12px 20px",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  borderTop: i === 0 ? "none" : "1px solid var(--border)",
                  fontSize: 13,
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500, color: "var(--text-primary)" }}>{file.name}</div>
                  <div style={{ fontSize: 11, color: "var(--text-hint)", marginTop: 2 }}>
                    {file.sizeBytes !== null ? formatBytes(file.sizeBytes) : "Size unavailable"}{" "}
                    · Modified {formatDate(file.modifiedTime)}
                    {file.md5Checksum && (
                      <span style={{ marginLeft: 8, fontFamily: "monospace", fontSize: 10 }}>
                        MD5: {file.md5Checksum.slice(0, 8)}…
                      </span>
                    )}
                  </div>
                </div>
                {file.webViewLink && (
                  <a
                    href={file.webViewLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Open in Drive"
                    style={{ color: "var(--text-hint)", display: "flex" }}
                  >
                    <ExternalLink size={14} />
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
