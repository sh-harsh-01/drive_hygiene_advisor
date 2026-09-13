"use client";

import { useAnalysis } from "@/lib/hooks/useAnalysis";
import Header from "@/components/Header";
import RiskBadge from "@/components/RiskBadge";
import RiskReason from "@/components/RiskReason";
import { formatDate, mimeLabel, sharingLabel } from "@/lib/utils";
import { ExternalLink, RefreshCw, AlertCircle, CheckCircle2 } from "lucide-react";

export default function RiskyFilesPage() {
  const { data, loading, error, refetch } = useAnalysis();

  if (loading) {
    return (
      <>
        <Header title="Risky Files" subtitle="Evaluating sharing permissions…" />
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 48 }}>
          <div className="spinner" style={{ width: 32, height: 32 }} />
        </div>
      </>
    );
  }

  if (error || !data) {
    return (
      <>
        <Header title="Risky Files" />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: 48 }}>
          <AlertCircle size={40} color="var(--google-red)" />
          <div style={{ color: "var(--text-secondary)", fontSize: 14 }}>{error ?? "No data."}</div>
          <button className="btn-primary" onClick={refetch} id="retry-risky-btn"><RefreshCw size={14} /> Retry</button>
        </div>
      </>
    );
  }

  const { riskyFiles, summary } = data;
  const highCount = riskyFiles.filter((r) => r.risk.level === "HIGH").length;
  const mediumCount = riskyFiles.filter((r) => r.risk.level === "MEDIUM").length;

  return (
    <>
      <Header
        title="Risky Files"
        subtitle={`${summary.riskyFiles} file${summary.riskyFiles !== 1 ? "s" : ""} with elevated sharing risk`}
      />
      <div style={{ padding: 32, display: "flex", flexDirection: "column", gap: 24 }}>

        {/* Summary cards */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
          <div className="card" style={{ padding: "16px 20px", borderLeft: "3px solid var(--google-red)" }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-hint)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>High Risk</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: "var(--google-red)" }}>{highCount}</div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Anyone with the link can access</div>
          </div>
          <div className="card" style={{ padding: "16px 20px", borderLeft: "3px solid #f9ab00" }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-hint)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Medium Risk</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: "#b06000" }}>{mediumCount}</div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Domain-wide or external sharing</div>
          </div>
          <div className="card" style={{ padding: "16px 20px", borderLeft: "3px solid var(--google-blue)" }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-hint)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Total Flagged</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: "var(--google-blue)" }}>{riskyFiles.length}</div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>of {summary.filesScanned} files scanned</div>
          </div>
        </div>

        {/* Risk explanation */}
        <div className="card" style={{ padding: "14px 18px", fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6 }}>
          <strong style={{ color: "var(--text-primary)" }}>How risk is assigned: </strong>
          <strong style={{ color: "var(--google-red)" }}>High</strong> — "Anyone with the link" permission (potentially public).{" "}
          <strong style={{ color: "#b06000" }}>Medium</strong> — Shared domain-wide, with external users, or with 5+ people.{" "}
          <strong style={{ color: "var(--google-green)" }}>Low</strong> — Private or limited internal sharing. Risk is based on sharing metadata only, not file content.
        </div>

        {/* Table */}
        {riskyFiles.length === 0 ? (
          <div className="card" style={{ padding: "48px 24px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            <CheckCircle2 size={40} color="var(--google-green)" />
            <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)" }}>No risky files found</div>
            <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
              Your current Drive permissions look good.
            </div>
          </div>
        ) : (
          <div className="card" style={{ overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "var(--surface-2)" }}>
                  <th style={{ padding: "10px 16px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>File</th>
                  <th style={{ padding: "10px 14px", fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", textAlign: "center" }}>Risk</th>
                  <th style={{ padding: "10px 14px", fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", textAlign: "center" }}>Sharing</th>
                  <th style={{ padding: "10px 14px", fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", textAlign: "left" }}>Why</th>
                  <th style={{ padding: "10px 14px", fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", textAlign: "center" }}>Modified</th>
                  <th style={{ padding: "10px 14px" }}></th>
                </tr>
              </thead>
              <tbody>
                {riskyFiles.map(({ file, risk }) => (
                  <tr
                    key={file.id}
                    style={{ borderTop: "1px solid var(--border)", transition: "background 0.1s" }}
                    onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "var(--surface-2)")}
                    onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "")}
                  >
                    <td style={{ padding: "14px 16px" }}>
                      <div style={{ fontWeight: 500 }}>{file.name}</div>
                      <div style={{ fontSize: 11, color: "var(--text-hint)", marginTop: 2 }}>
                        {mimeLabel(file.mimeType)}
                        {file.ownerEmail && ` · ${file.ownerEmail}`}
                      </div>
                    </td>
                    <td style={{ padding: "14px", textAlign: "center" }}>
                      <RiskBadge level={risk.level} />
                    </td>
                    <td style={{ padding: "14px", textAlign: "center", fontSize: 12, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                      {sharingLabel(file.permissions)}
                    </td>
                    <td style={{ padding: "14px" }}>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {risk.reasons.map((r) => (
                          <RiskReason key={r} reason={r} />
                        ))}
                      </div>
                    </td>
                    <td style={{ padding: "14px", textAlign: "center", color: "var(--text-secondary)", fontSize: 12, whiteSpace: "nowrap" }}>
                      {formatDate(file.modifiedTime)}
                    </td>
                    <td style={{ padding: "14px", textAlign: "center" }}>
                      {file.webViewLink && (
                        <a
                          href={file.webViewLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Open in Drive"
                          style={{ color: "var(--text-hint)", display: "inline-flex" }}
                        >
                          <ExternalLink size={13} />
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
