import { DuplicateGroup } from "./analysis/duplicates";
import { RankedFile } from "./analysis/risk";
import { StorageResult } from "./analysis/storage";
import { HygieneScore } from "./analysis/score";
import { DriveFile } from "./drive/types";

export interface AnalysisResult {
  summary: {
    hygieneScore: HygieneScore;
    filesScanned: number;
    riskyFiles: number;
    duplicateGroups: number;
    knownStorageBytes: number;
    filesWithUnknownSize: number;
  };
  duplicates: DuplicateGroup[];
  /** Top 20 largest files (with known sizes). */
  largeFiles: DriveFile[];
  storageByType: StorageResult["byCategory"];
  riskyFiles: RankedFile[];
  allFiles: DriveFile[];
}

/**
 * Simple in-memory cache for analysis results.
 *
 * IMPORTANT: This is a prototype simplification. Each request to /api/drive/analyze
 * is cached for CACHE_TTL_MS in the Node.js process memory. This means:
 *   - Cache is lost on server restart
 *   - Does not work across multiple Node.js instances (e.g. serverless)
 *
 * In a production system, a distributed cache such as Redis would be
 * appropriate, keyed by user ID with a configurable TTL.
 */
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CacheEntry {
  result: AnalysisResult;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

export function getCached(key: string): AnalysisResult | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.result;
}

export function setCached(key: string, result: AnalysisResult): void {
  cache.set(key, { result, expiresAt: Date.now() + CACHE_TTL_MS });
}
