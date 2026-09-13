import { DriveFile } from "../drive/types";

export type MimeCategory =
  | "Documents"
  | "Spreadsheets"
  | "Presentations"
  | "PDFs"
  | "Images"
  | "Videos"
  | "Archives"
  | "Other";

export interface StorageByCategory {
  category: MimeCategory;
  bytes: number;
  fileCount: number;
  /** Percentage of total known storage (0–100). */
  percentage: number;
}

export interface StorageResult {
  totalKnownBytes: number;
  filesWithUnknownSize: number;
  topFiles: DriveFile[];
  byCategory: StorageByCategory[];
}

/** Maps a MIME type to a human-readable category. */
export function mimeToCategory(mimeType: string): MimeCategory {
  if (
    mimeType === "application/vnd.google-apps.document" ||
    mimeType.includes("wordprocessingml") ||
    mimeType === "text/plain" ||
    mimeType === "text/csv" ||
    mimeType === "application/rtf"
  )
    return "Documents";

  if (
    mimeType === "application/vnd.google-apps.spreadsheet" ||
    mimeType.includes("spreadsheetml")
  )
    return "Spreadsheets";

  if (
    mimeType === "application/vnd.google-apps.presentation" ||
    mimeType.includes("presentationml")
  )
    return "Presentations";

  if (mimeType === "application/pdf") return "PDFs";

  if (mimeType.startsWith("image/")) return "Images";

  if (mimeType.startsWith("video/") || mimeType.startsWith("audio/")) return "Videos";

  if (
    mimeType === "application/zip" ||
    mimeType === "application/x-zip-compressed" ||
    mimeType === "application/x-tar" ||
    mimeType === "application/gzip" ||
    mimeType === "application/x-7z-compressed" ||
    mimeType === "application/x-rar-compressed"
  )
    return "Archives";

  return "Other";
}

/**
 * Analyzes storage usage across a file set.
 *
 * NOTE: Native Google Docs, Sheets, and Slides do not report a file size
 * because they are stored in Google's native format. These are counted
 * separately as "filesWithUnknownSize" and never treated as 0 bytes.
 */
export function analyzeStorage(files: DriveFile[], topN = 20): StorageResult {
  const nonFolders = files.filter((f) => !f.isFolder && !f.trashed);

  const filesWithSize = nonFolders.filter((f) => f.sizeBytes !== null);
  const filesWithUnknownSize = nonFolders.filter((f) => f.sizeBytes === null).length;

  const totalKnownBytes = filesWithSize.reduce((sum, f) => sum + (f.sizeBytes ?? 0), 0);

  // Top N largest files
  const topFiles = [...filesWithSize]
    .sort((a, b) => (b.sizeBytes ?? 0) - (a.sizeBytes ?? 0))
    .slice(0, topN);

  // Storage by category (only files with known sizes)
  const categoryMap = new Map<MimeCategory, { bytes: number; count: number }>();
  for (const file of filesWithSize) {
    const cat = mimeToCategory(file.mimeType);
    const existing = categoryMap.get(cat) ?? { bytes: 0, count: 0 };
    categoryMap.set(cat, {
      bytes: existing.bytes + (file.sizeBytes ?? 0),
      count: existing.count + 1,
    });
  }

  const byCategory: StorageByCategory[] = Array.from(categoryMap.entries())
    .map(([category, { bytes, count: fileCount }]) => ({
      category,
      bytes,
      fileCount,
      percentage: totalKnownBytes > 0 ? Math.round((bytes / totalKnownBytes) * 100) : 0,
    }))
    .sort((a, b) => b.bytes - a.bytes);

  return { totalKnownBytes, filesWithUnknownSize, topFiles, byCategory };
}
