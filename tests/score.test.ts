import { describe, it, expect } from "vitest";
import { computeHygieneScore } from "../lib/analysis/score";
import { RankedFile } from "../lib/analysis/risk";
import { DuplicateGroup } from "../lib/analysis/duplicates";
import { DriveFile } from "../lib/drive/types";

const base: DriveFile = {
  id: "x", name: "f.pdf", mimeType: "application/pdf", sizeBytes: 1000,
  createdTime: "2026-01-01T00:00:00Z", modifiedTime: "2026-01-01T00:00:00Z",
  permissions: [], shared: false, trashed: false, isFolder: false,
};

const makeRanked = (level: "HIGH" | "MEDIUM" | "LOW", id: string): RankedFile => ({
  file: { ...base, id },
  risk: { level, score: level === "HIGH" ? 85 : level === "MEDIUM" ? 55 : 10, reasons: [] },
});

const makeDupGroup = (ids: string[]): DuplicateGroup => ({
  tier: "STRONG",
  files: ids.map((id) => ({ ...base, id })),
  combinedBytes: 1000,
  reason: "test",
});

describe("computeHygieneScore", () => {
  it("returns 100 when no files", () => {
    const result = computeHygieneScore(0, [], []);
    expect(result.score).toBe(100);
    expect(result.label).toBe("Excellent");
  });

  it("returns Excellent for clean Drive", () => {
    const result = computeHygieneScore(10, [], []);
    expect(result.score).toBeGreaterThanOrEqual(85);
    expect(result.label).toBe("Excellent");
  });

  it("lowers score with HIGH risk files", () => {
    const risky = [makeRanked("HIGH", "a"), makeRanked("HIGH", "b"), makeRanked("HIGH", "c")];
    const clean = computeHygieneScore(10, [], []);
    const risky_result = computeHygieneScore(10, risky, []);
    expect(risky_result.score).toBeLessThan(clean.score);
  });

  it("lowers score with duplicates", () => {
    const dups = [makeDupGroup(["a", "b"]), makeDupGroup(["c", "d"])];
    const clean = computeHygieneScore(10, [], []);
    const dup_result = computeHygieneScore(10, [], dups);
    expect(dup_result.score).toBeLessThan(clean.score);
  });

  it("HIGH risk penalizes more than MEDIUM", () => {
    const oneHigh = computeHygieneScore(10, [makeRanked("HIGH", "a")], []);
    const oneMedium = computeHygieneScore(10, [makeRanked("MEDIUM", "a")], []);
    expect(oneHigh.score).toBeLessThan(oneMedium.score);
  });

  it("label Needs Attention for score 40–69", () => {
    // Force a low score with many high risk files
    const risky = Array.from({ length: 5 }, (_, i) => makeRanked("HIGH", `h${i}`));
    const result = computeHygieneScore(6, risky, []);
    expect(["Needs Attention", "Poor"]).toContain(result.label);
  });

  it("breakdown sums to approximate score", () => {
    const result = computeHygieneScore(10, [], []);
    const { riskScore, duplicateScore, storageScore } = result.breakdown;
    const expected = Math.round(riskScore * 0.4 + duplicateScore * 0.3 + storageScore * 0.3);
    expect(result.score).toBe(expected);
  });
});
