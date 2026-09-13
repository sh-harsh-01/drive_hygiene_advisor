// Normalized Drive file model — independent of Google API or mock source.
// The UI and analysis engines only consume this shape.

export interface DrivePermission {
  type: "user" | "group" | "domain" | "anyone";
  role: "owner" | "organizer" | "writer" | "commenter" | "reader";
  emailAddress?: string;
  domain?: string;
  displayName?: string;
}

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  /** Null when Google doesn't expose a size (e.g. native Docs/Sheets). */
  sizeBytes: number | null;
  /** MD5 of file content — only present for binary files uploaded to Drive. */
  md5Checksum?: string;

  createdTime: string;   // ISO 8601
  modifiedTime: string;  // ISO 8601

  webViewLink?: string;

  ownerEmail?: string;
  permissions: DrivePermission[];

  shared: boolean;
  trashed: boolean;
  isFolder: boolean;
}
