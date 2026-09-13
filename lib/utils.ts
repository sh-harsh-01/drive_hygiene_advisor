/**
 * Shared formatting utilities for the UI layer.
 * These are pure functions — no React dependencies.
 */

/** Format bytes into a human-readable string. */
export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))} ${sizes[i]}`;
}

/** Format an ISO 8601 date string to a short human-readable date. */
export function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

/** Map a MIME type to a short human-readable label. */
export function mimeLabel(mimeType: string): string {
  const map: Record<string, string> = {
    "application/pdf": "PDF",
    "application/zip": "ZIP",
    "application/x-zip-compressed": "ZIP",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "Word",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "Excel",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": "PowerPoint",
    "application/vnd.google-apps.document": "Google Doc",
    "application/vnd.google-apps.spreadsheet": "Google Sheet",
    "application/vnd.google-apps.presentation": "Google Slides",
    "application/vnd.google-apps.folder": "Folder",
    "image/jpeg": "JPEG",
    "image/png": "PNG",
    "image/vnd.adobe.photoshop": "Photoshop",
    "video/mp4": "MP4",
    "text/plain": "Text",
    "text/csv": "CSV",
  };
  if (mimeType in map) return map[mimeType];
  if (mimeType.startsWith("image/")) return "Image";
  if (mimeType.startsWith("video/")) return "Video";
  if (mimeType.startsWith("audio/")) return "Audio";
  return "File";
}

/** Format a number as a human-friendly string (e.g. 4200 → "4.2K") */
export function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

/** Sharing summary string for the risky files table. */
export function sharingLabel(permissions: { type: string; role: string; domain?: string; emailAddress?: string }[]): string {
  const anyone = permissions.find((p) => p.type === "anyone");
  if (anyone) return `Anyone / ${capitalize(anyone.role)}`;
  const domain = permissions.find((p) => p.type === "domain");
  if (domain) return `${domain.domain ?? "Domain"} / ${capitalize(domain.role)}`;
  const external = permissions.filter(
    (p) => p.type === "user" && p.role !== "owner"
  );
  if (external.length > 0) return `${external.length} user${external.length > 1 ? "s" : ""}`;
  return "Owner only";
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
