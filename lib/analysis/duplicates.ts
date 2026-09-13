import { DriveFile } from "../drive/types";

export type DuplicateTier = "EXACT" | "STRONG" | "POSSIBLE";

export interface DuplicateGroup {
  tier: DuplicateTier;
  files: DriveFile[];
  /** Total bytes of all files in the group (null if any size is unknown). */
  combinedBytes: number | null;
  /** Human-readable explanation of why these files were grouped. */
  reason: string;
}

/**
 * Normalizes a filename for duplicate comparison.
 *
 * Strips:
 *   - File extension
 *   - Version suffixes: (1), (2), v2, v3, etc.
 *   - Common copy patterns: "copy of", "- copy", "- backup", "final", "draft"
 *   - Date-like suffixes: 2026-09-01, 20260901
 *   - Trailing whitespace and punctuation
 *
 * Returns lowercase normalized string for comparison.
 *
 * Conservative approach: only strips patterns that are clearly cosmetic.
 * We don't strip numbers that appear mid-word (e.g. "Q3 Report" stays as-is).
 */
export function normalizeName(filename: string): string {
  // Remove extension
  const withoutExt = filename.replace(/\.[^/.]+$/, "");

  return withoutExt
    .toLowerCase()
    // Version patterns: (1), (2), v2, v3, - v2, etc.
    .replace(/\s*\(\d+\)\s*$/, "")
    .replace(/\s*[-–]\s*v\d+(\.\d+)?\s*$/i, "")
    .replace(/\s+v\d+(\.\d+)?\s*$/i, "")
    // Copy / backup patterns
    .replace(/\s*[-–]\s*(copy|backup|bak|final|draft)\s*$/i, "")
    .replace(/^copy\s+of\s+/i, "")
    // Date suffixes: 2026-09-01 or 20260901
    .replace(/\s*[-_]?\d{4}[-_]\d{2}[-_]\d{2}\s*$/, "")
    .replace(/\s*[-_]?\d{8}\s*$/, "")
    // Trailing punctuation/spaces
    .replace(/[-–_\s]+$/, "")
    .trim();
}

/**
 * Groups files into duplicate candidates using a three-tier approach:
 *
 * EXACT     — identical md5Checksum (binary identical, strongest evidence)
 * STRONG    — same normalized name + same MIME type + same sizeBytes
 * POSSIBLE  — same normalized name + same MIME type, but size differs or unknown
 *
 * Files already grouped as EXACT are excluded from lower tiers.
 * Files without a checksum skip the EXACT tier and proceed to STRONG/POSSIBLE.
 *
 * Folders are excluded from duplicate analysis.
 */
export function findDuplicates(files: DriveFile[]): DuplicateGroup[] {
  const nonFolders = files.filter((f) => !f.isFolder && !f.trashed);
  const groups: DuplicateGroup[] = [];
  const accountedIds = new Set<string>();

  // ── Tier 1: EXACT (md5Checksum) ───────────────────────────────
  const byChecksum = new Map<string, DriveFile[]>();
  for (const file of nonFolders) {
    if (!file.md5Checksum) continue;
    const bucket = byChecksum.get(file.md5Checksum) ?? [];
    bucket.push(file);
    byChecksum.set(file.md5Checksum, bucket);
  }
  for (const [, bucket] of byChecksum) {
    if (bucket.length < 2) continue;
    const combined = bucket.reduce((sum, f) => (f.sizeBytes != null ? sum + f.sizeBytes : sum), 0);
    groups.push({
      tier: "EXACT",
      files: bucket,
      combinedBytes: combined,
      reason: "These files have the same checksum — they are binary identical.",
    });
    bucket.forEach((f) => accountedIds.add(f.id));
  }

  // ── Tier 2: STRONG (normalized name + MIME + same size) ────────
  // ── Tier 3: POSSIBLE (normalized name + MIME, different/unknown size) ─
  type GroupKey = string;
  const byNameMime = new Map<GroupKey, DriveFile[]>();

  for (const file of nonFolders) {
    if (accountedIds.has(file.id)) continue;
    const key = `${normalizeName(file.name)}::${file.mimeType}`;
    const bucket = byNameMime.get(key) ?? [];
    bucket.push(file);
    byNameMime.set(key, bucket);
  }

  for (const [, bucket] of byNameMime) {
    if (bucket.length < 2) continue;

    // Check if all files with known sizes share the same size
    const knownSizes = bucket.map((f) => f.sizeBytes).filter((s) => s !== null) as number[];
    const allSameSize =
      knownSizes.length === bucket.length &&
      knownSizes.length > 0 &&
      knownSizes.every((s) => s === knownSizes[0]);

    if (allSameSize) {
      const combined = knownSizes.reduce((sum, s) => sum + s, 0);
      groups.push({
        tier: "STRONG",
        files: bucket,
        combinedBytes: combined,
        reason:
          "These files share the same name (after removing version/copy suffixes), file type, and size.",
      });
    } else {
      groups.push({
        tier: "POSSIBLE",
        files: bucket,
        combinedBytes: null,
        reason:
          "These files share the same name and file type but have different sizes — they may be different versions of the same document.",
      });
    }
  }

  // Sort: EXACT first, then STRONG, then POSSIBLE
  const tierOrder: Record<DuplicateTier, number> = { EXACT: 0, STRONG: 1, POSSIBLE: 2 };
  groups.sort((a, b) => tierOrder[a.tier] - tierOrder[b.tier]);

  return groups;
}
