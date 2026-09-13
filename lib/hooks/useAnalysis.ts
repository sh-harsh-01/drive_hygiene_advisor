"use client";

import { useState, useEffect, useCallback } from "react";
import { AnalysisResult } from "@/lib/cache";

export type ScanStatus = "idle" | "scanning" | "done" | "error" | "needs_auth";

interface UseAnalysisResult {
  data: AnalysisResult | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
  scanStatus: ScanStatus;
  mockMode: boolean;
}

/**
 * Client-side hook that fetches analysis results from /api/drive/analyze.
 *
 * When credentials are configured and the user is signed in, the API route
 * reads the access token from the server-side JWT (never from the browser).
 *
 * When not authenticated, the route returns { needsAuth: true } and the hook
 * sets scanStatus = "needs_auth" so the UI can prompt for sign-in.
 */
export function useAnalysis(): UseAnalysisResult {
  const [data, setData] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scanStatus, setScanStatus] = useState<ScanStatus>("idle");
  const [mockMode, setMockMode] = useState(true);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    setScanStatus("scanning");

    try {
      const res = await window.fetch("/api/drive/analyze");
      const json = await res.json();

      if (res.status === 401 && json.needsAuth) {
        setScanStatus("needs_auth");
        setError("Please sign in with Google to scan your Drive.");
        return;
      }

      if (!res.ok) {
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }

      setData(json);
      setMockMode(json.mockMode ?? true);
      setScanStatus("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setScanStatus("error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { data, loading, error, refetch: fetch, scanStatus, mockMode };
}
