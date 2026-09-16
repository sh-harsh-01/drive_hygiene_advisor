# DECISIONS.md — Key Product & Technical Decisions

This document describes important decisions made while building the Drive Hygiene Advisor prototype, explaining the reasoning behind each choice.

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

---

## Decision 6 — Self-contained Add-on: entire UX inside the Workspace right-side panel

**What I decided:** The complete Drive Hygiene Advisor experience — metadata fetching, all analysis engines, and result rendering — runs inside the Google Workspace Add-on right-side panel using CardService only. No external URL is opened, no browser tab is launched, and no iframe is used.

**Why:**

The interviewer explicitly required this: *"There must be NO external link, NO 'Open Full App' button, and the user must NOT be redirected to the Next.js/Vercel web application."*

The previous architecture used the add-on as a launcher — a card with an "Open Full App" button that opened the Next.js application in a new browser tab. This was functionally correct but violated the requirement that the entire experience must remain inside Google Drive.

This decision required porting the analysis engines from TypeScript (`lib/analysis/`) to Apps Script V8 JavaScript (`addon/Code.gs`). The port is exact — same business rules, same tier definitions, same scoring weights, same error reasons. The TypeScript tests in `tests/` serve as the specification that both implementations must satisfy.

**Approaches evaluated:**

| Approach | Verdict | Reason |
|---|---|---|
| Apps Script card as launcher → Next.js app in browser tab | ❌ Rejected | Violates interviewer requirement (no external navigation) |
| Embed Next.js / HTML directly in side panel | ❌ Not possible | CardService does not support arbitrary HTML, iframes, or React |
| Rebuild analysis + UI entirely in CardService (Apps Script) | ✅ **Chosen** | Only viable approach that satisfies the requirement |

**Trade-offs documented:**

1. **Execution time limit:** Apps Script functions run synchronously and are bounded at 6 minutes (standard Google accounts) or 30 minutes (Workspace accounts). Very large Drives may not be fully scanned in one pass. The add-on caps fetching at 200 pages × 200 files = 40,000 files and shows a clear message if the cap is reached, rather than failing silently.

2. **CardService widget constraints:** The right-side panel is approximately 280 px wide and is restricted to CardService widgets (`DecoratedText`, `TextParagraph`, `TextButton`, `CardSection`, etc.). No HTML, CSS, or charts are possible. The analysis results are rendered as structured card sections rather than the rich React dashboard in the Next.js app.

3. **No `async/await`:** Apps Script is synchronous. Drive API calls use `Drive.Files.list()` (Advanced Drive Service) which is synchronous. `Utilities.sleep()` is used for retry backoff instead of `setTimeout`.

4. **Analysis portability:** The TypeScript analysis engines in `lib/analysis/` use only pure functions and plain JavaScript data structures (no Node.js APIs, no React, no `googleapis` client). This made porting to Apps Script straightforward. The ported functions use the same variable names, the same logic branches, and the same return shapes.

5. **Next.js app preserved:** The existing Next.js/Vercel application is untouched. It remains a fully functional independent dashboard. The Add-on does not depend on it or link to it in any way.

**Configuration security:** `ScriptProperties` is still used for `DEMO_MODE` (enables mock data). No secrets or external URLs are stored in Script Properties.

---

## Decision 7 — OAuth scopes, Drive API access, and no-write policy

**What I decided:** The Workspace Add-on requests exactly one OAuth scope: `https://www.googleapis.com/auth/drive.metadata.readonly`. No write, delete, content-access, or admin scopes are requested.

**Why:**

### Scope selection rationale

| Scope | Requested | Reason |
|---|---|---|
| `drive.metadata.readonly` | **Yes** | Required: provides access to file metadata including `id`, `name`, `mimeType`, `size`, `md5Checksum`, `permissions`, `owners`, `shared`, `trashed` |
| `drive.addons.metadata.readonly` | No | This narrower scope only works for Drive contextual triggers and does not permit `Drive.Files.list()` calls |
| `script.container.ui` | No | This scope was in the old manifest to support opening external URLs from Cards. Removed because no external URLs are opened. |
| `drive.readonly` | No | Allows reading file content — not needed for metadata-only analysis |
| `drive` | No | Full read/write access — far broader than required; would justifiably concern users |

### Drive API fields fetched (metadata-only)

```
id, name, mimeType, size, md5Checksum,
createdTime, modifiedTime, webViewLink,
owners, permissions, shared, trashed
```

File content is never requested, read, or downloaded.

### Pagination

Drive API responses are paginated. A single list response contains at most `pageSize` files (we use 200 per page). The add-on fetches pages in a loop using `nextPageToken` until either:
- `nextPageToken` is absent (all files fetched), or
- The safety cap of `MAX_PAGES = 200` pages is reached.

This cursor-based approach means the add-on never assumes it has fetched all files from a single response.

### Metadata-only duplicate detection

MD5 checksums (`md5Checksum` field) are computed server-side by Google for binary files uploaded to Drive. They are **unavailable** for native Google Docs, Sheets, Slides, and Forms because those files exist only in Google's proprietary format and have no binary content to hash.

Consequently:
- Native Google files fall through to the STRONG or POSSIBLE tiers based on name+MIME+size.
- The `md5Checksum` field is used as a binary-identity proof only when Google provides it.
- No additional scope is needed for checksums — they are included in `drive.metadata.readonly`.

### Missing file sizes

Native Google Docs, Sheets, Slides, and Forms do not expose a `size` field. The add-on:
- Never treats a missing size as 0 bytes.
- Marks such files as `sizeBytes: null`.
- Counts them separately as "files with unknown size" in the storage summary.
- Excludes them from the size ranking and storage totals.

### Risk classification

The `permissions` field (included in `drive.metadata.readonly`) returns the full sharing permission list for each file. This enables the three-level risk classification:

| Level | Criteria | Description |
|---|---|---|
| HIGH | `type: 'anyone'` permission exists | Anyone with the link can access the file (closest to public in Drive) |
| MEDIUM | `type: 'domain'` sharing, external users, or ≥5 non-owner recipients | Broad organizational or external exposure |
| LOW | Owner-only or limited internal sharing | No significant sharing risk |

Important: `domain` sharing means *accessible to everyone in the organization's Workspace domain* — it is internal, not public. Risk reasons never describe domain sharing as public or as "anyone".

### No deletion or remediation

This is a read-only analysis application. The add-on has no ability to delete, rename, move, or modify any Drive files. The `drive.metadata.readonly` scope does not permit any write operations. This is by design and is documented clearly in the UI.
