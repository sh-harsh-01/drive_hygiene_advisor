/**
 * Drive Hygiene Advisor — Google Workspace Add-on
 *
 * Self-contained analysis add-on. All Drive metadata fetching, duplicate
 * detection, risk scoring, storage analysis, and result rendering happen
 * entirely within this Apps Script project. No external URL is opened,
 * no browser tab is launched, and no iframe is used.
 *
 * Architecture
 * ────────────
 * Google Drive right-side panel
 *   └── Workspace Add-on (this script)
 *         └── CardService cards
 *               ├── Home card        → [Run Analysis]
 *               ├── Results card     → Hygiene Score + summary + navigation
 *               ├── Duplicates card  → duplicate groups by tier (EXACT/STRONG/POSSIBLE)
 *               ├── Large Files card → top files ranked by size
 *               └── Risky Files card → HIGH/MEDIUM risk with plain-English reasons
 *
 * Drive data is fetched via the Advanced Drive Service (Drive.Files.list()),
 * paginated with nextPageToken. Only drive.metadata.readonly is requested —
 * file content is never read or downloaded.
 *
 * Analysis engines are ported directly from lib/analysis/ TypeScript sources.
 * The same business rules, tier definitions, and scoring weights apply.
 * See the individual function comments for cross-references to the TS source.
 *
 * Demo/mock mode
 * ──────────────
 * Set DEMO_MODE = 'true' in Project Settings → Script Properties to run against
 * built-in sample data instead of your real Drive. The add-on NEVER silently
 * falls back from real data to mock data — mock mode is always explicit.
 *
 * Execution limits
 * ────────────────
 * Apps Script functions run for a maximum of 6 minutes (standard Google account)
 * or 30 minutes (Google Workspace accounts). Very large Drives may hit this limit.
 * The add-on caps fetching at MAX_PAGES pages and shows a clear message if reached,
 * rather than timing out silently.
 *
 * OAuth scopes (declared in appsscript.json):
 *   https://www.googleapis.com/auth/drive.metadata.readonly
 *
 * No write, delete, or content-access scopes are requested. This is a
 * read-only metadata analysis application.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Files fetched per page. Drive API maximum is 1000; 200 balances speed/safety. */
var PAGE_SIZE = 200;

/**
 * Maximum pages to fetch before stopping.
 * Safety cap: 200 pages × 200 files = up to 40,000 files.
 * Prevents execution-time timeout on very large Drives.
 */
var MAX_PAGES = 200;

/** Maximum retry attempts for 429 / 503 Drive API errors. */
var MAX_RETRIES = 3;

/** Top N largest files shown on the Large Files card. */
var TOP_N_FILES = 15;

/** Maximum duplicate groups rendered per card (prevents card overflow). */
var MAX_DUP_GROUPS_SHOWN = 20;

/** Maximum risky files rendered per card. */
var MAX_RISKY_FILES_SHOWN = 20;

// ─────────────────────────────────────────────────────────────────────────────
// Trigger functions (referenced from appsscript.json)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * onHomepage — fired from the common homepageTrigger.
 * Acts as a fallback for any host (Gmail, Docs, etc.) if the add-on is
 * ever extended to other surfaces.
 *
 * @param {Object} e - Event object
 * @returns {Card}
 */
function onHomepage(e) {
  return buildHomeCard_();
}

/**
 * onDriveHomepage — fired when the user opens Drive Hygiene Advisor
 * from the icon in the Google Drive right-side panel (no file selected).
 *
 * @param {Object} e - Event object
 * @returns {Card}
 */
function onDriveHomepage(e) {
  return buildHomeCard_();
}

/**
 * onDriveItemsSelected — fired when the user selects one or more Drive files.
 * Shows the same home card. A future version could show per-file hygiene info
 * for the selected items.
 *
 * @param {Object} e - Event object with e.drive.selectedItems
 * @returns {Card}
 */
function onDriveItemsSelected(e) {
  return buildHomeCard_();
}

// ─────────────────────────────────────────────────────────────────────────────
// Home Card
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Builds the home / welcome card.
 *
 * Shows a brief description of what the add-on does and a single
 * [Run Analysis] button. No Drive data is fetched at this stage.
 *
 * If DEMO_MODE is enabled, a notice is shown and the button label reflects this.
 *
 * @returns {Card}
 */
function buildHomeCard_() {
  var isDemoMode = isDemoModeEnabled_();

  var header = CardService.newCardHeader()
    .setTitle('Drive Hygiene Advisor')
    .setSubtitle('Google Drive analysis · in-panel');

  // ── Introduction ──────────────────────────────────────────────────────────
  var introSection = CardService.newCardSection();
  introSection.addWidget(
    CardService.newTextParagraph().setText(
      'Analyze your Google Drive for:\n' +
      '• Duplicate files (Exact / Strong / Possible)\n' +
      '• Storage-heavy files (largest first)\n' +
      '• Files with risky sharing permissions\n\n' +
      'Results appear here — no browser tab is opened.'
    )
  );

  if (isDemoMode) {
    introSection.addWidget(
      CardService.newDecoratedText()
        .setText('⚗ Demo Mode Active')
        .setBottomLabel(
          'Using built-in sample data. To use your real Drive, ' +
          'remove DEMO_MODE from Script Properties.'
        )
        .setWrapText(true)
    );
  }

  // ── Run button ────────────────────────────────────────────────────────────
  var actionsSection = CardService.newCardSection();
  actionsSection.addWidget(
    CardService.newTextButton()
      .setText(isDemoMode ? 'Run Analysis (Demo Mode)' : 'Run Analysis')
      .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
      .setOnClickAction(
        CardService.newAction().setFunctionName('runAnalysis')
      )
  );

  // ── Scope / about (collapsible) ───────────────────────────────────────────
  var aboutSection = CardService.newCardSection()
    .setHeader('About')
    .setCollapsible(true)
    .setNumUncollapsibleWidgets(0);

  aboutSection.addWidget(
    CardService.newTextParagraph().setText(
      '<b>Scope used:</b> <i>drive.metadata.readonly</i>\n' +
      'File content is never read or downloaded.\n\n' +
      '<b>Execution note:</b> Analysis is capped at ' + (MAX_PAGES * PAGE_SIZE).toLocaleString() + ' files ' +
      'to stay within Apps Script execution limits. ' +
      'Very large Drives may not be fully scanned in one pass.\n\n' +
      '<b>Scoring:</b> The Hygiene Score (0–100) is an attention indicator, ' +
      'not a security or compliance certification.'
    )
  );

  return CardService.newCardBuilder()
    .setHeader(header)
    .addSection(introSection)
    .addSection(actionsSection)
    .addSection(aboutSection)
    .build();
}

/**
 * Action handler: navigates back to the home card.
 * Called by "← Back" or "Re-scan" buttons.
 *
 * @returns {ActionResponse}
 */
function showHome(e) {
  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().pushCard(buildHomeCard_()))
    .build();
}

// ─────────────────────────────────────────────────────────────────────────────
// Run Analysis — Main Action Handler
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Main action handler invoked when [Run Analysis] is clicked.
 *
 * Steps:
 *   1. Fetch Drive metadata (paginated, with retry)
 *   2. Run duplicate detection
 *   3. Run risk analysis
 *   4. Run storage analysis
 *   5. Compute hygiene score
 *   6. Navigate to the results summary card
 *
 * Error handling:
 *   - OAuth/auth errors      → friendly auth error card
 *   - Rate limit (429)       → friendly rate limit card
 *   - Transient errors (503) → friendly retry card
 *   - Execution timeout      → partial-results card with file count
 *   - Empty Drive            → empty state card
 *   - All other errors       → generic error card (no raw API errors exposed)
 *
 * @param {Object} e - Action event object
 * @returns {ActionResponse}
 */
function runAnalysis(e) {
  try {
    var files;

    if (isDemoModeEnabled_()) {
      // Explicit demo mode — use built-in sample data
      files = getMockFiles_();
    } else {
      // Real Drive — fetch with pagination
      files = fetchDriveFiles_();
    }

    if (!files || files.length === 0) {
      return CardService.newActionResponseBuilder()
        .setNavigation(
          CardService.newNavigation().pushCard(buildEmptyDriveCard_())
        )
        .build();
    }

    // Run all analysis engines
    var nonFolders = files.filter(function (f) {
      return !f.isFolder && !f.trashed;
    });

    var dupGroups    = findDuplicates_(files);
    var riskyFiles   = getRiskyFiles_(files);
    var storageResult = analyzeStorage_(files);
    var score        = computeHygieneScore_(nonFolders.length, riskyFiles, dupGroups);

    // Bundle results for navigation (passed as JSON through CardService parameters)
    var results = {
      filesScanned:  nonFolders.length,
      dupGroups:     dupGroups,
      riskyFiles:    riskyFiles,
      storageResult: storageResult,
      score:         score,
      isDemoMode:    isDemoModeEnabled_()
    };

    return CardService.newActionResponseBuilder()
      .setNavigation(
        CardService.newNavigation().pushCard(buildResultsCard_(results))
      )
      .build();

  } catch (err) {
    return CardService.newActionResponseBuilder()
      .setNavigation(
        CardService.newNavigation().pushCard(buildErrorCard_(classifyError_(err)))
      )
      .build();
  }
}

/**
 * Translates a raw error into a human-readable message.
 * Raw API error strings are never shown to the user.
 *
 * @param {Error} err
 * @returns {string}
 */
function classifyError_(err) {
  var msg = (err && err.message) ? err.message : '';

  if (msg.indexOf('Authorization') !== -1 ||
      msg.indexOf('401') !== -1 ||
      msg.indexOf('invalid_grant') !== -1) {
    return (
      'Authorization failed. Please ensure the add-on has been granted ' +
      'Drive access and try again.\n\n' +
      'You may need to re-authorize the add-on in your Google account settings.'
    );
  }

  if (msg.indexOf('429') !== -1 ||
      msg.indexOf('rateLimitExceeded') !== -1 ||
      msg.indexOf('userRateLimitExceeded') !== -1) {
    return (
      'Google Drive rate limit reached. Please wait a moment and try again. ' +
      'This can happen if you scan frequently in a short period.'
    );
  }

  if (msg.indexOf('503') !== -1 ||
      msg.indexOf('serviceUnavailable') !== -1 ||
      msg.indexOf('Backend Error') !== -1) {
    return (
      'Google Drive is temporarily unavailable. Please try again in a minute.'
    );
  }

  if (msg.indexOf('Exceeded maximum execution time') !== -1 ||
      msg.indexOf('time') !== -1) {
    return (
      'Analysis timed out. Your Drive may have too many files to scan in one pass. ' +
      'The scan was capped at ' + (MAX_PAGES * PAGE_SIZE).toLocaleString() + ' files. ' +
      'Try again — results from the files scanned so far are shown below.'
    );
  }

  return (
    'Unable to analyze your Drive right now. Please try again.\n\n' +
    'If this problem persists, check that the add-on has Drive access in ' +
    'your Google account settings.'
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Drive API — Paginated Metadata Fetching
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetches all non-trashed file metadata from Google Drive using the
 * Advanced Drive Service (Drive.Files.list).
 *
 * Pagination: cursor-based via nextPageToken — each page is fetched
 * sequentially and normalized before the next page is requested.
 *
 * Retry: exponential back-off with jitter for 429 / 503 errors, up to
 * MAX_RETRIES attempts per page.
 *
 * Safety cap: stops after MAX_PAGES pages to stay within Apps Script
 * execution time limits. If the cap is reached, the existing files are
 * returned with a console warning.
 *
 * Fields (metadata only — no file content):
 *   id, name, mimeType, size, md5Checksum, createdTime, modifiedTime,
 *   webViewLink, owners, permissions, shared, trashed
 *
 * Scope required: drive.metadata.readonly
 *
 * @returns {Array} Normalized DriveFile objects (non-trashed)
 */
function fetchDriveFiles_() {
  var fields =
    'nextPageToken,files(' +
    'id,name,mimeType,size,md5Checksum,' +
    'createdTime,modifiedTime,webViewLink,' +
    'owners,permissions,shared,trashed)';

  var allFiles  = [];
  var pageToken = null;
  var pageCount = 0;

  do {
    var params = {
      pageSize:          PAGE_SIZE,
      fields:            fields,
      q:                 'trashed = false',
      supportsAllDrives: false
    };
    if (pageToken) {
      params.pageToken = pageToken;
    }

    var response = fetchPageWithRetry_(params);
    var rawFiles = response.files || [];

    for (var i = 0; i < rawFiles.length; i++) {
      allFiles.push(normalizeFile_(rawFiles[i]));
    }

    pageToken = response.nextPageToken || null;
    pageCount++;

    if (pageCount >= MAX_PAGES) {
      // Safety cap reached — stop and return what we have
      console.log(
        'Drive Hygiene Advisor: reached MAX_PAGES (' + MAX_PAGES + '). ' +
        'Processed ' + allFiles.length + ' files. Analysis will be partial.'
      );
      break;
    }
  } while (pageToken);

  return allFiles;
}

/**
 * Fetches a single page of Drive file metadata, retrying on 429 / 503.
 *
 * Retry strategy: exponential back-off with jitter.
 *   Attempt 1 → wait 2s + jitter
 *   Attempt 2 → wait 4s + jitter
 *   Attempt 3 → wait 8s + jitter
 *   Attempt 4 → throw
 *
 * @param {Object} params   - Drive.Files.list() parameters
 * @param {number} [attempt=1] - Current attempt number (1-indexed)
 * @returns {Object} Drive API page response
 */
function fetchPageWithRetry_(params, attempt) {
  attempt = attempt || 1;
  try {
    return Drive.Files.list(params);
  } catch (err) {
    var msg = (err && err.message) ? err.message : '';
    var isRateLimit = msg.indexOf('429') !== -1 ||
                      msg.indexOf('rateLimitExceeded') !== -1 ||
                      msg.indexOf('userRateLimitExceeded') !== -1;
    var isTransient = msg.indexOf('503') !== -1 ||
                      msg.indexOf('Backend Error') !== -1 ||
                      msg.indexOf('serviceUnavailable') !== -1;

    if ((isRateLimit || isTransient) && attempt <= MAX_RETRIES) {
      // Exponential back-off: 2^attempt seconds + up to 500ms jitter
      var delayMs = Math.pow(2, attempt) * 1000 + Math.floor(Math.random() * 500);
      Utilities.sleep(delayMs);
      return fetchPageWithRetry_(params, attempt + 1);
    }
    throw err;
  }
}

/**
 * Normalizes a raw Drive API file resource into the internal DriveFile shape.
 *
 * Mirrors the normalization performed by GoogleDriveProvider in
 * lib/drive/google-provider.ts. The shape is identical to DriveFile in
 * lib/drive/types.ts so that the analysis engines use the same contracts.
 *
 * @param {Object} raw - Raw file resource from Drive.Files.list()
 * @returns {Object} Normalized DriveFile
 */
function normalizeFile_(raw) {
  // Normalize permissions array
  var permissions = [];
  if (raw.permissions && Array.isArray(raw.permissions)) {
    for (var i = 0; i < raw.permissions.length; i++) {
      var p = raw.permissions[i];
      permissions.push({
        type:         p.type         || 'user',
        role:         p.role         || 'reader',
        emailAddress: p.emailAddress || null,
        domain:       p.domain       || null,
        displayName:  p.displayName  || null
      });
    }
  }

  // Owner email (first owner only, consistent with GoogleDriveProvider)
  var ownerEmail = null;
  if (raw.owners && raw.owners.length > 0 && raw.owners[0].emailAddress) {
    ownerEmail = raw.owners[0].emailAddress;
  }

  // File size — null for native Google Docs/Sheets/Slides (no size reported)
  var sizeBytes = null;
  if (raw.size !== undefined && raw.size !== null && raw.size !== '') {
    var parsed = parseInt(raw.size, 10);
    if (!isNaN(parsed)) sizeBytes = parsed;
  }

  return {
    id:           raw.id           || '',
    name:         raw.name         || 'Untitled',
    mimeType:     raw.mimeType     || 'application/octet-stream',
    sizeBytes:    sizeBytes,
    md5Checksum:  raw.md5Checksum  || null,
    createdTime:  raw.createdTime  || new Date().toISOString(),
    modifiedTime: raw.modifiedTime || new Date().toISOString(),
    webViewLink:  raw.webViewLink  || null,
    ownerEmail:   ownerEmail,
    permissions:  permissions,
    shared:       raw.shared  === true,
    trashed:      raw.trashed === true,
    isFolder:     raw.mimeType === 'application/vnd.google-apps.folder'
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Analysis Engine — Filename Normalization
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Normalizes a filename for duplicate comparison.
 *
 * Strips:
 *   - File extension (last .ext segment)
 *   - Numeric suffix: (1), (2), (3), …
 *   - Version suffix: v2, v3, - v2, - v3.1, …
 *   - Copy/backup patterns: "- Copy", "- Backup", "- Bak", "- Final", "- Draft"
 *   - Copy prefix: "Copy of …"
 *   - ISO date suffix: 2026-09-01 or 20260901
 *   - Trailing punctuation, dashes, underscores, and whitespace
 *
 * Conservative approach — only strips clearly cosmetic patterns.
 * Mid-word numbers (e.g. "Q3 Report") are preserved.
 *
 * Returns a lowercase, trimmed string suitable for grouping keys.
 *
 * Ported from: lib/analysis/duplicates.ts → normalizeName()
 *
 * @param {string} filename
 * @returns {string}
 */
function normalizeName_(filename) {
  // Remove extension (last .ext segment)
  var withoutExt = filename.replace(/\.[^/.]+$/, '');

  return withoutExt
    .toLowerCase()
    // Numeric suffix: (1), (2), …
    .replace(/\s*\(\d+\)\s*$/, '')
    // Version suffix: - v2, - v3.1, v2, v3
    .replace(/\s*[-–]\s*v\d+(\.\d+)?\s*$/i, '')
    .replace(/\s+v\d+(\.\d+)?\s*$/i, '')
    // Copy / backup patterns
    .replace(/\s*[-–]\s*(copy|backup|bak|final|draft)\s*$/i, '')
    // "Copy of" prefix
    .replace(/^copy\s+of\s+/i, '')
    // ISO date suffix: 2026-09-01 or 20260901
    .replace(/\s*[-_]?\d{4}[-_]\d{2}[-_]\d{2}\s*$/, '')
    .replace(/\s*[-_]?\d{8}\s*$/, '')
    // Trailing punctuation, dashes, underscores, whitespace
    .replace(/[-–_\s]+$/, '')
    .trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// Analysis Engine — Duplicate Detection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Groups files into duplicate candidates using a three-tier approach.
 *
 * EXACT    — identical md5Checksum (binary identical; strongest evidence)
 *            Files without a checksum skip this tier (native Docs/Sheets have none).
 *
 * STRONG   — same normalized name + same MIME type + exact same sizeBytes
 *            (no ±5% tolerance — exact byte match required)
 *
 * POSSIBLE — same normalized name + same MIME type, but size differs or unknown
 *            (may be different versions of the same document)
 *
 * EXACT-matched files are excluded from STRONG and POSSIBLE tiers.
 * Folders (mimeType = application/vnd.google-apps.folder) are excluded.
 * Trashed files are excluded.
 *
 * Results are sorted: EXACT → STRONG → POSSIBLE
 *
 * Ported from: lib/analysis/duplicates.ts → findDuplicates()
 *
 * @param {Array} files - Normalized DriveFile objects
 * @returns {Array} DuplicateGroup objects
 */
function findDuplicates_(files) {
  var nonFolders = files.filter(function (f) {
    return !f.isFolder && !f.trashed;
  });

  var groups      = [];
  var accountedIds = {};     // IDs already placed in an EXACT group

  // ── Tier 1: EXACT (md5Checksum) ──────────────────────────────────────────
  var byChecksum = {};
  for (var i = 0; i < nonFolders.length; i++) {
    var f = nonFolders[i];
    if (!f.md5Checksum) continue;
    if (!byChecksum[f.md5Checksum]) byChecksum[f.md5Checksum] = [];
    byChecksum[f.md5Checksum].push(f);
  }

  for (var checksum in byChecksum) {
    if (!byChecksum.hasOwnProperty(checksum)) continue;
    var bucket = byChecksum[checksum];
    if (bucket.length < 2) continue;

    var combined = 0;
    for (var j = 0; j < bucket.length; j++) {
      if (bucket[j].sizeBytes !== null) combined += bucket[j].sizeBytes;
    }

    groups.push({
      tier:          'EXACT',
      files:         bucket,
      combinedBytes: combined,
      reason:        'These files have the same checksum — they are binary identical.'
    });

    for (var k = 0; k < bucket.length; k++) {
      accountedIds[bucket[k].id] = true;
    }
  }

  // ── Tier 2: STRONG + Tier 3: POSSIBLE (normalized name + MIME) ───────────
  var byNameMime = {};
  for (var i = 0; i < nonFolders.length; i++) {
    var f = nonFolders[i];
    if (accountedIds[f.id]) continue;           // already in EXACT group
    var key = normalizeName_(f.name) + '::' + f.mimeType;
    if (!byNameMime[key]) byNameMime[key] = [];
    byNameMime[key].push(f);
  }

  for (var key in byNameMime) {
    if (!byNameMime.hasOwnProperty(key)) continue;
    var bucket = byNameMime[key];
    if (bucket.length < 2) continue;

    // Collect known sizes
    var knownSizes = [];
    for (var j = 0; j < bucket.length; j++) {
      if (bucket[j].sizeBytes !== null) knownSizes.push(bucket[j].sizeBytes);
    }

    // STRONG: every file has a known size AND all sizes are identical
    var allSameSize =
      knownSizes.length === bucket.length &&
      knownSizes.length > 0 &&
      knownSizes.every(function (s) { return s === knownSizes[0]; });

    if (allSameSize) {
      var combined = knownSizes.reduce(function (sum, s) { return sum + s; }, 0);
      groups.push({
        tier:          'STRONG',
        files:         bucket,
        combinedBytes: combined,
        reason:
          'These files share the same name (after removing version/copy suffixes), ' +
          'file type, and size.'
      });
    } else {
      groups.push({
        tier:          'POSSIBLE',
        files:         bucket,
        combinedBytes: null,
        reason:
          'These files share the same name and file type but have different sizes — ' +
          'they may be different versions of the same document.'
      });
    }
  }

  // Sort groups: EXACT → STRONG → POSSIBLE
  var tierOrder = { EXACT: 0, STRONG: 1, POSSIBLE: 2 };
  groups.sort(function (a, b) {
    return (tierOrder[a.tier] || 0) - (tierOrder[b.tier] || 0);
  });

  return groups;
}

// ─────────────────────────────────────────────────────────────────────────────
// Analysis Engine — Risk Scoring
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Scores the sharing risk of a single Drive file.
 *
 * Permission type meanings (documented for clarity):
 *   "anyone"  — File is accessible to anyone with the link,
 *               regardless of whether they have a Google account.
 *               Closest thing to "public" in Drive.
 *   "domain"  — Accessible to all users in a specific Google Workspace
 *               domain (internal org sharing). NOT public.
 *               Domain sharing is NEVER described as public in reasons.
 *   "group"   — Shared with a specific Google Group.
 *   "user"    — Shared with one specific person.
 *
 * Risk levels:
 *   HIGH   — "anyone" permission exists
 *            Score 75–90 depending on role (reader/commenter/writer)
 *   MEDIUM — domain-wide sharing, external users, or ≥5 non-owner recipients
 *            Score 50–65 depending on combination
 *   LOW    — private (owner only) or limited internal sharing
 *            Score 10–25
 *
 * Every result includes a reasons[] array of plain-English explanations.
 *
 * Ported from: lib/analysis/risk.ts → scoreRisk()
 *
 * @param {Object} file - Normalized DriveFile
 * @returns {Object} { level: 'HIGH'|'MEDIUM'|'LOW', score: number, reasons: string[] }
 */
function scoreRisk_(file) {
  var reasons = [];
  var score   = 0;
  var perms   = file.permissions || [];

  // ── HIGH: anyone-with-link ────────────────────────────────────────────────
  var anyonePerms = perms.filter(function (p) { return p.type === 'anyone'; });
  for (var i = 0; i < anyonePerms.length; i++) {
    var p = anyonePerms[i];
    if (p.role === 'writer' || p.role === 'organizer') {
      reasons.push('Anyone with the link can edit this file.');
      score = Math.max(score, 90);
    } else if (p.role === 'commenter') {
      reasons.push('Anyone with the link can comment on this file.');
      score = Math.max(score, 80);
    } else if (p.role === 'reader') {
      reasons.push('Anyone with the link can view this file.');
      score = Math.max(score, 75);
    }
  }

  if (anyonePerms.length > 0) {
    return { level: 'HIGH', score: score, reasons: reasons };
  }

  // ── MEDIUM: domain-wide sharing ───────────────────────────────────────────
  // NOTE: "domain" = internal org sharing, NOT public. Never describe as public.
  var domainPerms = perms.filter(function (p) { return p.type === 'domain'; });
  for (var i = 0; i < domainPerms.length; i++) {
    var p = domainPerms[i];
    var domainName = p.domain || 'your organization';
    if (p.role === 'writer') {
      reasons.push('Everyone in ' + domainName + ' can edit this file.');
      score = Math.max(score, 65);
    } else {
      reasons.push('Everyone in ' + domainName + ' can view this file.');
      score = Math.max(score, 55);
    }
  }

  // ── MEDIUM: external users ────────────────────────────────────────────────
  var ownerDomain = null;
  if (file.ownerEmail && file.ownerEmail.indexOf('@') !== -1) {
    ownerDomain = file.ownerEmail.split('@')[1];
  }

  var externalUsers = perms.filter(function (p) {
    return (
      p.type === 'user' &&
      p.role !== 'owner' &&
      p.emailAddress &&
      ownerDomain &&
      p.emailAddress.indexOf('@' + ownerDomain) === -1
    );
  });

  if (externalUsers.length > 0) {
    var emails = externalUsers
      .slice(0, 2)
      .map(function (p) { return p.emailAddress; })
      .join(', ');
    var extra = externalUsers.length > 2
      ? ' and ' + (externalUsers.length - 2) + ' more'
      : '';
    reasons.push('Shared with external users: ' + emails + extra + '.');
    score = Math.max(score, 60);
  }

  // ── MEDIUM: large number of recipients ────────────────────────────────────
  var nonOwnerPerms = perms.filter(function (p) { return p.role !== 'owner'; });
  if (nonOwnerPerms.length >= 5) {
    reasons.push('Shared with ' + nonOwnerPerms.length + ' people or groups.');
    score = Math.max(score, 50);
  }

  if (score >= 50) {
    return { level: 'MEDIUM', score: score, reasons: reasons };
  }

  // ── LOW: private or limited internal sharing ──────────────────────────────
  var nonOwnerCount = perms.filter(function (p) { return p.role !== 'owner'; }).length;
  if (nonOwnerCount === 0) {
    reasons.push('This file is private — only you can access it.');
    score = 10;
  } else {
    reasons.push('Shared with a small number of trusted collaborators.');
    score = 25;
  }

  return { level: 'LOW', score: score, reasons: reasons };
}

/**
 * Returns all HIGH and MEDIUM risk files, sorted by risk score descending.
 * Folders and trashed files are excluded.
 *
 * Ported from: lib/analysis/risk.ts → getRiskyFiles()
 *
 * @param {Array} files - Normalized DriveFile objects
 * @returns {Array} { file, risk } objects
 */
function getRiskyFiles_(files) {
  return files
    .filter(function (f) { return !f.isFolder && !f.trashed; })
    .map(function (file) { return { file: file, risk: scoreRisk_(file) }; })
    .filter(function (r) { return r.risk.level !== 'LOW'; })
    .sort(function (a, b) { return b.risk.score - a.risk.score; });
}

// ─────────────────────────────────────────────────────────────────────────────
// Analysis Engine — Storage Analysis
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Analyzes storage usage across a file set.
 *
 * Files with null sizeBytes (native Google Docs, Sheets, Slides) are:
 *   - Counted separately as filesWithUnknownSize
 *   - NEVER treated as 0 bytes
 *   - Excluded from totalKnownBytes and topFiles
 *
 * Ported from: lib/analysis/storage.ts → analyzeStorage()
 *
 * @param {Array} files - Normalized DriveFile objects
 * @returns {Object} { totalKnownBytes, filesWithUnknownSize, topFiles }
 */
function analyzeStorage_(files) {
  var nonFolders = files.filter(function (f) { return !f.isFolder && !f.trashed; });

  var filesWithSize        = nonFolders.filter(function (f) { return f.sizeBytes !== null; });
  var filesWithUnknownSize = nonFolders.filter(function (f) { return f.sizeBytes === null; }).length;

  var totalKnownBytes = filesWithSize.reduce(
    function (sum, f) { return sum + f.sizeBytes; },
    0
  );

  var topFiles = filesWithSize
    .slice()
    .sort(function (a, b) { return b.sizeBytes - a.sizeBytes; })
    .slice(0, TOP_N_FILES);

  return {
    totalKnownBytes:      totalKnownBytes,
    filesWithUnknownSize: filesWithUnknownSize,
    topFiles:             topFiles
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Analysis Engine — Hygiene Score
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Computes the overall Drive Hygiene Score (0–100).
 *
 * IMPORTANT: This score is an attention indicator, not a security or compliance
 * certification. A score of 100 means fewer items need the user's attention —
 * it does not certify the Drive as secure or compliant.
 *
 * Weighting:
 *   Risk component      40%  — proportion of HIGH/MEDIUM-risk files
 *                              (HIGH penalises 3× more than MEDIUM)
 *   Duplicate component 30%  — proportion of files in duplicate groups
 *   Storage component   30%  — flat 100 in prototype (quota data unavailable
 *                              without the Drive About API)
 *
 * Score labels:
 *   85–100  Excellent
 *   70–84   Good
 *   40–69   Needs Attention
 *   0–39    Poor
 *
 * Ported from: lib/analysis/score.ts → computeHygieneScore()
 *
 * @param {number} totalFiles - Count of non-folder, non-trashed files
 * @param {Array}  riskyFiles - getRiskyFiles_ output (HIGH+MEDIUM only)
 * @param {Array}  dupGroups  - findDuplicates_ output
 * @returns {Object} { score, label, breakdown: { riskScore, duplicateScore, storageScore } }
 */
function computeHygieneScore_(totalFiles, riskyFiles, dupGroups) {
  if (totalFiles === 0) {
    return {
      score: 100,
      label: 'Excellent',
      breakdown: { riskScore: 100, duplicateScore: 100, storageScore: 100 }
    };
  }

  // ── Risk component ────────────────────────────────────────────────────────
  var highCount   = riskyFiles.filter(function (r) { return r.risk.level === 'HIGH'; }).length;
  var mediumCount = riskyFiles.filter(function (r) { return r.risk.level === 'MEDIUM'; }).length;

  // HIGH-risk files penalise 3× more than MEDIUM-risk
  var weightedRiskPct = (highCount * 3 + mediumCount) / (totalFiles * 3);
  var riskScore       = Math.max(0, Math.round(100 - weightedRiskPct * 100));

  // ── Duplicate component ───────────────────────────────────────────────────
  var dupFileIds = {};
  for (var i = 0; i < dupGroups.length; i++) {
    for (var j = 0; j < dupGroups[i].files.length; j++) {
      dupFileIds[dupGroups[i].files[j].id] = true;
    }
  }
  var duplicateFilePct = Object.keys(dupFileIds).length / totalFiles;
  var duplicateScore   = Math.max(0, Math.round(100 - duplicateFilePct * 100));

  // ── Storage component (prototype: flat 100) ───────────────────────────────
  // The Drive About API (quota data) requires authentication beyond what
  // drive.metadata.readonly provides in a Workspace Add-on context.
  var storageScore = 100;

  // ── Weighted total ────────────────────────────────────────────────────────
  var score = Math.round(riskScore * 0.4 + duplicateScore * 0.3 + storageScore * 0.3);

  return {
    score: score,
    label: labelFor_(score),
    breakdown: {
      riskScore:      riskScore,
      duplicateScore: duplicateScore,
      storageScore:   storageScore
    }
  };
}

/**
 * Maps a 0–100 score to a human-readable hygiene label.
 *
 * @param {number} score
 * @returns {string}
 */
function labelFor_(score) {
  if (score >= 85) return 'Excellent';
  if (score >= 70) return 'Good';
  if (score >= 40) return 'Needs Attention';
  return 'Poor';
}

// ─────────────────────────────────────────────────────────────────────────────
// Formatting Utilities
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Formats a byte count into a human-readable string with one decimal place.
 * Ported from: lib/utils.ts → formatBytes()
 *
 * @param {number} bytes
 * @returns {string}
 */
function formatBytes_(bytes) {
  if (bytes === 0) return '0 B';
  var k     = 1024;
  var sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  var i     = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

/**
 * Returns a short, human-readable label for a MIME type.
 * Ported from: lib/utils.ts → mimeLabel()
 *
 * @param {string} mimeType
 * @returns {string}
 */
function mimeLabel_(mimeType) {
  var map = {
    'application/pdf':                                                                'PDF',
    'application/zip':                                                                'ZIP',
    'application/x-zip-compressed':                                                   'ZIP',
    'application/x-tar':                                                              'TAR',
    'application/gzip':                                                               'GZ',
    'application/x-7z-compressed':                                                    '7Z',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document':        'Word',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':              'Excel',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation':      'PowerPoint',
    'application/vnd.ms-excel':                                                       'Excel',
    'application/msword':                                                             'Word',
    'application/vnd.google-apps.document':                                           'Google Doc',
    'application/vnd.google-apps.spreadsheet':                                        'Google Sheet',
    'application/vnd.google-apps.presentation':                                       'Google Slides',
    'application/vnd.google-apps.folder':                                             'Folder',
    'image/jpeg':                                                                     'JPEG',
    'image/png':                                                                      'PNG',
    'image/gif':                                                                      'GIF',
    'image/vnd.adobe.photoshop':                                                      'Photoshop',
    'video/mp4':                                                                      'MP4',
    'video/quicktime':                                                                'MOV',
    'audio/mpeg':                                                                     'MP3',
    'text/plain':                                                                     'Text',
    'text/csv':                                                                       'CSV'
  };
  if (map[mimeType]) return map[mimeType];
  if (mimeType && mimeType.indexOf('image/') === 0)  return 'Image';
  if (mimeType && mimeType.indexOf('video/') === 0)  return 'Video';
  if (mimeType && mimeType.indexOf('audio/') === 0)  return 'Audio';
  return 'File';
}

// ─────────────────────────────────────────────────────────────────────────────
// Results Summary Card
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Builds the results summary card shown after analysis completes.
 *
 * Displays:
 *   - Hygiene Score (0–100) and label
 *   - Score breakdown (risk / duplicate / storage components)
 *   - Key counts (files scanned, risky files, duplicate groups, storage)
 *   - Navigation buttons to detail cards
 *   - Re-scan button
 *
 * @param {Object} results - Analysis results bundle
 * @returns {Card}
 */
function buildResultsCard_(results) {
  var score     = results.score;
  var isDemoMode = results.isDemoMode;

  // ── Header ────────────────────────────────────────────────────────────────
  var header = CardService.newCardHeader()
    .setTitle('Hygiene Score: ' + score.score + ' / 100')
    .setSubtitle(score.label + (isDemoMode ? '  ·  ⚗ Demo Mode' : ''));

  // ── Score section ─────────────────────────────────────────────────────────
  var scoreSection = CardService.newCardSection().setHeader('Score Breakdown');

  scoreSection.addWidget(
    CardService.newDecoratedText()
      .setText(score.score + ' / 100  —  ' + score.label)
      .setBottomLabel(
        'Risk: ' + score.breakdown.riskScore +
        '  ·  Duplicates: ' + score.breakdown.duplicateScore +
        '  ·  Storage: ' + score.breakdown.storageScore
      )
      .setWrapText(true)
  );

  // ── Summary section ───────────────────────────────────────────────────────
  var summarySection = CardService.newCardSection().setHeader('Overview');

  summarySection.addWidget(
    CardService.newDecoratedText()
      .setTopLabel('Files Scanned')
      .setText(String(results.filesScanned))
  );

  summarySection.addWidget(
    CardService.newDecoratedText()
      .setTopLabel('Risky Files (HIGH + MEDIUM)')
      .setText(String(results.riskyFiles.length))
  );

  summarySection.addWidget(
    CardService.newDecoratedText()
      .setTopLabel('Duplicate Groups')
      .setText(String(results.dupGroups.length))
  );

  summarySection.addWidget(
    CardService.newDecoratedText()
      .setTopLabel('Known Storage')
      .setText(formatBytes_(results.storageResult.totalKnownBytes))
  );

  if (results.storageResult.topFiles.length > 0) {
    var largestFile = results.storageResult.topFiles[0];
    summarySection.addWidget(
      CardService.newDecoratedText()
        .setTopLabel('Largest File')
        .setText(largestFile.name + '  —  ' + formatBytes_(largestFile.sizeBytes))
        .setWrapText(true)
    );
  }

  if (results.storageResult.filesWithUnknownSize > 0) {
    summarySection.addWidget(
      CardService.newDecoratedText()
        .setTopLabel('Unknown Size (native Google files)')
        .setText(String(results.storageResult.filesWithUnknownSize) + ' files')
        .setWrapText(true)
    );
  }

  // ── Navigation section ────────────────────────────────────────────────────
  var navSection = CardService.newCardSection().setHeader('View Details');

  if (results.dupGroups.length > 0) {
    navSection.addWidget(
      CardService.newTextButton()
        .setText('View Duplicate Groups (' + results.dupGroups.length + ')')
        .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
        .setOnClickAction(
          CardService.newAction()
            .setFunctionName('showDuplicatesCard')
            .setParameters({ resultsJson: JSON.stringify(results) })
        )
    );
  }

  if (results.storageResult.topFiles.length > 0) {
    navSection.addWidget(
      CardService.newTextButton()
        .setText('View Largest Files (' + results.storageResult.topFiles.length + ')')
        .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
        .setOnClickAction(
          CardService.newAction()
            .setFunctionName('showLargeFilesCard')
            .setParameters({ resultsJson: JSON.stringify(results) })
        )
    );
  }

  if (results.riskyFiles.length > 0) {
    navSection.addWidget(
      CardService.newTextButton()
        .setText('View Risky Files (' + results.riskyFiles.length + ')')
        .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
        .setOnClickAction(
          CardService.newAction()
            .setFunctionName('showRiskyFilesCard')
            .setParameters({ resultsJson: JSON.stringify(results) })
        )
    );
  }

  navSection.addWidget(
    CardService.newTextButton()
      .setText('← Re-scan')
      .setTextButtonStyle(CardService.TextButtonStyle.TEXT)
      .setOnClickAction(CardService.newAction().setFunctionName('showHome'))
  );

  // ── Score note (collapsible) ──────────────────────────────────────────────
  var noteSection = CardService.newCardSection()
    .setHeader('About this score')
    .setCollapsible(true)
    .setNumUncollapsibleWidgets(0);

  noteSection.addWidget(
    CardService.newTextParagraph().setText(
      'The Hygiene Score is an attention indicator (0–100), not a security ' +
      'or compliance certification.\n\n' +
      'Weights: Risk 40% · Duplicates 30% · Storage 30%\n\n' +
      'A score of 100 means no items require your attention, not that the ' +
      'Drive is certified secure.'
    )
  );

  return CardService.newCardBuilder()
    .setHeader(header)
    .addSection(scoreSection)
    .addSection(summarySection)
    .addSection(navSection)
    .addSection(noteSection)
    .build();
}

// ─────────────────────────────────────────────────────────────────────────────
// Navigation Action Handlers — called by detail-card buttons
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Navigates to the Duplicates card.
 * The full results bundle is passed via CardService action parameters (JSON).
 *
 * @param {Object} e - Action event with e.parameters.resultsJson
 * @returns {ActionResponse}
 */
function showDuplicatesCard(e) {
  var results = JSON.parse(e.parameters.resultsJson);
  return CardService.newActionResponseBuilder()
    .setNavigation(
      CardService.newNavigation().pushCard(buildDuplicatesCard_(results.dupGroups))
    )
    .build();
}

/**
 * Navigates to the Large Files card.
 *
 * @param {Object} e - Action event with e.parameters.resultsJson
 * @returns {ActionResponse}
 */
function showLargeFilesCard(e) {
  var results = JSON.parse(e.parameters.resultsJson);
  return CardService.newActionResponseBuilder()
    .setNavigation(
      CardService.newNavigation().pushCard(buildLargeFilesCard_(results.storageResult))
    )
    .build();
}

/**
 * Navigates to the Risky Files card.
 *
 * @param {Object} e - Action event with e.parameters.resultsJson
 * @returns {ActionResponse}
 */
function showRiskyFilesCard(e) {
  var results = JSON.parse(e.parameters.resultsJson);
  return CardService.newActionResponseBuilder()
    .setNavigation(
      CardService.newNavigation().pushCard(buildRiskyFilesCard_(results.riskyFiles))
    )
    .build();
}

/**
 * Back navigation handler — pops the current card off the CardService stack,
 * returning to the parent results card. Used by all detail cards.
 *
 * @returns {ActionResponse}
 */
function goBack_(e) {
  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().popCard())
    .build();
}

// ─────────────────────────────────────────────────────────────────────────────
// Detail Card Builders
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Builds the Duplicate Groups detail card.
 *
 * For each group, shows:
 *   - Tier emoji + label (Exact Duplicate / Strong Candidate / Possible Candidate)
 *   - File count and combined size (when available)
 *   - Individual file names with MIME label and size
 *   - Groups are capped at MAX_DUP_GROUPS_SHOWN; an overflow notice is shown
 *
 * Tier labels:
 *   EXACT    — binary identical (same checksum)
 *   STRONG   — same name, type, and exact size
 *   POSSIBLE — same name and type, different or unknown sizes
 *
 * @param {Array} dupGroups - DuplicateGroup objects
 * @returns {Card}
 */
function buildDuplicatesCard_(dupGroups) {
  var tierLabels = {
    EXACT:    '🔴 Exact Duplicate',
    STRONG:   '🟠 Strong Candidate',
    POSSIBLE: '🟡 Possible Candidate'
  };
  var tierDescriptions = {
    EXACT:    'Binary identical — same checksum',
    STRONG:   'Same name, file type, and exact size',
    POSSIBLE: 'Same name and file type, different sizes'
  };

  var totalGroups = dupGroups.length;
  var shown       = Math.min(totalGroups, MAX_DUP_GROUPS_SHOWN);

  var header = CardService.newCardHeader()
    .setTitle('Duplicate Groups')
    .setSubtitle(totalGroups + ' group' + (totalGroups === 1 ? '' : 's') + ' found');

  var card = CardService.newCardBuilder().setHeader(header);

  for (var i = 0; i < shown; i++) {
    var group     = dupGroups[i];
    var tierLabel = tierLabels[group.tier]       || group.tier;
    var tierDesc  = tierDescriptions[group.tier] || '';

    var sectionTitle = tierLabel + '  (' + group.files.length + ' files)';
    var section = CardService.newCardSection().setHeader(sectionTitle);

    // Combined size (where known)
    if (group.combinedBytes !== null && group.combinedBytes > 0) {
      section.addWidget(
        CardService.newDecoratedText()
          .setTopLabel('Combined size')
          .setText(formatBytes_(group.combinedBytes))
      );
    }

    // Tier explanation
    section.addWidget(
      CardService.newTextParagraph().setText('<i>' + tierDesc + '</i>')
    );

    // File list — up to 5 per group for compactness
    var maxFilesShown = Math.min(group.files.length, 5);
    for (var j = 0; j < maxFilesShown; j++) {
      var f        = group.files[j];
      var sizeText = f.sizeBytes !== null ? formatBytes_(f.sizeBytes) : 'Size unavailable';
      section.addWidget(
        CardService.newDecoratedText()
          .setText(f.name)
          .setBottomLabel(mimeLabel_(f.mimeType) + '  ·  ' + sizeText)
          .setWrapText(true)
      );
    }

    if (group.files.length > 5) {
      section.addWidget(
        CardService.newTextParagraph()
          .setText('+ ' + (group.files.length - 5) + ' more files in this group')
      );
    }

    card.addSection(section);
  }

  // Overflow notice
  if (totalGroups > MAX_DUP_GROUPS_SHOWN) {
    var overflowSection = CardService.newCardSection();
    overflowSection.addWidget(
      CardService.newTextParagraph().setText(
        'Showing first ' + MAX_DUP_GROUPS_SHOWN + ' of ' + totalGroups + ' duplicate groups.'
      )
    );
    card.addSection(overflowSection);
  }

  // Back button
  var backSection = CardService.newCardSection();
  backSection.addWidget(
    CardService.newTextButton()
      .setText('← Back to Results')
      .setTextButtonStyle(CardService.TextButtonStyle.TEXT)
      .setOnClickAction(CardService.newAction().setFunctionName('goBack_'))
  );
  card.addSection(backSection);

  return card.build();
}

/**
 * Builds the Large Files detail card.
 *
 * Files are sorted by sizeBytes descending (largest first).
 * Files with null sizeBytes are never shown — they are not treated as 0 bytes.
 * A note is shown if some files have unknown sizes.
 *
 * @param {Object} storageResult - { totalKnownBytes, filesWithUnknownSize, topFiles }
 * @returns {Card}
 */
function buildLargeFilesCard_(storageResult) {
  var topFiles = storageResult.topFiles;

  var header = CardService.newCardHeader()
    .setTitle('Largest Files')
    .setSubtitle(
      topFiles.length + ' files  ·  ' +
      formatBytes_(storageResult.totalKnownBytes) + ' total known'
    );

  var card = CardService.newCardBuilder().setHeader(header);

  var listSection = CardService.newCardSection().setHeader('Ranked by Size (Largest First)');

  if (topFiles.length === 0) {
    listSection.addWidget(
      CardService.newTextParagraph().setText(
        'No files with known sizes were found.\n\n' +
        'Native Google Docs, Sheets, and Slides do not expose a file size. ' +
        'Upload binary files to see them ranked here.'
      )
    );
  } else {
    for (var i = 0; i < topFiles.length; i++) {
      var f = topFiles[i];
      listSection.addWidget(
        CardService.newDecoratedText()
          .setTopLabel('#' + (i + 1) + '  —  ' + formatBytes_(f.sizeBytes))
          .setText(f.name)
          .setBottomLabel(mimeLabel_(f.mimeType))
          .setWrapText(true)
      );
    }
  }

  card.addSection(listSection);

  // Unknown size notice
  if (storageResult.filesWithUnknownSize > 0) {
    var noteSection = CardService.newCardSection();
    noteSection.addWidget(
      CardService.newTextParagraph().setText(
        '⚠ ' + storageResult.filesWithUnknownSize + ' file(s) have unknown sizes ' +
        '(native Google Docs, Sheets, or Slides). ' +
        'These are not included in the ranking or the storage total.'
      )
    );
    card.addSection(noteSection);
  }

  // Back button
  var backSection = CardService.newCardSection();
  backSection.addWidget(
    CardService.newTextButton()
      .setText('← Back to Results')
      .setTextButtonStyle(CardService.TextButtonStyle.TEXT)
      .setOnClickAction(CardService.newAction().setFunctionName('goBack_'))
  );
  card.addSection(backSection);

  return card.build();
}

/**
 * Builds the Risky Files detail card.
 *
 * For each HIGH/MEDIUM risk file, shows:
 *   - Risk level emoji (🔴 HIGH / 🟠 MEDIUM)
 *   - File name and MIME type
 *   - Plain-English reason(s) explaining the risk
 *
 * Important: domain sharing is NEVER described as public.
 * Risk reasons are the same sentences produced by scoreRisk_().
 *
 * @param {Array} riskyFiles - { file, risk } objects (HIGH+MEDIUM only)
 * @returns {Card}
 */
function buildRiskyFilesCard_(riskyFiles) {
  var highCount   = riskyFiles.filter(function (r) { return r.risk.level === 'HIGH'; }).length;
  var mediumCount = riskyFiles.filter(function (r) { return r.risk.level === 'MEDIUM'; }).length;

  var header = CardService.newCardHeader()
    .setTitle('Risky Files')
    .setSubtitle(highCount + ' HIGH  ·  ' + mediumCount + ' MEDIUM');

  var card  = CardService.newCardBuilder().setHeader(header);
  var shown = Math.min(riskyFiles.length, MAX_RISKY_FILES_SHOWN);

  if (shown === 0) {
    var emptySection = CardService.newCardSection();
    emptySection.addWidget(
      CardService.newTextParagraph().setText(
        '✓ No risky files found. Your Drive sharing permissions look good!'
      )
    );
    card.addSection(emptySection);
  } else {
    for (var i = 0; i < shown; i++) {
      var item       = riskyFiles[i];
      var f          = item.file;
      var risk       = item.risk;
      var levelEmoji = risk.level === 'HIGH' ? '🔴' : '🟠';

      var sectionTitle = levelEmoji + ' ' + risk.level + '  —  ' + f.name;
      var section = CardService.newCardSection().setHeader(sectionTitle);

      section.addWidget(
        CardService.newDecoratedText()
          .setTopLabel('File type')
          .setText(mimeLabel_(f.mimeType))
      );

      // Render each reason as a separate paragraph for readability
      for (var j = 0; j < risk.reasons.length; j++) {
        section.addWidget(
          CardService.newTextParagraph().setText(risk.reasons[j])
        );
      }

      card.addSection(section);
    }

    // Overflow notice
    if (riskyFiles.length > MAX_RISKY_FILES_SHOWN) {
      var overflowSection = CardService.newCardSection();
      overflowSection.addWidget(
        CardService.newTextParagraph().setText(
          'Showing first ' + MAX_RISKY_FILES_SHOWN + ' of ' + riskyFiles.length + ' risky files.'
        )
      );
      card.addSection(overflowSection);
    }
  }

  // Back button
  var backSection = CardService.newCardSection();
  backSection.addWidget(
    CardService.newTextButton()
      .setText('← Back to Results')
      .setTextButtonStyle(CardService.TextButtonStyle.TEXT)
      .setOnClickAction(CardService.newAction().setFunctionName('goBack_'))
  );
  card.addSection(backSection);

  return card.build();
}

/**
 * Builds a user-friendly error card.
 * Raw API error strings are never passed directly — always use classifyError_().
 *
 * @param {string} message - Human-readable error description
 * @returns {Card}
 */
function buildErrorCard_(message) {
  var header = CardService.newCardHeader()
    .setTitle('Analysis Error')
    .setSubtitle('Something went wrong');

  var section = CardService.newCardSection();
  section.addWidget(CardService.newTextParagraph().setText(message));
  section.addWidget(
    CardService.newTextButton()
      .setText('← Back')
      .setTextButtonStyle(CardService.TextButtonStyle.TEXT)
      .setOnClickAction(CardService.newAction().setFunctionName('showHome'))
  );

  return CardService.newCardBuilder().setHeader(header).addSection(section).build();
}

/**
 * Builds the empty Drive card (no files found after filtering).
 *
 * @returns {Card}
 */
function buildEmptyDriveCard_() {
  var header = CardService.newCardHeader()
    .setTitle('Drive Hygiene Advisor')
    .setSubtitle('Nothing to analyze');

  var section = CardService.newCardSection();
  section.addWidget(
    CardService.newTextParagraph().setText(
      'Your Google Drive appears to be empty, or no files match the ' +
      'scan criteria (non-trashed, non-folder files).\n\n' +
      'Add files to your Drive and run the analysis again.'
    )
  );
  section.addWidget(
    CardService.newTextButton()
      .setText('← Back')
      .setTextButtonStyle(CardService.TextButtonStyle.TEXT)
      .setOnClickAction(CardService.newAction().setFunctionName('showHome'))
  );

  return CardService.newCardBuilder().setHeader(header).addSection(section).build();
}

// ─────────────────────────────────────────────────────────────────────────────
// Demo / Mock Mode
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns true only when DEMO_MODE is explicitly set to 'true' in Script Properties.
 *
 * To enable demo mode:
 *   Apps Script Editor → Project Settings → Script Properties
 *   Key: DEMO_MODE   Value: true
 *
 * To disable demo mode (use real Drive data):
 *   Delete the DEMO_MODE property, or set it to any value other than 'true'.
 *
 * The add-on NEVER silently falls back from real Drive data to mock data.
 * If DEMO_MODE is not explicitly 'true', real Drive data is always used.
 *
 * @returns {boolean}
 */
function isDemoModeEnabled_() {
  try {
    var val = PropertiesService.getScriptProperties().getProperty('DEMO_MODE');
    return val === 'true';
  } catch (e) {
    return false;
  }
}

/**
 * Returns built-in mock Drive data for demo / development purposes.
 *
 * This dataset exercises all analysis paths:
 *   - EXACT duplicate group (same md5Checksum)
 *   - STRONG duplicate group (same name+MIME+size, no checksum)
 *   - POSSIBLE duplicate group (same name+MIME, different sizes)
 *   - HIGH risk files (anyone/reader, anyone/writer)
 *   - MEDIUM risk files (domain sharing)
 *   - Native Google files (sizeBytes=null)
 *   - Large binary files (GB-scale)
 *   - A trashed file (excluded from analysis)
 *   - A folder (excluded from analysis)
 *
 * ONLY used when DEMO_MODE = 'true' in Script Properties.
 *
 * @returns {Array} Normalized DriveFile objects
 */
function getMockFiles_() {
  var owner = [{ type: 'user', role: 'owner', emailAddress: 'user@example.com', domain: null, displayName: null }];

  return [
    // ── EXACT duplicate group (same md5Checksum) ───────────────────────────
    { id: 'm1', name: 'Quarterly Report.pdf', mimeType: 'application/pdf',
      sizeBytes: 1572864, md5Checksum: 'aabbcc1122',
      createdTime: '2026-01-10T09:00:00Z', modifiedTime: '2026-01-10T09:00:00Z',
      webViewLink: null, ownerEmail: 'user@example.com',
      permissions: owner, shared: false, trashed: false, isFolder: false },

    { id: 'm2', name: 'Quarterly Report (1).pdf', mimeType: 'application/pdf',
      sizeBytes: 1572864, md5Checksum: 'aabbcc1122',
      createdTime: '2026-01-11T09:00:00Z', modifiedTime: '2026-01-11T09:00:00Z',
      webViewLink: null, ownerEmail: 'user@example.com',
      permissions: owner, shared: false, trashed: false, isFolder: false },

    // ── STRONG duplicate group (same name+MIME+size, no checksum) ──────────
    { id: 'm3', name: 'Team Budget.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      sizeBytes: 204800, md5Checksum: null,
      createdTime: '2026-02-01T10:00:00Z', modifiedTime: '2026-02-01T10:00:00Z',
      webViewLink: null, ownerEmail: 'user@example.com',
      permissions: [
        { type: 'user',   role: 'owner',  emailAddress: 'user@example.com', domain: null, displayName: null },
        { type: 'domain', role: 'reader', emailAddress: null, domain: 'example.com', displayName: null }
      ], shared: true, trashed: false, isFolder: false },

    { id: 'm4', name: 'Team Budget - Copy.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      sizeBytes: 204800, md5Checksum: null,
      createdTime: '2026-02-05T10:00:00Z', modifiedTime: '2026-02-05T10:00:00Z',
      webViewLink: null, ownerEmail: 'user@example.com',
      permissions: owner, shared: false, trashed: false, isFolder: false },

    // ── POSSIBLE duplicate group (same name+MIME, different sizes) ──────────
    { id: 'm5', name: 'Project Proposal.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      sizeBytes: 512000, md5Checksum: null,
      createdTime: '2026-03-01T08:00:00Z', modifiedTime: '2026-03-01T08:00:00Z',
      webViewLink: null, ownerEmail: 'user@example.com',
      permissions: [
        { type: 'user',   role: 'owner',  emailAddress: 'user@example.com', domain: null, displayName: null },
        { type: 'anyone', role: 'reader', emailAddress: null, domain: null, displayName: null }
      ], shared: true, trashed: false, isFolder: false },

    { id: 'm6', name: 'Project Proposal v2.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      sizeBytes: 634880, md5Checksum: null,
      createdTime: '2026-03-10T08:00:00Z', modifiedTime: '2026-03-10T08:00:00Z',
      webViewLink: null, ownerEmail: 'user@example.com',
      permissions: [
        { type: 'user',   role: 'owner',  emailAddress: 'user@example.com', domain: null, displayName: null },
        { type: 'anyone', role: 'writer', emailAddress: null, domain: null, displayName: null }
      ], shared: true, trashed: false, isFolder: false },

    // ── HIGH risk: anyone/reader ───────────────────────────────────────────
    { id: 'm7', name: 'Customer Export.csv', mimeType: 'text/csv',
      sizeBytes: 2097152, md5Checksum: 'ddee3344',
      createdTime: '2026-04-01T07:00:00Z', modifiedTime: '2026-04-01T07:00:00Z',
      webViewLink: null, ownerEmail: 'user@example.com',
      permissions: [
        { type: 'user',   role: 'owner',  emailAddress: 'user@example.com', domain: null, displayName: null },
        { type: 'anyone', role: 'reader', emailAddress: null, domain: null, displayName: null }
      ], shared: true, trashed: false, isFolder: false },

    // ── MEDIUM risk: domain sharing ────────────────────────────────────────
    { id: 'm8', name: 'Team Roadmap.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      sizeBytes: 307200, md5Checksum: null,
      createdTime: '2026-04-15T09:00:00Z', modifiedTime: '2026-04-15T09:00:00Z',
      webViewLink: null, ownerEmail: 'user@example.com',
      permissions: [
        { type: 'user',   role: 'owner',  emailAddress: 'user@example.com', domain: null, displayName: null },
        { type: 'domain', role: 'reader', emailAddress: null, domain: 'example.com', displayName: null }
      ], shared: true, trashed: false, isFolder: false },

    // ── Large files ────────────────────────────────────────────────────────
    { id: 'm9',  name: 'Project Video.mp4', mimeType: 'video/mp4',
      sizeBytes: 1932735283, md5Checksum: 'ff001122',
      createdTime: '2026-05-01T06:00:00Z', modifiedTime: '2026-05-01T06:00:00Z',
      webViewLink: null, ownerEmail: 'user@example.com',
      permissions: owner, shared: false, trashed: false, isFolder: false },

    { id: 'm10', name: 'Database Backup.zip', mimeType: 'application/zip',
      sizeBytes: 2576980377, md5Checksum: '99aabb33',
      createdTime: '2026-05-10T05:00:00Z', modifiedTime: '2026-05-10T05:00:00Z',
      webViewLink: null, ownerEmail: 'user@example.com',
      permissions: owner, shared: false, trashed: false, isFolder: false },

    { id: 'm11', name: 'Design Assets.zip', mimeType: 'application/zip',
      sizeBytes: 995999744, md5Checksum: '77ccdd55',
      createdTime: '2026-05-15T10:00:00Z', modifiedTime: '2026-05-15T10:00:00Z',
      webViewLink: null, ownerEmail: 'user@example.com',
      permissions: owner, shared: false, trashed: false, isFolder: false },

    // ── Native Google Docs (sizeBytes=null) — POSSIBLE duplicate ──────────
    { id: 'm12', name: 'Meeting Notes', mimeType: 'application/vnd.google-apps.document',
      sizeBytes: null, md5Checksum: null,
      createdTime: '2026-06-01T09:00:00Z', modifiedTime: '2026-06-01T09:00:00Z',
      webViewLink: null, ownerEmail: 'user@example.com',
      permissions: owner, shared: false, trashed: false, isFolder: false },

    { id: 'm13', name: 'Meeting Notes (1)', mimeType: 'application/vnd.google-apps.document',
      sizeBytes: null, md5Checksum: null,
      createdTime: '2026-06-05T09:00:00Z', modifiedTime: '2026-06-05T09:00:00Z',
      webViewLink: null, ownerEmail: 'user@example.com',
      permissions: owner, shared: false, trashed: false, isFolder: false },

    // ── LOW risk, private files ────────────────────────────────────────────
    { id: 'm14', name: 'Personal Notes.txt', mimeType: 'text/plain',
      sizeBytes: 4096, md5Checksum: 'afc0990f',
      createdTime: '2026-07-01T08:00:00Z', modifiedTime: '2026-07-01T08:00:00Z',
      webViewLink: null, ownerEmail: 'user@example.com',
      permissions: owner, shared: false, trashed: false, isFolder: false },

    { id: 'm15', name: 'Logo.png', mimeType: 'image/png',
      sizeBytes: 102400, md5Checksum: '11223344',
      createdTime: '2026-07-05T08:00:00Z', modifiedTime: '2026-07-05T08:00:00Z',
      webViewLink: null, ownerEmail: 'user@example.com',
      permissions: owner, shared: false, trashed: false, isFolder: false },

    // ── Trashed file — excluded from all analysis ──────────────────────────
    { id: 'm16', name: 'Old Draft.pdf', mimeType: 'application/pdf',
      sizeBytes: 51200, md5Checksum: 'deadbeef',
      createdTime: '2026-01-01T00:00:00Z', modifiedTime: '2026-01-01T00:00:00Z',
      webViewLink: null, ownerEmail: 'user@example.com',
      permissions: owner, shared: false, trashed: true, isFolder: false },

    // ── Folder — excluded from all analysis ────────────────────────────────
    { id: 'm17', name: 'Projects', mimeType: 'application/vnd.google-apps.folder',
      sizeBytes: null, md5Checksum: null,
      createdTime: '2025-12-01T00:00:00Z', modifiedTime: '2025-12-01T00:00:00Z',
      webViewLink: null, ownerEmail: 'user@example.com',
      permissions: owner, shared: false, trashed: false, isFolder: true }
  ];
}
