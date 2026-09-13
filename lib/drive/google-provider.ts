import { google } from "googleapis";
import { DriveFile, DrivePermission } from "./types";
import { DriveProvider } from "./provider";

const FIELDS =
  "nextPageToken,files(id,name,mimeType,size,md5Checksum,createdTime,modifiedTime,webViewLink,owners,permissions,shared,trashed)";
const PAGE_SIZE = 100;
const MAX_RETRIES = 3;

/**
 * GoogleDriveProvider fetches all non-trashed files from the authenticated
 * user's Google Drive using the Drive API v3.
 *
 * Pagination: cursor-based via nextPageToken — never loads all pages at once.
 * Retry: exponential back-off with jitter for 429 / 503 responses.
 */
export class GoogleDriveProvider implements DriveProvider {
  private accessToken: string;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  async fetchFiles(): Promise<DriveFile[]> {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: this.accessToken });
    const drive = google.drive({ version: "v3", auth });

    const allFiles: DriveFile[] = [];
    let pageToken: string | undefined;

    do {
      const response = await this.fetchPage(drive, pageToken);
      const rawFiles = response.files ?? [];

      for (const raw of rawFiles) {
        allFiles.push(this.normalize(raw));
      }

      pageToken = response.nextPageToken ?? undefined;
    } while (pageToken);

    return allFiles.filter((f) => !f.trashed);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async fetchPage(drive: any, pageToken?: string, attempt = 1): Promise<any> {
    try {
      const res = await drive.files.list({
        pageSize: PAGE_SIZE,
        pageToken,
        fields: FIELDS,
        q: "trashed = false",
      });
      return res.data;
    } catch (err: unknown) {
      const status = (err as { code?: number }).code;
      if ((status === 429 || status === 503) && attempt <= MAX_RETRIES) {
        const delay = Math.pow(2, attempt) * 1000 + Math.random() * 500;
        await new Promise((r) => setTimeout(r, delay));
        return this.fetchPage(drive, pageToken, attempt + 1);
      }
      throw err;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private normalize(raw: any): DriveFile {
    const permissions: DrivePermission[] = (raw.permissions ?? []).map(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (p: any) => ({
        type: p.type,
        role: p.role,
        emailAddress: p.emailAddress,
        domain: p.domain,
        displayName: p.displayName,
      })
    );

    return {
      id: raw.id ?? "",
      name: raw.name ?? "Untitled",
      mimeType: raw.mimeType ?? "application/octet-stream",
      sizeBytes: raw.size ? parseInt(raw.size, 10) : null,
      md5Checksum: raw.md5Checksum,
      createdTime: raw.createdTime ?? new Date().toISOString(),
      modifiedTime: raw.modifiedTime ?? new Date().toISOString(),
      webViewLink: raw.webViewLink,
      ownerEmail: raw.owners?.[0]?.emailAddress,
      permissions,
      shared: raw.shared ?? false,
      trashed: raw.trashed ?? false,
      isFolder: raw.mimeType === "application/vnd.google-apps.folder",
    };
  }
}
