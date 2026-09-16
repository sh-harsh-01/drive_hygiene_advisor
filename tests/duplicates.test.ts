import { describe, it, expect } from "vitest";
import { findDuplicates, normalizeName } from "../lib/analysis/duplicates";
import { DriveFile } from "../lib/drive/types";

const base: DriveFile = {
  id: "x",
  name: "Test.pdf",
  mimeType: "application/pdf",
  sizeBytes: 1000,
  createdTime: "2026-01-01T00:00:00Z",
  modifiedTime: "2026-01-01T00:00:00Z",
  permissions: [],
  shared: false,
  trashed: false,
  isFolder: false,
};

describe("normalizeName", () => {
  it("strips extension", () => expect(normalizeName("Report.pdf")).toBe("report"));
  it("strips (1) suffix", () => expect(normalizeName("Report (1).pdf")).toBe("report"));
  it("strips - Copy suffix", () => expect(normalizeName("Report - Copy.pdf")).toBe("report"));
  it("strips v2 suffix", () => expect(normalizeName("Report v2.pdf")).toBe("report"));
  it("strips - Backup suffix", () => expect(normalizeName("Budget - Backup.xlsx")).toBe("budget"));
  it("strips 'Copy of' prefix", () => expect(normalizeName("Copy of Report.pdf")).toBe("report"));
  it("strips date suffix", () => expect(normalizeName("Report 2026-09-01.pdf")).toBe("report"));
  it("preserves Q3 in middle", () => expect(normalizeName("Q3 Report.pdf")).toBe("q3 report"));
});

describe("findDuplicates — EXACT tier", () => {
  it("groups files with identical md5Checksum", () => {
    const files: DriveFile[] = [
      { ...base, id: "a", md5Checksum: "abc123" },
      { ...base, id: "b", md5Checksum: "abc123" },
      { ...base, id: "c", md5Checksum: "xyz999" },
    ];
    const groups = findDuplicates(files);
    const exact = groups.filter((g) => g.tier === "EXACT");
    expect(exact).toHaveLength(1);
    expect(exact[0].files.map((f) => f.id).sort()).toEqual(["a", "b"]);
  });

  it("does not create EXACT group for a single file with a checksum", () => {
    const files: DriveFile[] = [{ ...base, id: "a", md5Checksum: "abc123" }];
    const groups = findDuplicates(files);
    expect(groups.filter((g) => g.tier === "EXACT")).toHaveLength(0);
  });
});

describe("findDuplicates — STRONG tier", () => {
  it("groups files with same normalized name + MIME + exact size", () => {
    const files: DriveFile[] = [
      { ...base, id: "a", name: "Project Plan.pdf", sizeBytes: 5000 },
      { ...base, id: "b", name: "Project Plan (1).pdf", sizeBytes: 5000 },
      { ...base, id: "c", name: "Project Plan - Copy.pdf", sizeBytes: 5000 },
    ];
    const groups = findDuplicates(files);
    const strong = groups.filter((g) => g.tier === "STRONG");
    expect(strong).toHaveLength(1);
    expect(strong[0].files).toHaveLength(3);
  });

  it("does not group files with same name but different size as STRONG", () => {
    const files: DriveFile[] = [
      { ...base, id: "a", name: "Report.pdf", sizeBytes: 1000 },
      { ...base, id: "b", name: "Report v2.pdf", sizeBytes: 2000 },
    ];
    const groups = findDuplicates(files);
    expect(groups.filter((g) => g.tier === "STRONG")).toHaveLength(0);
  });

  it("does not group files with same name but different MIME type", () => {
    const files: DriveFile[] = [
      { ...base, id: "a", name: "Report.pdf", mimeType: "application/pdf", sizeBytes: 1000 },
      { ...base, id: "b", name: "Report.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", sizeBytes: 1000 },
    ];
    const groups = findDuplicates(files);
    expect(groups.filter((g) => g.tier === "STRONG")).toHaveLength(0);
  });
});

describe("findDuplicates — POSSIBLE tier", () => {
  it("groups files with same normalized name + MIME but different sizes", () => {
    const files: DriveFile[] = [
      { ...base, id: "a", name: "Notes.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", sizeBytes: 1000 },
      { ...base, id: "b", name: "Notes v2.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", sizeBytes: 2000 },
    ];
    const groups = findDuplicates(files);
    const possible = groups.filter((g) => g.tier === "POSSIBLE");
    expect(possible).toHaveLength(1);
  });
});

describe("findDuplicates — exclusions", () => {
  it("excludes folders", () => {
    const files: DriveFile[] = [
      { ...base, id: "a", isFolder: true, name: "Docs", mimeType: "application/vnd.google-apps.folder", sizeBytes: null },
      { ...base, id: "b", isFolder: true, name: "Docs", mimeType: "application/vnd.google-apps.folder", sizeBytes: null },
    ];
    expect(findDuplicates(files)).toHaveLength(0);
  });

  it("excludes trashed files", () => {
    const files: DriveFile[] = [
      { ...base, id: "a", trashed: false },
      { ...base, id: "b", trashed: true },
    ];
    expect(findDuplicates(files)).toHaveLength(0);
  });
});

describe("findDuplicates — missing checksum", () => {
  it("files without md5Checksum skip EXACT tier and fall through to STRONG/POSSIBLE", () => {
    // Both files have the same name+MIME+size but no checksum — should be STRONG
    const files: DriveFile[] = [
      { ...base, id: "a", name: "Budget.xlsx", mimeType: "application/vnd.ms-excel", sizeBytes: 3000, md5Checksum: undefined },
      { ...base, id: "b", name: "Budget (1).xlsx", mimeType: "application/vnd.ms-excel", sizeBytes: 3000, md5Checksum: undefined },
    ];
    const groups = findDuplicates(files);
    // No EXACT group (no checksums)
    expect(groups.filter((g) => g.tier === "EXACT")).toHaveLength(0);
    // STRONG group because same normalized name + MIME + same size
    const strong = groups.filter((g) => g.tier === "STRONG");
    expect(strong).toHaveLength(1);
    expect(strong[0].files.map((f) => f.id).sort()).toEqual(["a", "b"]);
  });

  it("EXACT-matched files are excluded from STRONG/POSSIBLE tiers", () => {
    // Files a and b share a checksum (EXACT) — must not also appear in STRONG/POSSIBLE
    const files: DriveFile[] = [
      { ...base, id: "a", name: "Report.pdf", sizeBytes: 5000, md5Checksum: "same-hash" },
      { ...base, id: "b", name: "Report (1).pdf", sizeBytes: 5000, md5Checksum: "same-hash" },
    ];
    const groups = findDuplicates(files);
    expect(groups.filter((g) => g.tier === "EXACT")).toHaveLength(1);
    // The same files must not appear in STRONG or POSSIBLE
    expect(groups.filter((g) => g.tier !== "EXACT")).toHaveLength(0);
  });
});

describe("findDuplicates — missing size (native Google files)", () => {
  it("groups files with null size + same name+MIME as POSSIBLE (not STRONG)", () => {
    // Native Google Docs have sizeBytes=null — cannot be STRONG (unknown size)
    const googleDoc = "application/vnd.google-apps.document";
    const files: DriveFile[] = [
      { ...base, id: "a", name: "Meeting Notes.gdoc", mimeType: googleDoc, sizeBytes: null, md5Checksum: undefined },
      { ...base, id: "b", name: "Meeting Notes (1).gdoc", mimeType: googleDoc, sizeBytes: null, md5Checksum: undefined },
    ];
    const groups = findDuplicates(files);
    // Size is null for both — not all files have known sizes → POSSIBLE
    expect(groups.filter((g) => g.tier === "EXACT")).toHaveLength(0);
    expect(groups.filter((g) => g.tier === "STRONG")).toHaveLength(0);
    const possible = groups.filter((g) => g.tier === "POSSIBLE");
    expect(possible).toHaveLength(1);
    // combinedBytes must be null when sizes are unknown
    expect(possible[0].combinedBytes).toBeNull();
  });

  it("POSSIBLE group combinedBytes is null when any file has unknown size", () => {
    const files: DriveFile[] = [
      { ...base, id: "a", name: "Doc.pdf", sizeBytes: 1000, md5Checksum: undefined },
      { ...base, id: "b", name: "Doc v2.pdf", sizeBytes: null, md5Checksum: undefined },
    ];
    const groups = findDuplicates(files);
    const possible = groups.filter((g) => g.tier === "POSSIBLE");
    expect(possible).toHaveLength(1);
    expect(possible[0].combinedBytes).toBeNull();
  });

  it("STRONG group combinedBytes equals sum of all file sizes", () => {
    const files: DriveFile[] = [
      { ...base, id: "a", name: "Archive.zip", mimeType: "application/zip", sizeBytes: 5000 },
      { ...base, id: "b", name: "Archive (1).zip", mimeType: "application/zip", sizeBytes: 5000 },
    ];
    const groups = findDuplicates(files);
    const strong = groups.filter((g) => g.tier === "STRONG");
    expect(strong).toHaveLength(1);
    expect(strong[0].combinedBytes).toBe(10000);
  });
});

describe("findDuplicates — sort order", () => {
  it("returns groups ordered EXACT → STRONG → POSSIBLE", () => {
    const files: DriveFile[] = [
      // POSSIBLE pair
      { ...base, id: "p1", name: "Notes.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", sizeBytes: 100 },
      { ...base, id: "p2", name: "Notes v2.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", sizeBytes: 200 },
      // STRONG pair
      { ...base, id: "s1", name: "Budget.pdf", sizeBytes: 500 },
      { ...base, id: "s2", name: "Budget (1).pdf", sizeBytes: 500 },
      // EXACT pair
      { ...base, id: "e1", md5Checksum: "hash-xyz", sizeBytes: 999 },
      { ...base, id: "e2", md5Checksum: "hash-xyz", sizeBytes: 999 },
    ];
    const groups = findDuplicates(files);
    expect(groups[0].tier).toBe("EXACT");
    expect(groups[1].tier).toBe("STRONG");
    expect(groups[2].tier).toBe("POSSIBLE");
  });
});
