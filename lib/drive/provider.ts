import { DriveFile } from "./types";

/**
 * Every data source (Google Drive or mock) implements this interface.
 * The analysis layer only depends on DriveProvider — never on specific implementations.
 */
export interface DriveProvider {
  /** Returns all non-trashed files visible to the authenticated user. */
  fetchFiles(): Promise<DriveFile[]>;
}
