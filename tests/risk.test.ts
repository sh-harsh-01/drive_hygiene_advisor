import { describe, it, expect } from "vitest";
import { scoreRisk, getRiskyFiles } from "../lib/analysis/risk";
import { DriveFile } from "../lib/drive/types";

const base: DriveFile = {
  id: "x",
  name: "Test.pdf",
  mimeType: "application/pdf",
  sizeBytes: 1000,
  createdTime: "2026-01-01T00:00:00Z",
  modifiedTime: "2026-01-01T00:00:00Z",
  ownerEmail: "owner@example.com",
  permissions: [{ type: "user", role: "owner", emailAddress: "owner@example.com" }],
  shared: false,
  trashed: false,
  isFolder: false,
};

describe("scoreRisk — HIGH", () => {
  it("anyone/reader → HIGH", () => {
    const f = { ...base, permissions: [...base.permissions, { type: "anyone" as const, role: "reader" as const }] };
    expect(scoreRisk(f).level).toBe("HIGH");
  });

  it("anyone/writer → HIGH with edit reason", () => {
    const f = { ...base, permissions: [...base.permissions, { type: "anyone" as const, role: "writer" as const }] };
    const result = scoreRisk(f);
    expect(result.level).toBe("HIGH");
    expect(result.reasons.some((r) => r.toLowerCase().includes("edit"))).toBe(true);
  });

  it("anyone/commenter → HIGH", () => {
    const f = { ...base, permissions: [...base.permissions, { type: "anyone" as const, role: "commenter" as const }] };
    expect(scoreRisk(f).level).toBe("HIGH");
  });

  it("HIGH score ≥ 75", () => {
    const f = { ...base, permissions: [...base.permissions, { type: "anyone" as const, role: "reader" as const }] };
    expect(scoreRisk(f).score).toBeGreaterThanOrEqual(75);
  });
});

describe("scoreRisk — MEDIUM", () => {
  it("domain/reader → MEDIUM", () => {
    const f = { ...base, permissions: [...base.permissions, { type: "domain" as const, role: "reader" as const, domain: "example.com" }] };
    expect(scoreRisk(f).level).toBe("MEDIUM");
  });

  it("external user → MEDIUM", () => {
    const f = {
      ...base,
      permissions: [
        ...base.permissions,
        { type: "user" as const, role: "reader" as const, emailAddress: "external@other.com" },
      ],
    };
    expect(scoreRisk(f).level).toBe("MEDIUM");
  });

  it("5 non-owner users → MEDIUM", () => {
    const extras = Array.from({ length: 5 }, (_, i) => ({
      type: "user" as const,
      role: "reader" as const,
      emailAddress: `user${i}@example.com`,
    }));
    const f = { ...base, permissions: [...base.permissions, ...extras] };
    expect(scoreRisk(f).level).toBe("MEDIUM");
  });
});

describe("scoreRisk — LOW", () => {
  it("owner only → LOW", () => {
    expect(scoreRisk(base).level).toBe("LOW");
  });

  it("internal user only → LOW", () => {
    const f = {
      ...base,
      permissions: [
        ...base.permissions,
        { type: "user" as const, role: "reader" as const, emailAddress: "colleague@example.com" },
      ],
    };
    expect(scoreRisk(f).level).toBe("LOW");
  });
});

describe("getRiskyFiles", () => {
  it("filters out LOW risk files", () => {
    const files = [base];
    expect(getRiskyFiles(files)).toHaveLength(0);
  });

  it("returns HIGH risk files", () => {
    const files = [
      { ...base, id: "a", permissions: [{ type: "anyone" as const, role: "reader" as const }] },
      base,
    ];
    const risky = getRiskyFiles(files);
    expect(risky).toHaveLength(1);
    expect(risky[0].file.id).toBe("a");
  });

  it("sorts HIGH before MEDIUM", () => {
    const files = [
      { ...base, id: "medium", permissions: [{ type: "domain" as const, role: "reader" as const, domain: "x.com" }] },
      { ...base, id: "high", permissions: [{ type: "anyone" as const, role: "reader" as const }] },
    ];
    const risky = getRiskyFiles(files);
    expect(risky[0].risk.level).toBe("HIGH");
    expect(risky[1].risk.level).toBe("MEDIUM");
  });
});
