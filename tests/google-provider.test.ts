/**
 * Tests for GoogleDriveProvider.
 *
 * All tests use mock implementations of the Google Drive API client — no real
 * network calls, no real Drive access. The provider's behavior is verified
 * by controlling what the mocked drive.files.list resolves/rejects with.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers — minimal raw API response shapes
// ─────────────────────────────────────────────────────────────────────────────

function makeRawFile(overrides: Record<string, unknown> = {}) {
  return {
    id: "file-001",
    name: "Test File.pdf",
    mimeType: "application/pdf",
    size: "1024",
    md5Checksum: "abc123",
    createdTime: "2026-01-01T00:00:00Z",
    modifiedTime: "2026-01-02T00:00:00Z",
    webViewLink: "https://drive.google.com/file/d/file-001/view",
    owners: [{ emailAddress: "user@example.com" }],
    permissions: [{ type: "user", role: "owner", emailAddress: "user@example.com" }],
    shared: false,
    trashed: false,
    ...overrides,
  };
}

function makeListResponse(files: unknown[], nextPageToken?: string) {
  return {
    data: {
      files,
      nextPageToken: nextPageToken ?? undefined,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Mock googleapis
// ─────────────────────────────────────────────────────────────────────────────

const mockFilesList = vi.fn();

vi.mock("googleapis", () => ({
  google: {
    auth: {
      OAuth2: class {
        setCredentials() {}
      },
    },
    drive: () => ({
      files: { list: mockFilesList },
    }),
  },
}));

// Import after mock is registered
const { GoogleDriveProvider } = await import("../lib/drive/google-provider");

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockFilesList.mockReset();
});

describe("GoogleDriveProvider — pagination", () => {
  it("fetches a single page when nextPageToken is absent", async () => {
    const rawFile = makeRawFile();
    mockFilesList.mockResolvedValueOnce(makeListResponse([rawFile]));

    const provider = new GoogleDriveProvider("mock-access-token");
    const files = await provider.fetchFiles();

    expect(mockFilesList).toHaveBeenCalledTimes(1);
    expect(files).toHaveLength(1);
    expect(files[0].id).toBe("file-001");
  });

  it("follows nextPageToken across multiple pages", async () => {
    const page1File = makeRawFile({ id: "file-p1" });
    const page2File = makeRawFile({ id: "file-p2" });
    const page3File = makeRawFile({ id: "file-p3" });

    mockFilesList
      .mockResolvedValueOnce(makeListResponse([page1File], "token-2"))
      .mockResolvedValueOnce(makeListResponse([page2File], "token-3"))
      .mockResolvedValueOnce(makeListResponse([page3File])); // no nextPageToken

    const provider = new GoogleDriveProvider("mock-access-token");
    const files = await provider.fetchFiles();

    expect(mockFilesList).toHaveBeenCalledTimes(3);
    // Second call must pass pageToken from first response
    expect(mockFilesList.mock.calls[1][0]).toMatchObject({ pageToken: "token-2" });
    // Third call must pass pageToken from second response
    expect(mockFilesList.mock.calls[2][0]).toMatchObject({ pageToken: "token-3" });
    expect(files.map((f) => f.id)).toEqual(["file-p1", "file-p2", "file-p3"]);
  });

  it("passes correct pageToken from the previous page", async () => {
    mockFilesList
      .mockResolvedValueOnce(makeListResponse([makeRawFile()], "cursor-abc"))
      .mockResolvedValueOnce(makeListResponse([]));

    const provider = new GoogleDriveProvider("mock-access-token");
    await provider.fetchFiles();

    const secondCall = mockFilesList.mock.calls[1][0];
    expect(secondCall.pageToken).toBe("cursor-abc");
  });

  it("handles an empty file list", async () => {
    mockFilesList.mockResolvedValueOnce(makeListResponse([]));

    const provider = new GoogleDriveProvider("mock-access-token");
    const files = await provider.fetchFiles();

    expect(files).toHaveLength(0);
  });

  it("filters out trashed files after fetching", async () => {
    const active = makeRawFile({ id: "active", trashed: false });
    const trashed = makeRawFile({ id: "trashed", trashed: true });
    mockFilesList.mockResolvedValueOnce(makeListResponse([active, trashed]));

    const provider = new GoogleDriveProvider("mock-access-token");
    const files = await provider.fetchFiles();

    const ids = files.map((f) => f.id);
    expect(ids).toContain("active");
    expect(ids).not.toContain("trashed");
  });
});

describe("GoogleDriveProvider — normalization", () => {
  it("parses sizeBytes from string", async () => {
    const raw = makeRawFile({ size: "2048576" });
    mockFilesList.mockResolvedValueOnce(makeListResponse([raw]));

    const provider = new GoogleDriveProvider("mock-access-token");
    const [file] = await provider.fetchFiles();
    expect(file.sizeBytes).toBe(2048576);
  });

  it("sets sizeBytes to null when size field is absent (native Google files)", async () => {
    const raw = makeRawFile({ size: undefined, mimeType: "application/vnd.google-apps.document" });
    delete (raw as Record<string, unknown>).size;
    mockFilesList.mockResolvedValueOnce(makeListResponse([raw]));

    const provider = new GoogleDriveProvider("mock-access-token");
    const [file] = await provider.fetchFiles();
    expect(file.sizeBytes).toBeNull();
  });

  it("sets md5Checksum to undefined when absent", async () => {
    const raw = makeRawFile();
    delete (raw as Record<string, unknown>).md5Checksum;
    mockFilesList.mockResolvedValueOnce(makeListResponse([raw]));

    const provider = new GoogleDriveProvider("mock-access-token");
    const [file] = await provider.fetchFiles();
    expect(file.md5Checksum).toBeUndefined();
  });

  it("marks Google Drive folders as isFolder=true", async () => {
    const raw = makeRawFile({
      id: "folder-1",
      mimeType: "application/vnd.google-apps.folder",
      size: undefined,
      sizeBytes: undefined,
    });
    mockFilesList.mockResolvedValueOnce(makeListResponse([raw]));

    const provider = new GoogleDriveProvider("mock-access-token");
    const [file] = await provider.fetchFiles();
    expect(file.isFolder).toBe(true);
  });

  it("extracts ownerEmail from owners[0]", async () => {
    const raw = makeRawFile({ owners: [{ emailAddress: "owner@acme.com" }] });
    mockFilesList.mockResolvedValueOnce(makeListResponse([raw]));

    const provider = new GoogleDriveProvider("mock-access-token");
    const [file] = await provider.fetchFiles();
    expect(file.ownerEmail).toBe("owner@acme.com");
  });

  it("handles missing owners gracefully", async () => {
    const raw = makeRawFile({ owners: undefined });
    delete (raw as Record<string, unknown>).owners;
    mockFilesList.mockResolvedValueOnce(makeListResponse([raw]));

    const provider = new GoogleDriveProvider("mock-access-token");
    const [file] = await provider.fetchFiles();
    expect(file.ownerEmail).toBeUndefined();
  });
});

describe("GoogleDriveProvider — retry behavior", () => {
  it("retries on 429 (rate limit) and eventually succeeds", async () => {
    vi.useFakeTimers();

    const successFile = makeRawFile({ id: "success" });

    // Fail twice with 429, then succeed
    mockFilesList
      .mockRejectedValueOnce({ code: 429 })
      .mockRejectedValueOnce({ code: 429 })
      .mockResolvedValueOnce(makeListResponse([successFile]));

    const provider = new GoogleDriveProvider("mock-access-token");
    const promise = provider.fetchFiles();

    // Advance timers to skip exponential back-off delays
    await vi.runAllTimersAsync();

    const files = await promise;
    expect(files[0].id).toBe("success");
    expect(mockFilesList).toHaveBeenCalledTimes(3);

    vi.useRealTimers();
  });

  it("retries on 503 (service unavailable) and eventually succeeds", async () => {
    vi.useFakeTimers();

    const successFile = makeRawFile({ id: "success-503" });

    mockFilesList
      .mockRejectedValueOnce({ code: 503 })
      .mockResolvedValueOnce(makeListResponse([successFile]));

    const provider = new GoogleDriveProvider("mock-access-token");
    const promise = provider.fetchFiles();

    await vi.runAllTimersAsync();

    const files = await promise;
    expect(files[0].id).toBe("success-503");

    vi.useRealTimers();
  });

  it("does NOT retry on 404 (not found) — throws immediately", async () => {
    mockFilesList.mockRejectedValueOnce({ code: 404 });

    const provider = new GoogleDriveProvider("mock-access-token");
    await expect(provider.fetchFiles()).rejects.toMatchObject({ code: 404 });
    expect(mockFilesList).toHaveBeenCalledTimes(1);
  });

  it("does NOT retry on 400 (bad request) — throws immediately", async () => {
    mockFilesList.mockRejectedValueOnce({ code: 400 });

    const provider = new GoogleDriveProvider("mock-access-token");
    await expect(provider.fetchFiles()).rejects.toMatchObject({ code: 400 });
    expect(mockFilesList).toHaveBeenCalledTimes(1);
  });

  it("gives up after MAX_RETRIES (3) and throws", async () => {
    // We spy on setTimeout to make back-off delays instant (0ms) without
    // using fake timers, which cause a teardown race with recursive async mocks.
    const origSetTimeout = globalThis.setTimeout;
    // @ts-expect-error -- replace with 0-delay version for this test only
    globalThis.setTimeout = (fn: () => void) => origSetTimeout(fn, 0);

    try {
      // 1 original attempt + 3 retries = 4 total calls before giving up
      mockFilesList
        .mockRejectedValueOnce({ code: 429 })
        .mockRejectedValueOnce({ code: 429 })
        .mockRejectedValueOnce({ code: 429 })
        .mockRejectedValueOnce({ code: 429 });

      const provider = new GoogleDriveProvider("mock-access-token");
      await expect(provider.fetchFiles()).rejects.toMatchObject({ code: 429 });
      expect(mockFilesList).toHaveBeenCalledTimes(4);
    } finally {
      globalThis.setTimeout = origSetTimeout;
    }
  });
});
