"use client";

import { useAnalysis } from "@/lib/hooks/useAnalysis";
import Header from "@/components/Header";
import HygieneScoreGauge from "@/components/HygieneScore";
import StatCard from "@/components/StatCard";
import RiskBadge from "@/components/RiskBadge";
import RiskReason from "@/components/RiskReason";
import { ShieldAlert, Copy, HardDrive, FileStack, RefreshCw, AlertCircle, Copy as CopyIcon, Package, CloudCog } from "lucide-react";
import { formatBytes, formatDate, mimeLabel } from "@/lib/utils";
import Link from "next/link";
import { signIn } from "next-auth/react";

function LoadingState() {
  const steps = ["Preparing scan…", "Fetching files…", "Analyzing duplicates…", "Scoring risks…", "Complete"];
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 24,
        padding: 48,
      }}
    >
      <div className="spinner" style={{ width: 40, height: 40 }} />
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", marginBottom: 8 }}>
          Analyzing your Drive…
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {steps.map((step, i) => (
            <div key={step} style={{ fontSize: 13, color: i === 1 ? "var(--google-blue)" : "var(--text-hint)", display: "flex", alignItems: "center", gap: 6, justifyContent: "center" }}>
              {i === 1 && <span className="spinner" style={{ width: 12, height: 12 }} />}
              {step}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function NeedsAuthState() {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 20,
        padding: 48,
        textAlign: "center",
      }}
    >
      <div style={{ width: 72, height: 72, borderRadius: 20, background: "var(--google-blue-light)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <CloudCog size={36} color="var(--google-blue)" />
      </div>
      <div>
        <div style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", marginBottom: 8 }}>
          Connect your Google Drive
        </div>
        <div style={{ fontSize: 14, color: "var(--text-secondary)", maxWidth: 400, lineHeight: 1.6, marginBottom: 24 }}>
          Sign in with Google to scan your real Drive for duplicates, large files, and risky sharing permissions.
          The app only requests read-only access to file metadata — it cannot read or download file contents.
        </div>
        <button
          id="connect-drive-btn"
          className="btn-primary"
          onClick={() => signIn("google")}
          style={{ fontSize: 14, padding: "12px 28px" }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" style={{ flexShrink: 0 }}>
            <path fill="#fff" d="M9 3.48c1.69 0 2.83.73 3.48 1.34l2.54-2.48C13.46.89 11.43 0 9 0 5.48 0 2.44 2.02.96 4.96l2.91 2.26C4.6 5.05 6.62 3.48 9 3.48z"/>
            <path fill="#fff" d="M17.64 9.2c0-.74-.06-1.28-.19-1.84H9v3.34h4.96c-.1.83-.64 2.08-1.84 2.92l2.84 2.2c1.7-1.57 2.68-3.88 2.68-6.62z"/>
            <path fill="#fff" d="M3.88 10.78A5.54 5.54 0 0 1 3.58 9c0-.62.11-1.22.29-1.78L.96 4.96A9.008 9.008 0 0 0 0 9c0 1.45.35 2.82.96 4.04l2.92-2.26z"/>
            <path fill="#fff" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.84-2.2c-.76.53-1.78.9-3.12.9-2.38 0-4.4-1.57-5.12-3.74L.97 13.04C2.45 15.98 5.48 18 9 18z"/>
          </svg>
          Sign in with Google
        </button>
        <div style={{ marginTop: 16, fontSize: 12, color: "var(--text-hint)" }}>
          Scope: <code style={{ background: "var(--surface-3)", padding: "2px 6px", borderRadius: 4 }}>drive.metadata.readonly</code> — no file content access
        </div>
      </div>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        padding: 48,
      }}
    >
      <AlertCircle size={48} color="var(--google-red)" />
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", marginBottom: 6 }}>
          We couldn't complete the Drive analysis.
        </div>
        <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 20 }}>{message}</div>
        <button className="btn-primary" onClick={onRetry} id="retry-btn">
          <RefreshCw size={15} /> Retry
        </button>
      </div>
    </div>
  );
}

export default function OverviewPage() {
  const { data, loading, error, refetch, scanStatus } = useAnalysis();

  if (loading) return (
    <>
      <Header title="Overview" subtitle="Drive Hygiene Advisor" />
      <LoadingState />
    </>
  );

  if (scanStatus === "needs_auth") return (
    <>
      <Header title="Overview" subtitle="Drive Hygiene Advisor" />
      <NeedsAuthState />
    </>
  );

  if (error || !data) return (
    <>
      <Header title="Overview" subtitle="Drive Hygiene Advisor" />
      <ErrorState message={error ?? "No data returned."} onRetry={refetch} />
    </>
  );


  const { summary, riskyFiles, duplicates, largeFiles } = data;

  // Top 5 items needing attention
  const topRisky = riskyFiles.slice(0, 3);
  const topDuplicates = duplicates.slice(0, 2);
  const topLarge = largeFiles.slice(0, 3);

  return (
    <>
      <Header title="Overview" subtitle={`${summary.filesScanned} files scanned`} />
      <div style={{ padding: 32, display: "flex", flexDirection: "column", gap: 28 }}>

        {/* Score + Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 16 }}>
          <div style={{ gridColumn: "1 / -1" }}>
            <HygieneScoreGauge score={summary.hygieneScore} />
          </div>
          <StatCard
            label="Risky Files"
            value={summary.riskyFiles}
            icon={ShieldAlert}
            color="red"
            subtitle="High or Medium risk"
          />
          <StatCard
            label="Duplicate Groups"
            value={summary.duplicateGroups}
            icon={Copy}
            color="yellow"
          />
          <StatCard
            label="Files Scanned"
            value={summary.filesScanned}
            icon={FileStack}
            color="blue"
            subtitle={summary.filesWithUnknownSize > 0 ? `${summary.filesWithUnknownSize} without size data` : undefined}
          />
          <StatCard
            label="Known Storage"
            value={formatBytes(summary.knownStorageBytes)}
            icon={HardDrive}
            color="green"
          />
        </div>

        {/* Needs Attention section */}
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", marginBottom: 14 }}>
            Files Needing Attention
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>

            {topRisky.map(({ file, risk }) => (
              <div
                key={file.id}
                className="card fade-in"
                style={{ padding: "14px 18px", display: "flex", alignItems: "center", gap: 14 }}
              >
                <ShieldAlert size={18} color={risk.level === "HIGH" ? "var(--google-red)" : "#f9ab00"} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{file.name}</div>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2, display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {risk.reasons.map((r) => <RiskReason key={r} reason={r} />)}
                  </div>
                </div>
                <RiskBadge level={risk.level} />
              </div>
            ))}

            {topDuplicates.map((group, i) => (
              <div
                key={i}
                className="card fade-in"
                style={{ padding: "14px 18px", display: "flex", alignItems: "center", gap: 14 }}
              >
                <CopyIcon size={18} color="#f9ab00" />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{group.files[0].name}</div>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                    {group.files.length} similar files
                    {group.combinedBytes !== null ? ` · ${formatBytes(group.combinedBytes)} combined` : ""}
                  </div>
                </div>
                <span style={{ fontSize: 11, fontWeight: 600, background: "#fef7e0", color: "#b06000", borderRadius: 20, padding: "3px 10px", border: "1px solid #f9d976" }}>
                  {group.tier === "EXACT" ? "Exact" : group.tier === "STRONG" ? "Strong" : "Possible"}
                </span>
              </div>
            ))}

            {topLarge.map((file) => (
              <div
                key={file.id}
                className="card fade-in"
                style={{ padding: "14px 18px", display: "flex", alignItems: "center", gap: 14 }}
              >
                <Package size={18} color="var(--text-secondary)" />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{file.name}</div>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                    {mimeLabel(file.mimeType)} · Modified {formatDate(file.modifiedTime)}
                  </div>
                </div>
                <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-secondary)", fontFamily: "monospace" }}>
                  {formatBytes(file.sizeBytes ?? 0)}
                </span>
              </div>
            ))}

          </div>
          <div style={{ marginTop: 14, display: "flex", gap: 12 }}>
            <Link href="/risky-files" className="btn-secondary" id="view-all-risky-btn" style={{ fontSize: 13, padding: "8px 16px" }}>
              View all risky files →
            </Link>
            <Link href="/duplicates" className="btn-secondary" id="view-all-duplicates-btn" style={{ fontSize: 13, padding: "8px 16px" }}>
              View all duplicates →
            </Link>
            <Link href="/large-files" className="btn-secondary" id="view-all-large-btn" style={{ fontSize: 13, padding: "8px 16px" }}>
              View large files →
            </Link>
          </div>
        </div>

      </div>
    </>
  );
}
