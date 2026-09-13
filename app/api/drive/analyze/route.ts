import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { MockDriveProvider } from "@/lib/drive/mock-provider";
import { findDuplicates } from "@/lib/analysis/duplicates";
import { analyzeRisk, getRiskyFiles } from "@/lib/analysis/risk";
import { analyzeStorage } from "@/lib/analysis/storage";
import { computeHygieneScore } from "@/lib/analysis/score";
import { getCached, setCached, AnalysisResult } from "@/lib/cache";

/**
 * GET /api/drive/analyze
 *
 * Pipeline:
 *   1. Choose provider:
 *      - Mock: when GOOGLE_CLIENT_ID is not set, or MOCK_MODE=true
 *      - Google: when NextAuth JWT contains an access token
 *   2. Fetch all files from the provider
 *   3. Run duplicate analysis
 *   4. Run risk analysis
 *   5. Run storage analysis
 *   6. Compute hygiene score
 *   7. Return structured AnalysisResult JSON
 *
 * The access token is read from the server-side NextAuth JWT — it is never
 * sent to the browser or included in client-side requests.
 */
export async function GET(request: NextRequest) {
  try {
    const isMockMode =
      process.env.MOCK_MODE === "true" || !process.env.GOOGLE_CLIENT_ID;

    let provider;
    let userId = "mock";

    if (isMockMode) {
      provider = new MockDriveProvider();
    } else {
      // Read access token from the server-side NextAuth JWT.
      // next-auth/jwt reads the encrypted cookie; the raw token is never
      // exposed to the browser.
      const token = await getToken({
        req: request,
        secret: process.env.NEXTAUTH_SECRET!,
      });

      if (!token || !token.accessToken) {
        return NextResponse.json(
          { error: "Not signed in. Please connect your Google Drive.", needsAuth: true },
          { status: 401 }
        );
      }

      const { GoogleDriveProvider } = await import("@/lib/drive/google-provider");
      provider = new GoogleDriveProvider(token.accessToken as string);
      userId = (token.sub as string) ?? "google-user";
    }

    // ── Cache check ────────────────────────────────────────────────
    const cacheKey = isMockMode ? "mock" : `google:${userId}`;
    const cached = getCached(cacheKey);
    if (cached) {
      return NextResponse.json({ ...cached, cached: true, mockMode: isMockMode });
    }

    // ── Fetch files ────────────────────────────────────────────────
    const files = await provider.fetchFiles();

    // ── Analyze ────────────────────────────────────────────────────
    const duplicates = findDuplicates(files);
    const riskyFiles = getRiskyFiles(files);
    const storage = analyzeStorage(files, 20);
    const nonFolderCount = files.filter((f) => !f.isFolder && !f.trashed).length;
    const hygieneScore = computeHygieneScore(nonFolderCount, riskyFiles, duplicates);

    const result: AnalysisResult = {
      summary: {
        hygieneScore,
        filesScanned: nonFolderCount,
        riskyFiles: riskyFiles.length,
        duplicateGroups: duplicates.length,
        knownStorageBytes: storage.totalKnownBytes,
        filesWithUnknownSize: storage.filesWithUnknownSize,
      },
      duplicates,
      largeFiles: storage.topFiles,
      storageByType: storage.byCategory,
      riskyFiles,
      allFiles: files,
    };

    setCached(cacheKey, result);

    return NextResponse.json({ ...result, cached: false, mockMode: isMockMode });
  } catch (error) {
    console.error("[analyze] Error:", error);
    return NextResponse.json(
      {
        error: "Drive analysis failed. Please try again.",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
