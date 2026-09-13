"use client";

import { DriveFile } from "@/lib/drive/types";
import { formatBytes, formatDate, mimeLabel } from "@/lib/utils";
import { ExternalLink } from "lucide-react";

interface Props {
  files: DriveFile[];
  showRank?: boolean;
}

export default function FileTable({ files, showRank = true }: Props) {
  if (files.length === 0) {
    return (
      <div
        style={{
          textAlign: "center",
          padding: "48px 24px",
          color: "var(--text-hint)",
          fontSize: 14,
        }}
      >
        No files found.
      </div>
    );
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: 13,
        }}
      >
        <thead>
          <tr style={{ background: "var(--surface-2)" }}>
            {showRank && (
              <th style={thStyle}>#</th>
            )}
            <th style={{ ...thStyle, textAlign: "left", width: "45%" }}>File</th>
            <th style={thStyle}>Type</th>
            <th style={thStyle}>Size</th>
            <th style={thStyle}>Modified</th>
            <th style={thStyle}></th>
          </tr>
        </thead>
        <tbody>
          {files.map((file, i) => (
            <tr
              key={file.id}
              style={{ borderTop: "1px solid var(--border)", transition: "background 0.1s" }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "var(--surface-2)")}
              onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "")}
            >
              {showRank && (
                <td style={{ ...tdStyle, color: "var(--text-hint)", width: 36, textAlign: "center" }}>
                  {i + 1}
                </td>
              )}
              <td style={{ ...tdStyle, fontWeight: 500, color: "var(--text-primary)" }}>
                {file.name}
              </td>
              <td style={{ ...tdStyle, color: "var(--text-secondary)", textAlign: "center" }}>
                <span
                  style={{
                    background: "var(--surface-3)",
                    borderRadius: 4,
                    padding: "2px 7px",
                    fontSize: 11,
                    fontWeight: 500,
                  }}
                >
                  {mimeLabel(file.mimeType)}
                </span>
              </td>
              <td style={{ ...tdStyle, textAlign: "right", fontFamily: "monospace", fontWeight: 500 }}>
                {file.sizeBytes !== null ? (
                  formatBytes(file.sizeBytes)
                ) : (
                  <span style={{ color: "var(--text-hint)", fontFamily: "inherit", fontSize: 11 }}>
                    Unavailable
                  </span>
                )}
              </td>
              <td style={{ ...tdStyle, textAlign: "center", color: "var(--text-secondary)" }}>
                {formatDate(file.modifiedTime)}
              </td>
              <td style={{ ...tdStyle, textAlign: "center" }}>
                {file.webViewLink ? (
                  <a
                    href={file.webViewLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Open in Google Drive"
                    style={{ color: "var(--text-hint)", display: "inline-flex" }}
                  >
                    <ExternalLink size={13} />
                  </a>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: "10px 14px",
  fontSize: 11,
  fontWeight: 600,
  color: "var(--text-secondary)",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  textAlign: "center",
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  padding: "12px 14px",
};
