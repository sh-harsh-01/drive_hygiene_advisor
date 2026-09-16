import { describe, it, expect } from "vitest";
import { analyzeStorage, mimeToCategory } from "../lib/analysis/storage";
import { DriveFile } from "../lib/drive/types";

const base: DriveFile = {
  id: "x",
  name: "Test",
  mimeType: "application/pdf",
  sizeBytes: 1000,
  createdTime: "2026-01-01T00:00:00Z",
  modifiedTime: "2026-01-01T00:00:00Z",
  permissions: [],
  shared: false,
  trashed: false,
  isFolder: false,
};

describe("mimeToCategory", () => {
  it("PDF → PDFs", () => expect(mimeToCategory("application/pdf")).toBe("PDFs"));
  it("zip → Archives", () => expect(mimeToCategory("application/zip")).toBe("Archives"));
  it("mp4 → Videos", () => expect(mimeToCategory("video/mp4")).toBe("Videos"));
  it("jpeg → Images", () => expect(mimeToCategory("image/jpeg")).toBe("Images"));
  it("Google Doc → Documents", () => expect(mimeToCategory("application/vnd.google-apps.document")).toBe("Documents"));
  it("Google Sheet → Spreadsheets", () => expect(mimeToCategory("application/vnd.google-apps.spreadsheet")).toBe("Spreadsheets"));
  it("pptx → Presentations", () => expect(mimeToCategory("application/vnd.openxmlformats-officedocument.presentationml.presentation")).toBe("Presentations"));
  it("unknown → Other", () => expect(mimeToCategory("application/x-custom")).toBe("Other"));
});

describe("analyzeStorage", () => {
  const files: DriveFile[] = [
    { ...base, id: "a", name: "Big.mp4", mimeType: "video/mp4", sizeBytes: 5000 },
    { ...base, id: "b", name: "Small.pdf", mimeType: "application/pdf", sizeBytes: 1000 },
    { ...base, id: "c", name: "No Size", mimeType: "application/vnd.google-apps.document", sizeBytes: null },
    { ...base, id: "d", name: "Trashed", mimeType: "application/pdf", sizeBytes: 9999, trashed: true },
    { ...base, id: "e", name: "Folder", mimeType: "application/vnd.google-apps.folder", sizeBytes: null, isFolder: true },
  ];

  const result = analyzeStorage(files, 10);

  it("counts total known bytes correctly", () => {
    expect(result.totalKnownBytes).toBe(6000); // a + b, excludes trashed and folder
  });

  it("counts files with unknown size", () => {
    expect(result.filesWithUnknownSize).toBe(1); // c (Google Doc)
  });

  it("sorts top files by size descending", () => {
    expect(result.topFiles[0].id).toBe("a"); // 5000
    expect(result.topFiles[1].id).toBe("b"); // 1000
  });

  it("excludes trashed files", () => {
    const ids = result.topFiles.map((f) => f.id);
    expect(ids).not.toContain("d");
  });

  it("excludes folders", () => {
    const ids = result.topFiles.map((f) => f.id);
    expect(ids).not.toContain("e");
  });

  it("groups by category correctly", () => {
    const videoCategory = result.byCategory.find((c) => c.category === "Videos");
    expect(videoCategory?.bytes).toBe(5000);
    expect(videoCategory?.fileCount).toBe(1);
  });

  it("calculates percentage", () => {
    const video = result.byCategory.find((c) => c.category === "Videos");
    expect(video?.percentage).toBe(83); // 5000/6000 ≈ 83%
  });

  it("respects topN limit", () => {
    const manyFiles = Array.from({ length: 25 }, (_, i) => ({
      ...base,
      id: `f${i}`,
      name: `File${i}.pdf`,
      sizeBytes: 1000 * (i + 1),
    }));
    const r = analyzeStorage(manyFiles, 10);
    expect(r.topFiles).toHaveLength(10);
  });
});

describe("analyzeStorage — storage sort order", () => {
  it("topFiles are sorted by sizeBytes descending (largest first)", () => {
    const files: DriveFile[] = [
      { ...base, id: "small", name: "Small.pdf", sizeBytes: 100 },
      { ...base, id: "large", name: "Large.pdf", sizeBytes: 99999 },
      { ...base, id: "medium", name: "Medium.pdf", sizeBytes: 5000 },
    ];
    const r = analyzeStorage(files, 10);
    expect(r.topFiles[0].id).toBe("large");
    expect(r.topFiles[1].id).toBe("medium");
    expect(r.topFiles[2].id).toBe("small");
  });

  it("files with null size are NOT included in topFiles (not treated as 0 bytes)", () => {
    const files: DriveFile[] = [
      { ...base, id: "known", name: "Known.pdf", sizeBytes: 500 },
      { ...base, id: "unknown", name: "Unknown.gdoc", mimeType: "application/vnd.google-apps.document", sizeBytes: null },
    ];
    const r = analyzeStorage(files, 10);
    // Only the known-size file appears in topFiles
    const ids = r.topFiles.map((f) => f.id);
    expect(ids).toContain("known");
    expect(ids).not.toContain("unknown");
  });
});

describe("analyzeStorage — unknown size grouping", () => {
  it("filesWithUnknownSize counts only non-trashed, non-folder files with null size", () => {
    const files: DriveFile[] = [
      { ...base, id: "a", sizeBytes: null },                                        // counted
      { ...base, id: "b", sizeBytes: null, trashed: true },                         // excluded (trashed)
      { ...base, id: "c", sizeBytes: null, isFolder: true },                        // excluded (folder)
      { ...base, id: "d", sizeBytes: 100 },                                         // excluded (has size)
    ];
    const r = analyzeStorage(files, 10);
    expect(r.filesWithUnknownSize).toBe(1); // only file a
  });

  it("totalKnownBytes never treats null size as 0", () => {
    const files: DriveFile[] = [
      { ...base, id: "a", sizeBytes: 1000 },
      { ...base, id: "b", sizeBytes: null },  // must NOT contribute 0 to total
    ];
    const r = analyzeStorage(files, 10);
    // Total must be exactly 1000, not 1000 + 0
    expect(r.totalKnownBytes).toBe(1000);
  });
});
