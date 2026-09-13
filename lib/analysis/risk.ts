import { DriveFile, DrivePermission } from "../drive/types";

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH";

export interface RiskResult {
  level: RiskLevel;
  /** Numeric 0–100 for sorting (higher = riskier). */
  score: number;
  reasons: string[];
}

export interface RankedFile {
  file: DriveFile;
  risk: RiskResult;
}

/**
 * Permission type meanings (documented for clarity):
 *
 *   "anyone"  — The file is accessible to anyone with the link,
 *               regardless of whether they have a Google account.
 *               This is the closest thing to "public" in Drive.
 *
 *   "domain"  — Accessible to all users in a specific Google Workspace
 *               domain (internal org sharing). NOT public.
 *
 *   "group"   — Shared with a specific Google Group.
 *
 *   "user"    — Shared with one specific person.
 *
 * Risk levels:
 *
 *   HIGH   — "anyone" permission exists (potentially public)
 *   MEDIUM — domain-wide sharing, or external users, or ≥5 non-owner
 *            recipients (broad exposure)
 *   LOW    — private (owner only) or limited internal sharing
 */
export function scoreRisk(file: DriveFile): RiskResult {
  const reasons: string[] = [];
  let score = 0;

  const perms = file.permissions;

  // ── Check for anyone-with-link ─────────────────────────────────
  const anyonePerms = perms.filter((p) => p.type === "anyone");
  for (const p of anyonePerms) {
    if (p.role === "writer" || p.role === "organizer") {
      reasons.push("Anyone with the link can edit this file.");
      score = Math.max(score, 90);
    } else if (p.role === "commenter") {
      reasons.push("Anyone with the link can comment on this file.");
      score = Math.max(score, 80);
    } else if (p.role === "reader") {
      reasons.push("Anyone with the link can view this file.");
      score = Math.max(score, 75);
    }
  }

  if (anyonePerms.length > 0) {
    return { level: "HIGH", score, reasons };
  }

  // ── Check for domain-wide sharing ────────────────────────────────
  const domainPerms = perms.filter((p) => p.type === "domain");
  for (const p of domainPerms) {
    const domainName = p.domain ?? "your organization";
    if (p.role === "writer") {
      reasons.push(`Everyone in ${domainName} can edit this file.`);
      score = Math.max(score, 65);
    } else {
      reasons.push(`Everyone in ${domainName} can view this file.`);
      score = Math.max(score, 55);
    }
  }

  // ── Check for external users ──────────────────────────────────────
  const ownerDomain = file.ownerEmail?.split("@")[1];
  const externalUsers = perms.filter(
    (p) =>
      p.type === "user" &&
      p.role !== "owner" &&
      p.emailAddress &&
      ownerDomain &&
      !p.emailAddress.endsWith(`@${ownerDomain}`)
  );
  if (externalUsers.length > 0) {
    const emails = externalUsers
      .slice(0, 2)
      .map((p) => p.emailAddress)
      .join(", ");
    const extra = externalUsers.length > 2 ? ` and ${externalUsers.length - 2} more` : "";
    reasons.push(`Shared with external users: ${emails}${extra}.`);
    score = Math.max(score, 60);
  }

  // ── Check for large number of recipients ─────────────────────────
  const nonOwnerPerms = perms.filter((p) => p.role !== "owner");
  if (nonOwnerPerms.length >= 5) {
    reasons.push(`Shared with ${nonOwnerPerms.length} people or groups.`);
    score = Math.max(score, 50);
  }

  if (score >= 50) {
    return { level: "MEDIUM", score, reasons };
  }

  // ── LOW risk ──────────────────────────────────────────────────────
  const nonOwnerCount = perms.filter((p) => p.role !== "owner").length;
  if (nonOwnerCount === 0) {
    reasons.push("This file is private — only you can access it.");
    score = 10;
  } else {
    reasons.push("Shared with a small number of trusted collaborators.");
    score = 25;
  }

  return { level: "LOW", score, reasons };
}

/**
 * Returns all files with their risk assessment, sorted by risk score descending.
 * Folders are excluded.
 */
export function analyzeRisk(files: DriveFile[]): RankedFile[] {
  return files
    .filter((f) => !f.isFolder && !f.trashed)
    .map((file) => ({ file, risk: scoreRisk(file) }))
    .sort((a, b) => b.risk.score - a.risk.score);
}

/** Filters to only HIGH and MEDIUM risk files. */
export function getRiskyFiles(files: DriveFile[]): RankedFile[] {
  return analyzeRisk(files).filter((r) => r.risk.level !== "LOW");
}
