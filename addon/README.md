# Drive Hygiene Advisor — Google Workspace Add-on

This directory contains the **Google Workspace Add-on** that makes Drive Hygiene Advisor
appear as an icon in the **right-side panel of Google Drive**.

---

## How the side panel works

> **Platform constraint:** The Google Drive right-side panel only renders Google's
> proprietary CardService widgets. Arbitrary HTML, React, or iframes cannot be embedded.
>
> The add-on acts as a **launcher** — it shows a mini-summary card and provides a
> button that opens the full Next.js application in a browser tab.

```
Google Drive → Right-side panel → Add-on icon
                                        │
                                   CardService card
                                        │
                          ┌─────────────┴──────────────┐
                          ▼                             ▼
                [Open Full App]                  [Quick Scan]
                 (new browser tab)          (calls /api/drive/analyze
                 → Next.js app              returns mini-summary card)
```

---

## Prerequisites

1. A Google account (personal or Workspace).
2. The Next.js app deployed to a public HTTPS URL (e.g. Vercel).
   - The add-on still works without a public URL, but Quick Scan will be disabled.

---

## Step-by-step: Create the Apps Script project

### 1. Open Apps Script

Go to [script.google.com](https://script.google.com) and click **New project**.

Rename the project to **Drive Hygiene Advisor**.

---

### 2. Show the manifest file

1. Click the **gear icon** (⚙) → **Project Settings**.
2. Check **"Show 'appsscript.json' manifest file in editor"**.
3. Click **Save**.

---

### 3. Paste the manifest

In the left file list, click **appsscript.json**.

Replace the entire content with the contents of [`appsscript.json`](./appsscript.json) from this directory.

**Before saving, update the `logoUrl`:**

Replace:
```
https://raw.githubusercontent.com/YOUR_GITHUB_USERNAME/YOUR_REPO/main/public/icon-96.png
```

With either:
- The raw GitHub URL of your `public/icon-96.png` after pushing to GitHub, e.g.
  `https://raw.githubusercontent.com/janedoe/drive-hygiene-advisor/main/public/icon-96.png`
- Or any other publicly accessible PNG URL (96×96 px recommended).

---

### 4. Paste the script code

In the file list, click **Code.gs** (the default file).

Replace the entire content with the contents of [`Code.gs`](./Code.gs) from this directory.

---

### 5. Configure the App URL (Script Property)

1. Click **⚙ Project Settings**.
2. Scroll to **Script Properties** → click **Add script property**.
3. Set:
   - **Property:** `APP_URL`
   - **Value:** `https://your-app.vercel.app` (your deployed Next.js URL)
4. Click **Save script properties**.

Also update the `logoUrl` in `Code.gs` (the `buildMainCard` function header) to the same URL you used in `appsscript.json`.

---

### 6. Deploy as a test deployment

1. Click **Deploy** → **Test deployments**.
2. Click **Select type** → **Google Workspace Add-on**.
3. Click **Done**.

The test deployment uses your current "head" code — changes are reflected immediately
without creating a new deployment version.

---

### 7. Install the add-on on your Google Drive

1. After creating the test deployment, Apps Script shows you an **Install** button.
2. Click **Install** → follow the authorization prompts.
3. If prompted with "This app isn't verified", click **Advanced** → **Go to Drive Hygiene Advisor (unsafe)**.
   This warning appears because the app hasn't been through Google's verification process,
   which is expected for personal/development use.

---

### 8. Open Google Drive

1. Go to [drive.google.com](https://drive.google.com).
2. Look at the **right-side panel** (narrow icon strip on the far right).
3. You should see the **Drive Hygiene Advisor** icon.
4. Click it — the card will open in the panel.

> **Tip:** If the icon doesn't appear immediately, refresh the page.

---

### 9. Test the add-on

| Action | Expected result |
|---|---|
| Click add-on icon | Card opens in right panel |
| Click "Open Full App" | Next.js app opens in new tab |
| Click "Quick Scan (Demo Mode)" | Mini-summary card appears (uses mock data if not signed in) |
| Sign in via full app, then Quick Scan | Mini-summary shows your real Drive data |

---

## OAuth authorization

The add-on requests these scopes:

| Scope | Purpose |
|---|---|
| `drive.metadata.readonly` | Read file metadata (name, size, permissions) — never file content |
| `script.container.ui` | Required for all Workspace Add-ons to interact with the host UI |

---

## Updating the add-on

Since you're using a **test deployment** (head deployment), any change you make to
`Code.gs` or `appsscript.json` in the Apps Script editor takes effect immediately —
no redeployment step needed.

---

## Publishing to the Workspace Marketplace (optional, future)

If you want other people to install the add-on:

1. Link a Google Cloud project to your Apps Script project:
   **⚙ Project Settings** → **Google Cloud Platform (GCP) project** → enter your project number.
2. Enable the **Google Workspace Marketplace SDK** in your Cloud project.
3. Configure the Marketplace listing (name, description, icon, screenshots).
4. Submit for review (required for public distribution).

For personal use only, the test deployment is sufficient — no Marketplace listing needed.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Icon doesn't appear in Drive | Refresh the page; allow up to 60s for the first install |
| "Quick Scan" fails | Check that `APP_URL` Script Property is set and the app is deployed |
| "This app isn't verified" warning | Expected — click Advanced → Go to app (unsafe) |
| `logoUrl` shows broken image | Ensure the PNG is publicly accessible without authentication |
| Changes to Code.gs not reflected | Hard-refresh the Drive tab (Ctrl+Shift+R) |
