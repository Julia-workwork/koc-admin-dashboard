# 2026 KOC Admin

Lightweight local admin dashboard for the 2026 KOC Google Sheet.

## Run Locally

For daily use, double-click:

```text
start-koc-admin.command
```

Keep the terminal window open while using the dashboard. It will open:

```text
http://127.0.0.1:5174/
```

If macOS blocks the file the first time, right-click it and choose `Open`.

Technical command:

```bash
ADMIN_PASSWORD="your-team-password" /Users/Zhuanz/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node server.mjs
```

Open `http://127.0.0.1:5174/`.

The dashboard requires `ADMIN_PASSWORD`. Without it, the login screen will show that the password is not configured.

## Internal App Access

This app is designed for internal team access, not a fully public data page.

- Static files can load publicly.
- User, KOC, and influencer data APIs require a temporary login token.
- The team password is stored only on the server through `ADMIN_PASSWORD`.
- Browser login state uses `sessionStorage`, so it is limited to the current browser tab/session.
- Closing the tab or opening the app in a new tab requires entering the password again.

Required production environment variable:

```bash
ADMIN_PASSWORD="your-team-password"
```

Recommended production environment variables:

```bash
KOC_APPS_SCRIPT_URL="your-google-apps-script-web-app-url"
KOC_SHEET_CSV_URL="your-published-csv-fallback-url"
```

## GitHub And Deployment

Use a private GitHub repository for this app.

Do not commit local user data or private connection files. They are ignored by `.gitignore`:

- `data/*.json`
- `google-apps-script-url.txt`
- `google-sheet-csv-url.txt`
- `.env`

For deployment, use a platform that can run a Node server and set environment variables, such as Render or Railway. GitHub Pages is not enough because this app needs server routes for password login and protected data APIs.

Production start command:

```bash
node server.mjs
```

Required environment variable:

```bash
ADMIN_PASSWORD="your-team-password"
```

Recommended environment variable:

```bash
KOC_APPS_SCRIPT_URL="your-google-apps-script-web-app-url"
```

## Data Source

The dashboard first tries to read this Google Sheet as CSV:

https://docs.google.com/spreadsheets/d/10fq2tS5iRcywlB9U5oJ5uOEy7tZ2vA8azD7bsCb-HOc/edit

If the sheet is private, Google will block CSV reads. Set sharing to `Anyone with the link can view`, publish the tab as CSV, or start the app with:

```bash
KOC_SHEET_CSV_URL="your-published-csv-url" /Users/Zhuanz/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node server.mjs
```

If Google live loading fails, the dashboard automatically opens with the local snapshot at:

```text
data/2026-koc-snapshot.json
```

That fallback keeps the page usable, but it is not live-synced with later Google Sheet edits.

## Recommended Google Sheet Connection

The most reliable connection is a Google Apps Script Web App attached to the spreadsheet. It reads the live sheet directly instead of relying on published CSV.

1. Open the Google Sheet.
2. Choose `Extensions` -> `Apps Script`.
3. Replace the script content with the code in `google-apps-script/Code.gs`.
4. Click `Deploy` -> `New deployment`.
5. Select type `Web app`.
6. Set `Execute as` to `Me`.
7. Set `Who has access` to `Anyone with the link`.
8. Click `Deploy`, authorize it, and copy the Web App URL.
9. Paste the Web App URL into `google-apps-script-url.txt`.
10. Restart `start-koc-admin.command`.

Published CSV is still supported as a fallback:

1. Open the Google Sheet.
2. Choose `File` -> `Share` -> `Publish to web`.
3. Select the `2026 KOC` tab.
4. Select `Comma-separated values (.csv)`.
5. Click `Publish` and copy the generated CSV link.
6. Paste that link into `google-sheet-csv-url.txt`.
7. Restart `start-koc-admin.command`.

Do not paste the normal `/edit` Google Sheet link into `google-sheet-csv-url.txt`.

## V1 Scope

- Today dashboard for pending updates, follow-ups, high-value quiet users, beta candidates, and watchlist users.
- 2026 user list with search and filters.
- User detail panel with `Update Input - Write Here`.
- Local rule-based analysis that suggests structured field updates.
- Rules page with the KOC color palette.

## Write Back

The local app previews updates first. Direct write-back to Google Sheets needs Google Sheets authorization. In v1, the Apply button clearly reports that authorization is required; selected updates can also be applied through Codex using the connected Google Drive tool.
