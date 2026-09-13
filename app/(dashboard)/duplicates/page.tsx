"use client";

import { useAnalysis } from "@/lib/hooks/useAnalysis";
import Header from "@/components/Header";
import DuplicateGroupCard from "@/components/DuplicateGroup";
import { RefreshCw, AlertCircle, CheckCircle2 } from "lucide-react";

export default function DuplicatesPage() {
  const { data, loading, error, refetch } = useAnalysis();

  if (loading) {
    return (
      <>
        <Header title="Duplicates" subtitle="Finding duplicate files…" />
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 48 }}>
          <div className="spinner" style={{ width: 32, height: 32 }} />
        </div>
      </>
    );
  }

  if (error || !data) {
    return (
      <>
        <Header title="Duplicates" />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: 48 }}>
          <AlertCircle size={40} color="var(--google-red)" />
          <div style={{ color: "var(--text-secondary)", fontSize: 14 }}>{error ?? "No data."}</div>
          <button className="btn-primary" onClick={refetch} id="retry-dupes-btn"><RefreshCw size={14} /> Retry</button>
        </div>
      </>
    );
  }

  const { duplicates, summary } = data;

  return (
    <>
      <Header
        title="Potential Duplicates"
        subtitle={`${summary.duplicateGroups} group${summary.duplicateGroups !== 1 ? "s" : ""} found across ${summary.filesScanned} files`}
      />
      <div style={{ padding: 32, display: "flex", flexDirection: "column", gap: 20 }}>

        {/* Legend */}
        <div className="card" style={{ padding: "14px 20px", display: "flex", gap: 24, flexWrap: "wrap", fontSize: 12 }}>
          {[
            { label: "Exact duplicate", desc: "Same MD5 checksum — binary identical files", bg: "#fce8e6", text: "#c5221f", border: "#f5c6c2" },
            { label: "Strong candidate", desc: "Same name, type, and file size", bg: "#fef7e0", text: "#b06000", border: "#f9d976" },
            { label: "Possible candidate", desc: "Same name and type, different sizes", bg: "var(--google-blue-light)", text: "var(--google-blue)", border: "#c5d9f7" },
          ].map(({ label, desc, bg, text, border }) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ background: bg, color: text, border: `1px solid ${border}`, borderRadius: 20, padding: "2px 8px", fontSize: 11, fontWeight: 600 }}>
                {label}
              </span>
              <span style={{ color: "var(--text-secondary)" }}>{desc}</span>
            </div>
          ))}
        </div>

        {/* Groups */}
        {duplicates.length === 0 ? (
          <div
            className="card"
            style={{ padding: "48px 24px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}
          >
            <CheckCircle2 size={40} color="var(--google-green)" />
            <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)" }}>No duplicate files found</div>
            <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
              No files in your Drive appear to be duplicates.
            </div>
          </div>
        ) : (
          duplicates.map((group, i) => (
            <DuplicateGroupCard key={i} group={group} index={i} />
          ))
        )}
      </div>
    </>
  );
}
