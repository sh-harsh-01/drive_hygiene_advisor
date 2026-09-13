import { DuplicateGroup } from "./duplicates";
import { RankedFile } from "./risk";

export type HygieneLabel = "Poor" | "Needs Attention" | "Good" | "Excellent";

export interface HygieneScore {
  score: number; // 0–100
  label: HygieneLabel;
  /** Breakdown of how the score was computed. */
  breakdown: {
    riskScore: number;       // 0–100 component
    duplicateScore: number;  // 0–100 component
    storageScore: number;    // 0–100 component
  };
}

/**
 * Computes an overall Drive Hygiene Score (0–100).
 *
 * IMPORTANT: This score is an attention indicator, not a security or
 * compliance rating. A score of 100 does not mean the Drive is secure —
 * it means there are fewer items that warrant the user's attention.
 *
 * Weighting:
 *   Risk component      40%  (based on proportion of high/medium-risk files)
 *   Duplicate component 30%  (based on proportion of files in duplicate groups)
 *   Storage component   30%  (always 100 in prototype — reserved for quota pressure)
 *
 * Component scoring:
 *   riskScore:      100 - (highWeight * highPct + mediumWeight * mediumPct) capped at 0
 *   duplicateScore: 100 - (duplicateFilePct * 100) capped at 0
 *   storageScore:   100 (flat — quota data not available in prototype without Drive About API)
 */
export function computeHygieneScore(
  totalFiles: number,
  riskyFiles: RankedFile[],
  duplicateGroups: DuplicateGroup[]
): HygieneScore {
  if (totalFiles === 0) {
    return { score: 100, label: "Excellent", breakdown: { riskScore: 100, duplicateScore: 100, storageScore: 100 } };
  }

  // ── Risk component ───────────────────────────────────────────────
  const highCount = riskyFiles.filter((r) => r.risk.level === "HIGH").length;
  const mediumCount = riskyFiles.filter((r) => r.risk.level === "MEDIUM").length;

  // High-risk files penalize 3× more than medium-risk
  const weightedRiskPct = (highCount * 3 + mediumCount) / (totalFiles * 3);
  const riskScore = Math.max(0, Math.round(100 - weightedRiskPct * 100));

  // ── Duplicate component ──────────────────────────────────────────
  const duplicateFileIds = new Set(duplicateGroups.flatMap((g) => g.files.map((f) => f.id)));
  const duplicateFilePct = duplicateFileIds.size / totalFiles;
  const duplicateScore = Math.max(0, Math.round(100 - duplicateFilePct * 100));

  // ── Storage component (flat for prototype) ───────────────────────
  const storageScore = 100;

  // ── Weighted total ───────────────────────────────────────────────
  const score = Math.round(riskScore * 0.4 + duplicateScore * 0.3 + storageScore * 0.3);

  const label = labelFor(score);

  return { score, label, breakdown: { riskScore, duplicateScore, storageScore } };
}

function labelFor(score: number): HygieneLabel {
  if (score >= 85) return "Excellent";
  if (score >= 70) return "Good";
  if (score >= 40) return "Needs Attention";
  return "Poor";
}
