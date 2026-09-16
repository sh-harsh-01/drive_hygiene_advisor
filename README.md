# Drive Hygiene Advisor

A Google Drive hygiene tool that identifies duplicate files, large storage consumers, and files with risky sharing permissions — summarised as a **Drive Hygiene Score** (0–100).

The **Google Workspace Add-on** runs the full analysis **inside the Google Drive right-side panel** using CardService — no browser tab is opened and no external URL is required.

Also ships a **Next.js 16** web dashboard (with TypeScript, Tailwind CSS v4, Recharts, and Lucide React) for a richer desktop experience.

---

## Features

| Feature | Description |
|---|---|
| **Self-contained Add-on** | Full analysis runs inside the Google Drive right-side panel — no external URL, no new tab |
| **Drive Hygiene Score** | Weighted 0–100 score: Risk (40%) + Duplicates (30%) + Storage (30%) |
| **Duplicate Detection** | Three-tier: Exact (MD5) → Strong (name+MIME+size) → Possible (name+MIME) |
| **Storage Insights** | Top 15 largest files ranked by size; unknown-size files never treated as 0 bytes |
| **Risk Scoring** | Explainable HIGH / MEDIUM / LOW with plain-English reasons per file |
| **Demo Mode** | Explicit DEMO_MODE script property — add-on never silently falls back to mock data |
| **Paginated Drive Scan** | Fetches up to 40,000 files across up to 200 pages via `nextPageToken` |
| **Next.js Web App** | Separate full-featured dashboard also available (independent of the Add-on) |

---

## Architecture

### Google Workspace Add-on (primary experience)

```
Google Drive
  └── Right-side panel
        └── Drive Hygiene Advisor Add-on  (addon/Code.gs)
              │
              ├── [Run Analysis]
              │       │
              │       ▼
              │   Drive.Files.list() — paginated, drive.metadata.readonly
              │       │
              │   DriveFile[] (normalized in normalizeFile_())
              │       │
              │   ┌───┴──────────────┬────────────────┐
              │   ▼                  ▼                ▼
              │  findDuplicates_() scoreRisk_()  analyzeStorage_()
              │   (EXACT/STRONG/    (HIGH/MED/   (top N by size,
              │    POSSIBLE tiers)   LOW + reasons) unknown size count)
              │       │
              │   computeHygieneScore_()
              │       │
              └── CardService results cards
                    ├── Results summary (score + counts)
                    ├── Duplicate Groups view
                    ├── Largest Files view
                    └── Risky Files view
```

### Next.js Web App (independent, also available)

```
Next.js App (app/)
  └── GET /api/drive/analyze
        └── Provider selection
              ├── MOCK_MODE=true  →  MockDriveProvider   (lib/drive/mock-provider.ts)
              └── authenticated   →  GoogleDriveProvider  (lib/drive/google-provider.ts)
                                          │
                                    Google Drive API v3
                                          │
                                    DriveFile[] (lib/drive/types.ts)
                                          │
                    ┌─────────────────────┼──────────────────────┐
                    ▼                     ▼                      ▼
             Duplicate Analyzer    Risk Analyzer          Storage Analyzer
             (lib/analysis/        (lib/analysis/         (lib/analysis/
              duplicates.ts)        risk.ts)               storage.ts)
                    │                     │                      │
                    └─────────────────────┼──────────────────────┘
                                          ▼
                                   Hygiene Score         Dashboard UI
                                   (lib/analysis/  →     (app/(dashboard)/)
                                    score.ts)
```

**Key principle:** The Apps Script analysis engines in `addon/Code.gs` are a direct port of the TypeScript engines in `lib/analysis/` — same business rules, same tier definitions, same scoring weights. The TypeScript tests in `tests/` serve as the specification for both implementations.

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
- **Google Apps Script** — Workspace Add-on (right-side panel entry point)

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

The UI shows a clear **"Demo Mode — Sample data"** badge. The app never silently falls back from real Drive to mock data.

---

## Google Cloud Setup

### Step 1 — Create a Google Cloud project

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Click **Select a project** → **New Project**
3. Name it e.g. `Drive Hygiene Advisor`
4. Click **Create**

### Step 2 — Enable the Google Drive API

1. In your project, go to **APIs & Services → Library**
2. Search for **Google Drive API**
3. Click it → **Enable**

### Step 3 — Enable the Google Workspace Marketplace SDK (for the add-on)

1. In **APIs & Services → Library**, search for **Google Workspace Marketplace SDK**
2. Click it → **Enable**

### Step 4 — Configure the OAuth consent screen

1. Go to **APIs & Services → OAuth consent screen**
2. Choose **External** (for personal Google accounts)
3. Fill in:
   - **App name:** Drive Hygiene Advisor
   - **User support email:** your email
   - **Developer contact:** your email
4. Click **Save and Continue**
5. On the **Scopes** step, click **Add or Remove Scopes** and add:
   ```
   https://www.googleapis.com/auth/drive.metadata.readonly
   ```
6. Click **Update** → **Save and Continue**
7. On the **Test users** step, add your personal Google email address
8. Click **Save and Continue** → **Back to Dashboard**

> **Note:** For personal/development use, you can keep the app in "Testing" status.
> The OAuth consent screen will show "This app isn't verified" — click **Advanced → Go to app (unsafe)** to proceed.

### Step 5 — Create OAuth credentials

1. Go to **APIs & Services → Credentials**
2. Click **+ Create Credentials → OAuth client ID**
3. Choose **Web application**
4. Name it e.g. `Drive Hygiene Advisor Web`
5. Under **Authorized redirect URIs**, add:
   - `http://localhost:3000/api/auth/callback/google` (for local development)
   - `https://your-app.vercel.app/api/auth/callback/google` (for production — add after deploying)
6. Click **Create**
7. Copy the **Client ID** and **Client Secret**

---

## OAuth Setup (Local)

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```
MOCK_MODE=false
GOOGLE_CLIENT_ID=your-client-id-here
GOOGLE_CLIENT_SECRET=your-client-secret-here
NEXTAUTH_SECRET=<generate with: openssl rand -base64 32>
NEXTAUTH_URL=http://localhost:3000
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Then run:

```bash
npm run dev
```

Click **Connect Google Drive** in the header to sign in.

---

## OAuth Scopes

The application requests **only**:

```
https://www.googleapis.com/auth/drive.metadata.readonly
```

This scope provides access to file metadata (name, size, MIME type, MD5 checksum, permissions, sharing information) but **does not** allow reading, downloading, modifying, or deleting file content. See `DECISIONS.md` — Decision 5 for the full rationale.

---

## Google Workspace Add-on Setup

The add-on makes the Drive Hygiene Advisor appear as an icon in the **right-side panel of Google Drive** (the same strip as Calendar, Tasks, and Keep).

The complete analysis runs **inside the panel** using CardService. No browser tab is opened and no external URL is required.

### How it works

```
Google Drive
  → Right-side panel → Add-on icon
      → [Run Analysis] button
          → Drive.Files.list() (paginated, metadata-only)
              → Analysis engines (duplicate / risk / storage / score)
                  → CardService result cards (in-panel)
```

### Step-by-step setup

1. Go to [script.google.com](https://script.google.com) and create a new project named `Drive Hygiene Advisor`.
2. In the editor, open **Project Settings** (⚙ gear icon) → enable **Show appsscript.json manifest file in editor**.
3. Copy the contents of `addon/appsscript.json` into the manifest.
4. Create a new script file `Code.gs` and copy the contents of `addon/Code.gs`.
5. In **Project Settings → Advanced Google Services**, enable **Drive API v3** (matches the `dependencies` in appsscript.json).
6. Click **Deploy → Test deployments → Install** to install the add-on on your account.
7. Open Google Drive — the Drive Hygiene Advisor icon appears in the right-side panel.
8. Click the icon, then **Run Analysis** to start the scan.

**OAuth consent:** On first run, Google will ask you to authorize `drive.metadata.readonly`. This is the only scope requested.

**Demo mode:** To test without scanning your real Drive, set `DEMO_MODE = true` in Project Settings → Script Properties. Remove this property to switch to real Drive data.

---

## Deploying the Next.js App (Vercel — recommended)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Follow the prompts, then set environment variables in the Vercel dashboard:
# MOCK_MODE=false
# GOOGLE_CLIENT_ID=...
# GOOGLE_CLIENT_SECRET=...
# NEXTAUTH_SECRET=...
# NEXTAUTH_URL=https://your-app.vercel.app
# NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
```

After deploying:
1. Add `https://your-app.vercel.app/api/auth/callback/google` to your OAuth client's redirect URIs in Google Cloud Console
2. Update the `APP_URL` Script Property in your Apps Script project to `https://your-app.vercel.app`

---

## Duplicate Detection Logic

Three tiers, applied in order (strongest first):

| Tier | Criteria | Confidence |
|---|---|---|
| **Exact** | Identical `md5Checksum` | Highest — files are binary identical |
| **Strong** | Same normalized name + same MIME type + exact same size | High — likely unintentional copies |
| **Possible** | Same normalized name + same MIME type, different or missing sizes | Medium — may be different versions |

**Filename normalization** strips: file extensions, version suffixes `(1)` `v2` `v3`, copy patterns `- Copy` `- Backup` `Copy of`, and date suffixes. Only clearly cosmetic patterns are removed.

**Not grouped:** Files with different MIME types (e.g. `Report.pdf` vs `Report.docx`) even if names match, because they are definitionally different files.

**No arbitrary size tolerance:** Two files must have the exact same `sizeBytes` to be STRONG candidates. There is no ±5% or similar tolerance.

**Tier exclusion:** Files matched as EXACT are excluded from STRONG/POSSIBLE tiers.

---

## Risk Classification

| Level | Criteria |
|---|---|
| **HIGH** | `anyone` permission exists — anyone with the link can access the file |
| **MEDIUM** | Domain-wide sharing, external user access, or shared with ≥5 people |
| **LOW** | Private (owner only) or limited sharing with internal collaborators |

**Important distinction:** `domain` sharing means "accessible to everyone in the organization" — it is **internal, not public**. Only `anyone` permissions are treated as potentially public-facing. The UI and reasons never describe domain sharing as public.

Every scored file includes a `reasons[]` array with plain-English explanations, rendered as chips in the UI.

---

## Storage Analysis

Files are grouped into 8 categories by MIME type:
Documents, Spreadsheets, Presentations, PDFs, Images, Videos, Archives, Other.

**Sorting:** Known-size files are sorted by size descending (largest first). Files with unknown size are never treated as 0 bytes.

**Native Google files** (Docs, Sheets, Slides, Forms) do not report a file size because they exist in Google's proprietary format. These are counted separately as "files with unknown size" and are excluded from storage totals.

---

## Error Handling

| Error | Handling |
|---|---|
| Not signed in | 401 response + `needsAuth: true` flag → UI shows "Connect Google Drive" |
| API 429 (rate limit) | Exponential backoff with jitter, max 3 retries, then throws |
| API 503 (service unavailable) | Same retry logic as 429 |
| API 400/404 (client error) | Throws immediately, no retry |
| Network failure | Error banner with retry button |
| Expired/invalid token | 401 from analyze route, clear "sign in" prompt |
| No files found | Empty states on each page with descriptive messages |
| Missing size metadata | "Size unavailable" displayed instead of 0 B |

---

## Security

- OAuth tokens and `GOOGLE_CLIENT_SECRET` are **server-side only** — never sent to the browser
- The access token is stored in the NextAuth JWT (encrypted cookie) and read server-side in the API route
- The client session only receives non-sensitive fields (user email, authenticated flag)
- Only `drive.metadata.readonly` is requested — no file content access
- Drive file contents are never read, downloaded, or stored
- No user-specific information is hardcoded in the source

---

## Testing

```bash
npm test
```

Tests cover all five modules:

| File | What's tested |
|---|---|
| `tests/duplicates.test.ts` | Normalization, all 3 tiers, folder/trash exclusion, missing checksum, missing size, sort order |
| `tests/risk.test.ts` | All 3 risk levels, reason content, sort order, anyone/domain/owner assertions |
| `tests/storage.test.ts` | MIME categorization, totals, unknown size handling, topN, sort order |
| `tests/score.test.ts` | Empty/clean Drive, HIGH vs MEDIUM penalty, label thresholds |
| `tests/google-provider.test.ts` | Pagination (single page, multi-page, correct pageToken), normalization, 429/503 retry, 400/404 no-retry, MAX_RETRIES exceeded |

All tests use mocked data — no real Google Drive access required.

---

## Limitations

- **Metadata only:** Duplicate detection cannot compare file content, only metadata. Two files with different checksums but identical content (e.g. re-uploaded files) are not detected as duplicates. MD5 checksums are unavailable for native Google Docs/Sheets/Slides.
- **Apps Script execution limit:** Add-on analysis runs synchronously. Standard Google accounts have a 6-minute execution limit; Google Workspace accounts have 30 minutes. Drives with more than ~40,000 files hit the safety page cap before the time limit. A clear message is shown if either limit is reached.
- **CardService widget limits:** The Google Drive right-side panel is ~280 px wide and uses CardService only. No HTML, React, or arbitrary CSS is possible inside the panel. The design uses `DecoratedText` and `TextParagraph` widgets for maximum compatibility.
- **No quota data:** The storage score component is flat at 100 in the prototype. Real quota analysis would require the Drive `about.get` endpoint, which is not available under `drive.metadata.readonly` in an add-on context.
- **No shared drives:** The add-on scans "My Drive" only. Shared/Team Drives would require `includeItemsFromAllDrives=true` and additional scopes.
- **No file remediation:** This is a read-only analysis tool. The add-on has no ability to delete, rename, or modify any files.
- **In-memory cache (Next.js app only):** The web app caches analysis results for 5 minutes in Node.js process memory. Not suitable for multi-instance deployments.
- **Personal account OAuth verification:** For personal accounts in testing, the OAuth consent screen shows "This app isn't verified". Click Advanced → Go to app to proceed.

---

## Production Scalability

The prototype uses a synchronous pipeline suitable for a few hundred files. At scale, the architecture would evolve:

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
