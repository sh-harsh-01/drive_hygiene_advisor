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
