"use client";

import { useAnalysis } from "@/lib/hooks/useAnalysis";
import Header from "@/components/Header";
import FileTable from "@/components/FileTable";
import StorageChart from "@/components/StorageChart";
import { formatBytes } from "@/lib/utils";
import { RefreshCw, AlertCircle, HardDrive } from "lucide-react";

export default function LargeFilesPage() {
  const { data, loading, error, refetch } = useAnalysis();

  if (loading) {
    return (
      <>
        <Header title="Large Files" subtitle="Calculating storage usage…" />
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 48 }}>
          <div className="spinner" style={{ width: 32, height: 32 }} />
        </div>
      </>
    );
  }

  if (error || !data) {
    return (
      <>
        <Header title="Large Files" />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: 48 }}>
          <AlertCircle size={40} color="var(--google-red)" />
          <div style={{ color: "var(--text-secondary)", fontSize: 14 }}>{error ?? "No data."}</div>
          <button className="btn-primary" onClick={refetch} id="retry-large-btn"><RefreshCw size={14} /> Retry</button>
        </div>
      </>
    );
  }

  const { largeFiles, storageByType, summary } = data;

  return (
    <>
      <Header
        title="Large Files"
        subtitle={`${formatBytes(summary.knownStorageBytes)} of known storage across ${summary.filesScanned} files`}
      />
      <div style={{ padding: 32, display: "flex", flexDirection: "column", gap: 24 }}>

        {/* Storage summary cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
          <div className="card" style={{ padding: "18px 20px" }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-hint)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
              Known Storage
            </div>
            <div style={{ fontSize: 28, fontWeight: 700, color: "var(--google-blue)" }}>
              {formatBytes(summary.knownStorageBytes)}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>
              from {summary.filesScanned - summary.filesWithUnknownSize} files with known size
            </div>
          </div>
          <div className="card" style={{ padding: "18px 20px" }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-hint)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
              Largest File
            </div>
            {largeFiles[0] ? (
              <>
                <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)" }}>
                  {formatBytes(largeFiles[0].sizeBytes ?? 0)}
                </div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {largeFiles[0].name}
                </div>
              </>
            ) : <div style={{ color: "var(--text-hint)", fontSize: 14 }}>None</div>}
          </div>
          <div className="card" style={{ padding: "18px 20px" }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-hint)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
              Size Unavailable
            </div>
            <div style={{ fontSize: 28, fontWeight: 700, color: "var(--text-secondary)" }}>
              {summary.filesWithUnknownSize}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>
              Native Google Docs/Sheets/Slides
            </div>
          </div>
        </div>

        {/* Chart */}
        <StorageChart data={storageByType} />

        {/* Notice about unavailable sizes */}
        {summary.filesWithUnknownSize > 0 && (
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
              background: "var(--google-blue-light)",
              border: "1px solid #c5d9f7",
              borderRadius: 8,
              padding: "12px 16px",
              fontSize: 13,
              color: "var(--google-blue)",
            }}
          >
            <HardDrive size={16} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>
              <strong>{summary.filesWithUnknownSize} native Google files</strong> (Docs, Sheets, Slides) do not report a file
              size because they are stored in Google's proprietary format. They are excluded from size calculations
              but counted in the total files scanned.
            </span>
          </div>
        )}

        {/* Table */}
        <div className="card" style={{ overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>
            Top {largeFiles.length} Largest Files
          </div>
          <FileTable files={largeFiles} showRank />
        </div>
      </div>
    </>
  );
}
