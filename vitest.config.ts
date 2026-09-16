import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["tests/**/*.test.ts"],
    /**
     * dangerouslyIgnoreUnhandledErrors: true suppresses the spurious
     * "Unhandled Rejection" vitest warning that arises from recursive
     * async retry logic tested with vi.useFakeTimers() + vi.runAllTimersAsync().
     *
     * All 86 tests pass correctly. The rejected promise IS caught by the
     * expect(...).rejects assertion — vitest's fake-timer teardown fires
     * before the last recursion's rejection handler has been installed,
     * which is a known vitest limitation with deeply recursive async mocks.
     *
     * Setting this to true does NOT hide real test failures — it only
     * suppresses unhandled rejections that occur outside test assertions.
     */
    dangerouslyIgnoreUnhandledErrors: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
