import { DriveFile } from "./types";
import { DriveProvider } from "./provider";
import { MOCK_FILES } from "../mock/data";

/**
 * MockDriveProvider returns the static mock dataset.
 * It satisfies the exact same DriveProvider interface as GoogleDriveProvider,
 * so no analysis code needs to change when the real API is connected.
 */
export class MockDriveProvider implements DriveProvider {
  async fetchFiles(): Promise<DriveFile[]> {
    // Simulate a small network delay so the loading state is visible during demos.
    await new Promise((resolve) => setTimeout(resolve, 600));
    return MOCK_FILES.filter((f) => !f.trashed);
  }
}
