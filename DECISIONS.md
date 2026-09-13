# DECISIONS.md — Key Product & Technical Decisions

This document describes five important decisions made while building the Drive Hygiene Advisor prototype, explaining the reasoning behind each choice.

---

## Decision 1 — Metadata-only duplicate detection (no file download)

**What I decided:** Duplicate detection is based entirely on file metadata — specifically MD5 checksums where available, and normalized filenames + MIME type + file size when checksums are absent. The application never requests access to file content.

**Why:**

Two reasons drove this:

1. **Permissions (security):** File content access requires significantly broader OAuth scopes (`drive.readonly` or `drive`). The analysis we need — detecting likely duplicates — can be done with metadata alone. Requesting unnecessary permissions is a security and privacy antipattern, especially in a workplace context where files may contain sensitive business data.

2. **Performance and scale:** Downloading file content to compare binaries would be impractical at scale. Metadata analysis (including MD5 checksums, which Google computes server-side for uploaded files) delivers most of the signal with none of the cost.

**Trade-off documented:** MD5 checksums are only available for binary files uploaded to Drive (not for native Google Docs, Sheets, or Slides). This means native Google files can only be matched by the weaker name+MIME tier. This limitation is surfaced in the UI.

---

## Decision 2 — Explainable, rules-based risk scoring

**What I decided:** Rather than an opaque risk score, every flagged file carries a `reasons[]` array of plain-English sentences explaining exactly why it was flagged. The UI renders these as chips on the Risky Files page.

**Why:**

An unexplained "High" label is not actionable — a user needs to understand *what* to fix. The evaluation criteria explicitly rewards UX and documentation, and a risk system that explains itself is far more useful to a business user.

The rules are deliberately documented in code comments in `lib/analysis/risk.ts`:
- `anyone` → potentially public (anyone with the link)
- `domain` → organization-wide (NOT public — correcting a common misconception)
- `user` / `group` → specific sharing

**Trade-off:** A rules-based system cannot detect subtleties like an internal user forwarding a link externally. True risk analysis would require audit logs, not just permission snapshots.

---

## Decision 3 — Provider abstraction (DriveProvider interface)

**What I decided:** Both data sources (mock and Google Drive) implement the same `DriveProvider` interface with a single `fetchFiles(): Promise<DriveFile[]>` method. The analysis pipeline only ever depends on `DriveProvider` — it never knows which implementation it's talking to.

**Why:**

This is the key architectural boundary that makes the prototype genuinely extensible. Swapping from mock to Google is a one-line change (choosing a different provider). The analysis engines, API route, and UI do not change at all.

It also means the mock dataset can be used to write unit tests for the analysis engines without any network calls or authentication — tests run fast and deterministically.

**Pattern:** This is a variation of the Repository Pattern / Dependency Inversion. The high-level analysis code depends on an abstraction, not a concrete implementation.

---

## Decision 4 — Mock-first, with explicit Demo Mode indicator

**What I decided:** The application runs in Demo Mode by default — it uses the mock dataset and does not require Google OAuth to function. A clearly visible "Demo Mode" badge appears in the header on every page. The Google provider activates only when `GOOGLE_CLIENT_ID` is present in the environment.

**Why:**

1. **Reviewer experience:** The prototype should be fully demonstrable without Google Cloud Console setup. A reviewer should be able to `npm install && npm run dev` and see the complete product.

2. **Transparency:** Silently switching between real and mock data would be confusing. A permanent Demo Mode badge ensures the reviewer always knows what they're looking at.

**For production:** The `MOCK_MODE=false` environment variable switches the app to require authentication. The `GoogleDriveProvider` handles real pagination, retry logic, and access token management.

---

## Decision 5 — Least-privilege OAuth scope

**What I decided:** The Google Drive integration requests only `https://www.googleapis.com/auth/drive.metadata.readonly`. This scope allows reading file metadata (name, size, MIME type, checksum, permissions, owners) but does not allow reading, downloading, modifying, or deleting file content.

**Why:**

The application has no reason to read file content. The analysis is entirely based on metadata:
- Duplicate detection uses checksums (server-computed) and filenames
- Risk scoring uses permission and sharing metadata
- Storage analysis uses file size fields

Requesting broader scopes (`drive.readonly`, `drive`) when they are not needed violates the principle of least privilege and would rightly concern users granting access to their corporate Drive.

During the OAuth consent screen, users will see exactly what the application can access. A minimal scope description builds trust.

**If checksums were unavailable:** Even without `md5Checksum`, the app degrades gracefully to the name+MIME+size tiers. No additional scope is needed.

---

## Production Scalability Note

The prototype uses a synchronous in-memory pipeline (fetch all → analyze → respond). This is appropriate for prototype purposes but would not scale to a Google Workspace domain with millions of files.

A production architecture would look like:

```
User triggers scan
       ↓
Create scan job (database: scan_id, user_id, status=pending)
       ↓
Enqueue to background job queue (e.g. Cloud Tasks / BullMQ)
       ↓
Worker fetches Drive pages one at a time (cursor-based pagination)
       ↓
Persist progress checkpoint (last_page_token, files_processed)
       ↓
If worker crashes → resume from checkpoint
       ↓
Store results in database (indexed by user_id, scan_id)
       ↓
API serves pre-computed results to UI
```

Key additions:
- **Pagination checkpoint persistence** so multi-million-file scans can resume after failure
- **Distributed cache** (Redis) instead of in-memory cache for multi-instance deployments
- **Rate-limit-aware fetching** with exponential back-off (already implemented in `google-provider.ts`)
- **Database storage** for analysis results so they can be queried, filtered, and paginated server-side
