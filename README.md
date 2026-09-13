# Drive Hygiene Advisor

A Google Workspace-style web application that helps a Google Drive user identify duplicate files, large storage users, and files with potentially risky sharing permissions — and summarises findings as an overall Drive Hygiene Score.

Built with **Next.js 16**, **TypeScript**, **Tailwind CSS**, **Recharts**, and **Lucide React**.

---

## Features

| Feature | Description |
|---|---|
| **Drive Hygiene Score** | Weighted 0–100 score: Risk (40%) + Duplicates (30%) + Storage (30%) |
| **Duplicate Detection** | Three-tier: Exact (MD5) → Strong (name+MIME+size) → Possible (name+MIME) |
| **Storage Insights** | Top 20 largest files + breakdown by file type category |
| **Risk Scoring** | Explainable High / Medium / Low with plain-English reason chips |
| **Demo Mode** | Works without Google authentication using a realistic 48-file mock dataset |
| **Google Drive API** | Real integration via `drive.metadata.readonly` scope when credentials are configured |

---

## Architecture

```
Google Drive API v3  ←→  GoogleDriveProvider  ┐
                                               ├→ DriveProvider interface
           Mock Dataset  ←→  MockDriveProvider ┘
                                    │
                         ┌──────────▼──────────┐
                         │   Normalized         │
                         │   DriveFile model    │
                         └──┬───────┬───────┬──┘
                            │       │       │
                     Duplicate   Risk   Storage
                     Analyzer  Analyzer  Analyzer
                            │       │       │
                         ┌──▼───────▼───────▼──┐
                         │   Hygiene Score      │
                         └──────────┬──────────┘
                                    │
                         GET /api/drive/analyze
                                    │
                         Next.js Dashboard UI
```

**Key principle:** The analysis engines never know whether files came from Google or the mock dataset.

---

## Tech Stack

- **Next.js 16** — React framework with App Router
- **TypeScript** — Full type safety across analysis and UI
- **Tailwind CSS v4** — Utility-first styling
- **Recharts** — Storage breakdown bar chart
- **Lucide React** — Icon system
- **googleapis** — Google Drive API v3 client
- **next-auth** — OAuth 2.0 integration (Google provider)
- **Vitest** — Unit tests for analysis engines

---

## Running Locally

### Prerequisites

- Node.js 20+
- npm 10+

### Quick start (Demo Mode — no Google account needed)

```bash
git clone <repo>
cd drive-hygiene-advisor
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The app runs in **Demo Mode** using a built-in 48-file mock dataset. A yellow badge in the header confirms mock data is in use.

---

## Mock Mode

Mock mode is active by default when `GOOGLE_CLIENT_ID` is not set. To be explicit:

```bash
MOCK_MODE=true npm run dev
```

The mock dataset (`lib/mock/data.ts`) includes:
- 4 duplicate groups (exact, strong, and possible tiers)
- 5 large files (video, archives, PSD)
- High-risk files (anyone with link)
- Medium-risk files (domain-wide, external users)
- Low-risk files (private / internal only)
- Native Google Docs/Sheets with no size metadata
- One trashed file (filtered out)

---

## Google Drive Setup

### 1. Create Google Cloud credentials

1. Go to [Google Cloud Console → APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials)
2. Create an **OAuth 2.0 Client ID** (Web application)
3. Add authorized redirect URI: `http://localhost:3000/api/auth/callback/google`
4. Enable the **Google Drive API** in the project

### 2. Configure environment

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```
MOCK_MODE=false
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
NEXTAUTH_SECRET=<generate with: openssl rand -base64 32>
NEXTAUTH_URL=http://localhost:3000
```

### 3. Run

```bash
npm run dev
```

Click **Sign in with Google** when prompted.

---

## OAuth Scopes

The application requests **only**:

```
https://www.googleapis.com/auth/drive.metadata.readonly
```

This scope provides access to file metadata (name, size, MIME type, MD5 checksum, permissions, sharing information) but **does not** allow reading, downloading, modifying, or deleting file content. See `DECISIONS.md` — Decision 5 for the full rationale.

---

## Duplicate Detection Logic

Three tiers, applied in order (strongest first):

| Tier | Criteria | Confidence |
|---|---|---|
| **Exact** | Identical `md5Checksum` | Highest — files are binary identical |
| **Strong** | Same normalized name + same MIME type + same file size | High — likely unintentional copies |
| **Possible** | Same normalized name + same MIME type, different sizes | Medium — may be different versions |

**Filename normalization** strips: file extensions, version suffixes `(1)` `v2` `v3`, copy patterns `- Copy` `- Backup` `Copy of`, and date suffixes. The normalization is conservative — only clearly cosmetic patterns are removed.

**Not grouped:** Files with different MIME types (e.g. `Report.pdf` vs `Report.docx`) even if names match, because they are definitionally different files.

---

## Risk Scoring

| Level | Criteria |
|---|---|
| **High** | `anyone` permission exists — anyone with the link can access the file |
| **Medium** | Domain-wide sharing, external user access, or shared with ≥5 people |
| **Low** | Private (owner only) or limited sharing with internal collaborators |

**Important distinction:** `domain` sharing means "accessible to everyone in the organization" — it is internal, not public. Only `anyone` permissions are treated as potentially public.

Every scored file includes a `reasons[]` array with plain-English explanations, rendered as chips in the UI.

---

## Storage Analysis

Files are grouped into 8 categories by MIME type:
Documents, Spreadsheets, Presentations, PDFs, Images, Videos, Archives, Other.

**Native Google files** (Docs, Sheets, Slides, Forms) do not report a file size because they exist in Google's proprietary format. These are counted separately as "files with unknown size" and are never treated as 0 bytes, which would skew totals.

---

## Error Handling

- **No files found:** Empty states on each page with descriptive messages
- **API error:** Error banner with retry button
- **Missing size metadata:** "Size unavailable" displayed instead of 0 B
- **Rate limits (Google API):** Exponential back-off with jitter in `google-provider.ts` (max 3 retries)
- **Auth failure:** 401 response from API route with clear message

---

## Testing

```bash
npm test
```

Tests cover all four analysis modules:

| File | What's tested |
|---|---|
| `tests/duplicates.test.ts` | Normalization, all 3 tiers, folder/trash exclusion |
| `tests/risk.test.ts` | All 3 risk levels, reason content, sort order |
| `tests/storage.test.ts` | MIME categorization, totals, unknown size handling, topN |
| `tests/score.test.ts` | Empty/clean Drive, HIGH vs MEDIUM penalty, label thresholds, math |

---

## Limitations

- **Metadata only:** Duplicate detection cannot compare file content, only metadata. Two files with different checksums but identical content (e.g. re-uploaded files) are not detected as duplicates.
- **No quota data in mock mode:** The storage score component is fixed at 100 in prototype mode because the Drive `about.get` quota endpoint requires authentication.
- **In-memory cache:** Analysis results are cached for 5 minutes in Node.js process memory. Not suitable for multi-instance deployments (see Production Scalability below).
- **No shared drives:** The Google provider only scans `My Drive`. Shared drives (Team Drives) would require additional API calls with `includeItemsFromAllDrives=true`.

---

## Production Scalability

The prototype uses a synchronous pipeline suitable for a few hundred files. At scale (millions of files across a Workspace domain), the architecture would evolve:

```
User triggers scan
      ↓
Create scan job in database (scan_id, user_id, status, last_page_token)
      ↓
Enqueue to background job queue (Cloud Tasks / BullMQ / SQS)
      ↓
Worker fetches one page at a time, persists checkpoint after each page
      ↓
If worker crashes → read checkpoint, resume from last_page_token
      ↓
Store analysis results in database (indexed, queryable, paginated)
      ↓
Redis cache for frequently-accessed results
      ↓
API serves pre-computed results to UI
```

See `DECISIONS.md` for more detail.
