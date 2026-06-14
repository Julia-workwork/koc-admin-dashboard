# GitHub Pages Auth Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a GitHub Pages version of KOC Admin with Google Apps Script-backed account login, Admin/Editor/Viewer roles, read access, and controlled Google Sheet write-back.

**Architecture:** GitHub Pages serves the static dashboard. The browser keeps the existing local update-analysis rules. Google Apps Script becomes the backend for login, role validation, reading 2025/2026/Influencers sheets, and writing approved fields back to Google Sheets. The current Render server remains as a fallback while the GitHub Pages version is tested.

**Tech Stack:** Plain HTML/CSS/JavaScript ES modules, Google Apps Script, Google Sheets, Node `node:test` for local domain tests, GitHub Pages.

---

## File Structure

- Modify `google-apps-script/Code.gs`: replace single-sheet read handler with action-based API, auth helpers, role checks, multi-sheet read, and controlled write-back.
- Create `static/config.js`: GitHub Pages runtime config containing the Apps Script URL placeholder and API mode.
- Create `static/api-client.js`: frontend API wrapper that can call either local Render routes or Apps Script routes.
- Modify `static/index.html`: username/password login form, account role display, logout button, static-friendly asset paths.
- Modify `static/app.js`: use `api-client.js`, store account session, apply role-based UI, add write-back payloads.
- Modify `static/styles.css`: style login username field, account pill, logout, disabled/read-only edit states.
- Modify `lib/koc-domain.mjs`: export approved editable field lists and role constants so server/frontend/tests share names where useful.
- Modify `server.mjs`: keep Render fallback aligned with new username/password shape where possible; do not remove current working Render behavior.
- Create `test/permissions.test.mjs`: verify role and editable field rules.
- Modify `README.md`: add GitHub Pages deployment, Apps Script setup, account setup, and rollback notes.

## Constraints

- Do not commit real passwords, Apps Script URLs, account records, or Google Sheet secrets.
- Keep Render working until GitHub Pages is validated.
- Enforce write permissions in Apps Script. Frontend hidden buttons are only usability, not security.
- First version only writes approved fields.

---

### Task 1: Add Shared Permission Constants

**Files:**
- Modify: `lib/koc-domain.mjs`
- Create: `test/permissions.test.mjs`

- [ ] **Step 1: Add failing tests for role and field rules**

Create `test/permissions.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";

import {
  EDITABLE_FIELDS,
  ROLES,
  canRoleEditRecords,
  canRoleManageRules,
  filterAllowedFields,
} from "../lib/koc-domain.mjs";

test("Viewer cannot edit records or rules", () => {
  assert.equal(canRoleEditRecords(ROLES.viewer), false);
  assert.equal(canRoleManageRules(ROLES.viewer), false);
});

test("Editor can edit records but cannot manage rules", () => {
  assert.equal(canRoleEditRecords(ROLES.editor), true);
  assert.equal(canRoleManageRules(ROLES.editor), false);
});

test("Admin can edit records and manage rules", () => {
  assert.equal(canRoleEditRecords(ROLES.admin), true);
  assert.equal(canRoleManageRules(ROLES.admin), true);
});

test("KOC updates keep only approved editable fields", () => {
  const filtered = filterAllowedFields("koc", {
    Name: "Do not change",
    "User Status": "Ready to Follow Up",
    "Next Follow-up Date": "2026/06/20",
    Email: "private@example.com",
  });

  assert.deepEqual(filtered, {
    "User Status": "Ready to Follow Up",
    "Next Follow-up Date": "2026/06/20",
  });
});

test("Influencer updates keep only approved editable fields", () => {
  const filtered = filterAllowedFields("influencer", {
    Name: "Do not change",
    Status: "Active Collab",
    "Next Action": "Send sample follow-up",
    Profile: "Do not change",
  });

  assert.deepEqual(filtered, {
    Status: "Active Collab",
    "Next Action": "Send sample follow-up",
  });
});

test("Editable field lists include the planned operational fields", () => {
  assert.ok(EDITABLE_FIELDS.koc.includes("Update Input - Write Here"));
  assert.ok(EDITABLE_FIELDS.koc.includes("User Type"));
  assert.ok(EDITABLE_FIELDS.influencer.includes("Next Action"));
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
/Users/Zhuanz/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --test test/permissions.test.mjs
```

Expected: FAIL because the exported constants/functions do not exist yet.

- [ ] **Step 3: Add permission constants and helpers**

Append near the existing exported constants in `lib/koc-domain.mjs`:

```js
export const ROLES = {
  admin: "Admin",
  editor: "Editor",
  viewer: "Viewer",
};

export const EDITABLE_FIELDS = {
  koc: [
    "Update Input - Write Here",
    "Raw Update Notes",
    "User Level (S/A/B/C/TBD)",
    "ABC Program Potential",
    "Beta Tester Potential",
    "Content Feedback Quality",
    "Cooperation Level",
    "User Status",
    "User Type",
    "Last Contact Date",
    "Next Follow-up Date",
    "Follow-up Reason",
    "Notes",
    "AI Suggestion Status",
  ],
  influencer: [
    "Update Input - Write Here",
    "Raw Update Notes",
    "Level",
    "Status",
    "Product",
    "Next Action",
    "Latest Note",
    "Notes",
    "Last Contact Date",
    "Next Follow-up Date",
  ],
};

export function canRoleEditRecords(role) {
  return role === ROLES.admin || role === ROLES.editor;
}

export function canRoleManageRules(role) {
  return role === ROLES.admin;
}

export function filterAllowedFields(recordType, fields) {
  const allowed = new Set(EDITABLE_FIELDS[recordType] || []);
  return Object.fromEntries(Object.entries(fields || {}).filter(([field]) => allowed.has(field)));
}
```

- [ ] **Step 4: Run all tests**

Run:

```bash
/Users/Zhuanz/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --test test/*.mjs
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/koc-domain.mjs test/permissions.test.mjs
git commit -m "Add shared dashboard permission rules"
```

---

### Task 2: Upgrade Google Apps Script API Contract

**Files:**
- Modify: `google-apps-script/Code.gs`

- [ ] **Step 1: Replace the Apps Script with an action-based API**

Replace `google-apps-script/Code.gs` with this structure:

```js
const SHEET_NAMES = {
  koc2025: '2025 KOC',
  koc2026: '2026 KOC',
  influencers: 'Influencers',
  audit: 'Audit Log',
};

const ROLES = {
  admin: 'Admin',
  editor: 'Editor',
  viewer: 'Viewer',
};

const EDITABLE_FIELDS = {
  koc: [
    'Update Input - Write Here',
    'Raw Update Notes',
    'User Level (S/A/B/C/TBD)',
    'ABC Program Potential',
    'Beta Tester Potential',
    'Content Feedback Quality',
    'Cooperation Level',
    'User Status',
    'User Type',
    'Last Contact Date',
    'Next Follow-up Date',
    'Follow-up Reason',
    'Notes',
    'AI Suggestion Status',
  ],
  influencer: [
    'Update Input - Write Here',
    'Raw Update Notes',
    'Level',
    'Status',
    'Product',
    'Next Action',
    'Latest Note',
    'Notes',
    'Last Contact Date',
    'Next Follow-up Date',
  ],
};

function doGet(e) {
  return routeRequest(e, 'GET');
}

function doPost(e) {
  return routeRequest(e, 'POST');
}

function routeRequest(e, method) {
  try {
    const params = e && e.parameter ? e.parameter : {};
    const body = parseBody(e);
    const action = body.action || params.action || 'users';

    if (action === 'health') return jsonOutput({ status: 'ok', app: 'koc-admin-dashboard' });
    if (action === 'login') return handleLogin(body);

    const session = requireSession(body.token || params.token);

  if (action === 'users') return jsonOutput({ status: 'ok', account: publicAccount(session), data: readDashboardData() });
  if (action === 'apply') return handleApply(session, body);

    return jsonOutput({ status: 'not_found', message: 'Unknown action.' }, 404);
  } catch (error) {
    return jsonOutput({ status: 'error', message: String(error && error.message ? error.message : error) }, error.statusCode || 500);
  }
}

function parseBody(e) {
  if (!e || !e.postData || !e.postData.contents) return {};
  try {
    return JSON.parse(e.postData.contents);
  } catch (error) {
    throw withStatus(new Error('Invalid JSON body.'), 400);
  }
}

function handleLogin(body) {
  const username = String(body.username || '').trim();
  const password = String(body.password || '');
  const account = getAccounts().find((item) => item.username === username && item.active !== false);

  if (!account || account.password !== password) {
    throw withStatus(new Error('Invalid username or password.'), 401);
  }

  const token = Utilities.getUuid();
  const expiresAt = endOfTodayIso();
  CacheService.getScriptCache().put(`session:${token}`, JSON.stringify({
    username: account.username,
    displayName: account.displayName || account.username,
    role: account.role || ROLES.viewer,
    expiresAt,
  }), secondsUntilEndOfToday());

  return jsonOutput({ status: 'ok', token, expiresAt, account: publicAccount(account) });
}

function requireSession(token) {
  if (!token) throw withStatus(new Error('Please sign in again.'), 401);
  const raw = CacheService.getScriptCache().get(`session:${token}`);
  if (!raw) throw withStatus(new Error('Session expired. Please sign in again.'), 401);
  return JSON.parse(raw);
}

function getAccounts() {
  const raw = PropertiesService.getScriptProperties().getProperty('KOC_ACCOUNTS_JSON');
  if (!raw) throw withStatus(new Error('Accounts are not configured.'), 503);
  return JSON.parse(raw);
}

function publicAccount(account) {
  return {
    username: account.username,
    displayName: account.displayName || account.username,
    role: account.role || ROLES.viewer,
  };
}

function readDashboardData() {
  return {
    usersByYear: {
      2025: readSheetValues(SHEET_NAMES.koc2025),
      2026: readSheetValues(SHEET_NAMES.koc2026),
    },
    influencers: readSheetValues(SHEET_NAMES.influencers),
    updatedAt: new Date().toISOString(),
  };
}

function readSheetValues(sheetName) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) throw withStatus(new Error(`Sheet not found: ${sheetName}`), 404);
  return {
    sheetName,
    values: sheet.getDataRange().getDisplayValues(),
  };
}

function handleApply(session, body) {
  if (session.role === ROLES.viewer) {
    throw withStatus(new Error('Viewer accounts cannot edit records.'), 403);
  }

  const recordType = body.recordType === 'influencer' ? 'influencer' : 'koc';
  const sheetName = String(body.sheetName || '');
  const rowNumber = Number(body.rowNumber);
  const updates = filterAllowedFields(recordType, body.fields || {});

  if (!Object.keys(updates).length) throw withStatus(new Error('No approved fields to update.'), 400);
  if (!rowNumber || rowNumber < 1) throw withStatus(new Error('Invalid row number.'), 400);

  writeRowFields(sheetName, rowNumber, updates);
  appendAudit(session, sheetName, rowNumber, updates);

  return jsonOutput({ status: 'ok', sheetName, rowNumber, fields: updates });
}

function filterAllowedFields(recordType, fields) {
  const allowed = EDITABLE_FIELDS[recordType] || [];
  const output = {};
  Object.keys(fields || {}).forEach((field) => {
    if (allowed.indexOf(field) !== -1) output[field] = fields[field];
  });
  return output;
}

function writeRowFields(sheetName, rowNumber, updates) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) throw withStatus(new Error(`Sheet not found: ${sheetName}`), 404);
  const headers = sheet.getRange(2, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];

  Object.keys(updates).forEach((field) => {
    const colIndex = headers.indexOf(field) + 1;
    if (!colIndex) throw withStatus(new Error(`Field not found: ${field}`), 400);
    sheet.getRange(rowNumber, colIndex).setValue(updates[field]);
  });
}

function appendAudit(session, sheetName, rowNumber, updates) {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = spreadsheet.getSheetByName(SHEET_NAMES.audit) || spreadsheet.insertSheet(SHEET_NAMES.audit);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['Timestamp', 'Username', 'Role', 'Sheet', 'Row', 'Fields']);
  }
  sheet.appendRow([
    new Date().toISOString(),
    session.username,
    session.role,
    sheetName,
    rowNumber,
    JSON.stringify(updates),
  ]);
}

function endOfTodayIso() {
  const now = new Date();
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  return end.toISOString();
}

function secondsUntilEndOfToday() {
  const now = new Date();
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  return Math.max(60, Math.floor((end.getTime() - now.getTime()) / 1000));
}

function withStatus(error, statusCode) {
  error.statusCode = statusCode;
  return error;
}

function jsonOutput(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
```

- [ ] **Step 2: Document required Script Properties in comments**

Add this comment near the top of `Code.gs`:

```js
// Required Script Property:
// KOC_ACCOUNTS_JSON=[
//   {"username":"julia","displayName":"Julia","role":"Admin","password":"change-me","active":true},
//   {"username":"editor01","displayName":"Editor 01","role":"Editor","password":"change-me","active":true},
//   {"username":"viewer01","displayName":"Viewer 01","role":"Viewer","password":"change-me","active":true}
// ]
```

- [ ] **Step 3: Manual Apps Script verification**

In Google Apps Script editor:

1. Paste updated `Code.gs`.
2. Set `KOC_ACCOUNTS_JSON` in Script Properties.
3. Deploy a new Web App version.
4. Open:

```text
<apps-script-url>?action=health
```

Expected JSON:

```json
{"status":"ok","app":"koc-admin-dashboard"}
```

- [ ] **Step 4: Commit**

```bash
git add google-apps-script/Code.gs
git commit -m "Add Apps Script auth and write API"
```

---

### Task 3: Add Static API Client For GitHub Pages

**Files:**
- Create: `static/config.js`
- Create: `static/api-client.js`
- Modify: `static/index.html`
- Modify: `static/app.js`

- [ ] **Step 1: Create static config**

Create `static/config.js`:

```js
export const KOC_CONFIG = {
  apiMode: "apps-script",
  appsScriptUrl: "PASTE_APPS_SCRIPT_WEB_APP_URL_HERE",
};
```

- [ ] **Step 2: Create API client**

Create `static/api-client.js`:

```js
import { KOC_CONFIG } from "./config.js";

async function postAppsScript(action, payload = {}) {
  const response = await fetch(KOC_CONFIG.appsScriptUrl, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action, ...payload }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.status === "error") {
    const error = new Error(data.message || "Request failed.");
    error.status = response.status;
    throw error;
  }
  if (["not_found", "invalid_password", "authorization_required"].includes(data.status)) {
    const error = new Error(data.message || "Request failed.");
    error.status = data.status;
    throw error;
  }
  return data;
}

async function postLocal(path, payload = {}, token = "") {
  const response = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message || "Request failed.");
    error.status = response.status;
    throw error;
  }
  return data;
}

async function getLocal(path, token = "") {
  const response = await fetch(path, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message || "Request failed.");
    error.status = response.status;
    throw error;
  }
  return data;
}

export async function login(username, password) {
  if (KOC_CONFIG.apiMode === "local") {
    return postLocal("/api/login", { username, password });
  }
  return postAppsScript("login", { username, password });
}

export async function loadDashboard(token) {
  if (KOC_CONFIG.apiMode === "local") {
    return getLocal("/api/users", token);
  }
  return postAppsScript("users", { token });
}

export async function applyFields(payload, token) {
  if (KOC_CONFIG.apiMode === "local") {
    return postLocal("/api/apply", payload, token);
  }
  return postAppsScript("apply", { token, ...payload });
}
```

- [ ] **Step 3: Update imports**

Change the top of `static/app.js` from:

```js
import { OPTIONS, PALETTES } from "/lib/koc-domain.mjs";
```

to:

```js
import {
  OPTIONS,
  PALETTES,
  analyzeUpdateNote,
  canRoleEditRecords,
  canRoleManageRules,
} from "../lib/koc-domain.mjs";
import { applyFields, loadDashboard, login } from "./api-client.js";
```

For GitHub Pages, avoid root-relative `/lib/...` paths because the project is published under `/koc-admin-dashboard/`.

- [ ] **Step 4: Update `static/index.html` module paths**

Ensure the app script uses a relative path:

```html
<script type="module" src="./app.js"></script>
```

Ensure stylesheet uses:

```html
<link rel="stylesheet" href="./styles.css" />
```

- [ ] **Step 5: Run syntax checks**

Run:

```bash
/Users/Zhuanz/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --check static/api-client.js
/Users/Zhuanz/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --check static/app.js
```

Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add static/config.js static/api-client.js static/index.html static/app.js
git commit -m "Add static dashboard API client"
```

---

### Task 4: Convert Login UI To Account Login

**Files:**
- Modify: `static/index.html`
- Modify: `static/app.js`
- Modify: `static/styles.css`

- [ ] **Step 1: Update login form HTML**

Replace the login note and password-only field in `static/index.html` with:

```html
<p class="login-note">Sign in with your team account to view user operations data.</p>
<label>
  <span>Username</span>
  <input id="username-input" type="text" autocomplete="username" placeholder="julia" />
</label>
<label>
  <span>Password</span>
  <input id="password-input" type="password" autocomplete="current-password" placeholder="Password" />
</label>
```

Add inside the header near navigation:

```html
<div class="account-bar">
  <span id="account-pill" class="account-pill"></span>
  <button id="logout-button" class="button ghost" type="button">Log out</button>
</div>
```

- [ ] **Step 2: Update session storage in `static/app.js`**

Add:

```js
const SESSION_ACCOUNT_KEY = "koc_admin_account";
const usernameInput = document.querySelector("#username-input");
const accountPill = document.querySelector("#account-pill");
const logoutButton = document.querySelector("#logout-button");
```

Add helpers:

```js
function currentAccount() {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_ACCOUNT_KEY) || "null");
  } catch {
    return null;
  }
}

function setSession(token, account) {
  sessionStorage.setItem(SESSION_TOKEN_KEY, token);
  sessionStorage.setItem(SESSION_ACCOUNT_KEY, JSON.stringify(account));
}

function clearSession() {
  sessionStorage.removeItem(SESSION_TOKEN_KEY);
  sessionStorage.removeItem(SESSION_ACCOUNT_KEY);
}
```

- [ ] **Step 3: Update `setupLogin()`**

Replace password-only login logic with:

```js
const result = await login(usernameInput.value, passwordInput.value);
setSession(result.token, result.account);
usernameInput.value = "";
passwordInput.value = "";
showApp();
await loadUsers();
```

On login failure:

```js
loginMessage.textContent = error.message || "Unable to sign in.";
```

- [ ] **Step 4: Update `showApp()`**

Add:

```js
const account = currentAccount();
accountPill.textContent = account ? `${account.displayName} · ${account.role}` : "";
```

- [ ] **Step 5: Add logout handler**

Add:

```js
logoutButton.addEventListener("click", () => {
  clearSession();
  showLogin("Signed out.");
});
```

- [ ] **Step 6: Style account controls**

Add to `static/styles.css`:

```css
.account-bar {
  display: flex;
  align-items: center;
  gap: 12px;
}

.account-pill {
  display: inline-flex;
  align-items: center;
  min-height: 36px;
  border: 1px solid rgba(255, 255, 255, 0.28);
  border-radius: 999px;
  padding: 0 14px;
  color: #fff;
  font-weight: 800;
}

.button.ghost {
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
  border-color: rgba(255, 255, 255, 0.28);
}
```

- [ ] **Step 7: Verify syntax**

Run:

```bash
/Users/Zhuanz/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --check static/app.js
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add static/index.html static/app.js static/styles.css
git commit -m "Add account login UI"
```

---

### Task 5: Normalize Apps Script Data In The Frontend

**Files:**
- Modify: `static/app.js`
- Modify: `lib/koc-domain.mjs` if a reusable parser is needed

- [ ] **Step 1: Add Apps Script response normalization**

In `static/app.js`, update `loadUsers()` to accept both the current Render shape and new Apps Script shape:

```js
const raw = await loadDashboard(sessionToken());
const data = raw.data ? normalizeAppsScriptDashboard(raw.data) : raw;
```

Add:

```js
function normalizeAppsScriptDashboard(data) {
  if (!data || !data.usersByYear) return data;
  const users2025 = normalizeSheetPayload(data.usersByYear["2025"], 2025);
  const users2026 = normalizeSheetPayload(data.usersByYear["2026"], 2026);
  const influencers = normalizeSheetPayload(data.influencers, "Influencer");
  return {
    usersByYear: { 2025: users2025, 2026: users2026 },
    users: [...users2025, ...users2026],
    influencers,
    today: buildTodayBuckets([...users2025, ...users2026]),
    source: { mode: "google_apps_script_static", updatedAt: data.updatedAt },
  };
}
```

Use the existing row normalization behavior in `lib/koc-domain.mjs` where possible. If direct browser import already exposes `normalizeKocRow`, use it. If not, export a small browser-safe helper.

- [ ] **Step 2: Preserve row numbers**

Ensure normalized records keep:

```js
rowNumber
sheetName
raw
```

These are required for write-back.

- [ ] **Step 3: Verify existing Render shape still loads**

Run syntax:

```bash
/Users/Zhuanz/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --check static/app.js
```

Run tests:

```bash
/Users/Zhuanz/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --test test/*.mjs
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add static/app.js lib/koc-domain.mjs test/*.mjs
git commit -m "Normalize Apps Script dashboard data"
```

---

### Task 6: Add Role-Based Read-Only And Edit UI

**Files:**
- Modify: `static/app.js`
- Modify: `static/styles.css`

- [ ] **Step 1: Add role helpers in `static/app.js`**

Add:

```js
function currentRole() {
  return currentAccount()?.role || "Viewer";
}

function canEditRecords() {
  return canRoleEditRecords(currentRole());
}

function canManageRulesUi() {
  return canRoleManageRules(currentRole());
}
```

- [ ] **Step 2: Hide editing area for Viewer**

In `renderDetail(user)`, wrap the update input section:

```js
const editSection = canEditRecords()
  ? `<section class="detail-section">
      <h3>Update Input - Write Here</h3>
      <textarea id="update-input" class="update-input">${escapeHtml(user.updateInput)}</textarea>
      <div class="actions">
        <button class="button primary" id="analyze-button">Analyze Update</button>
        <button class="button" id="apply-button" disabled>Apply Preview</button>
      </div>
      <div id="suggestion-output"></div>
    </section>`
  : `<section class="detail-section readonly-note">
      <h3>Read-only access</h3>
      <p>Your account can view this record, but cannot edit or write updates.</p>
    </section>`;
```

Only attach analyze/apply event listeners if `canEditRecords()` is true.

- [ ] **Step 3: Disable Rules management for non-Admin**

In `renderRules()`, append:

```js
if (!canManageRulesUi()) {
  document.querySelector("#rules-grid").insertAdjacentHTML(
    "beforeend",
    `<section class="rules-card readonly-note">
      <h3>Rule management</h3>
      <p>Your account can view rules, but only Admin can change dropdowns, colors, and account settings.</p>
    </section>`,
  );
}
```

- [ ] **Step 4: Add read-only styling**

Add to `static/styles.css`:

```css
.readonly-note {
  border-style: dashed;
  background: #f8fbff;
  color: #5f6c7d;
}
```

- [ ] **Step 5: Run syntax check**

```bash
/Users/Zhuanz/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --check static/app.js
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add static/app.js static/styles.css
git commit -m "Apply role-based dashboard controls"
```

---

### Task 7: Implement KOC Field Write-Back Payloads

**Files:**
- Modify: `static/app.js`
- Modify: `static/styles.css`

- [ ] **Step 1: Add editable form controls for KOC detail**

For Editor/Admin users, add a compact form in `renderDetail(user)` with controls for:

```text
User Level
User Status
User Type
Content Feedback Quality
Cooperation Level
Next Follow-up Date
Follow-up Reason
Notes
```

Use existing `OPTIONS` arrays for dropdowns. Multi-value `User Type` can start as a comma-separated input in v1:

```html
<input id="edit-user-type" value="${escapeHtml(user.types.join(", "))}" />
```

- [ ] **Step 2: Build update payload**

Add:

```js
function buildKocUpdatePayload(user) {
  return {
    recordType: "koc",
    sheetName: user.sheetName || (user.year === "2025" ? "2025 KOC" : "2026 KOC"),
    rowNumber: user.rowNumber,
    fields: {
      "Update Input - Write Here": document.querySelector("#update-input")?.value || "",
      "User Level (S/A/B/C/TBD)": document.querySelector("#edit-user-level")?.value || user.level || "TBD",
      "User Status": document.querySelector("#edit-user-status")?.value || user.status || "",
      "User Type": document.querySelector("#edit-user-type")?.value || "",
      "Content Feedback Quality": document.querySelector("#edit-content-quality")?.value || user.contentQuality || "",
      "Cooperation Level": document.querySelector("#edit-cooperation")?.value || user.cooperation || "",
      "Next Follow-up Date": document.querySelector("#edit-next-follow-up")?.value || user.nextFollowUpDate || "",
      "Follow-up Reason": document.querySelector("#edit-follow-up-reason")?.value || user.followUpReason || "",
      Notes: document.querySelector("#edit-notes")?.value || user.notes || "",
    },
  };
}
```

- [ ] **Step 3: Use local update analysis**

Update `analyzeSelected()` in `static/app.js` so GitHub Pages does not need an Apps Script analyze endpoint:

```js
async function analyzeSelected() {
  const updateInput = document.querySelector("#update-input").value;
  const suggestion = analyzeUpdateNote({
    ...state.selected,
    updateInput,
    raw: {
      ...state.selected.raw,
      "Raw Update Notes": updateInput,
      "Update Input - Write Here": updateInput,
    },
  });
  state.currentSuggestion = suggestion;
  const rows = Object.entries(suggestion.fields)
    .map(([key, value]) => `<tr><td>${escapeHtml(key)}</td><td>${escapeHtml(value)}</td></tr>`)
    .join("");
  document.querySelector("#suggestion-output").innerHTML = `
    <table class="suggestion-table">
      <thead><tr><th>Field</th><th>Suggested Value</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p class="meta">${escapeHtml(suggestion.summary)}</p>
  `;
  document.querySelector("#apply-button").disabled = false;
}
```

- [ ] **Step 4: Connect Save button**

Add button:

```html
<button class="button primary" id="save-record-button">Save Record</button>
```

Add handler:

```js
document.querySelector("#save-record-button")?.addEventListener("click", async () => {
  const result = await applyFields(buildKocUpdatePayload(state.selected), sessionToken());
  document.querySelector("#suggestion-output").insertAdjacentHTML(
    "beforeend",
    `<p class="state-message">Saved ${Object.keys(result.fields || {}).length} fields.</p>`,
  );
  await loadUsers();
});
```

- [ ] **Step 5: Connect Apply Preview to approved field write-back**

Update `applySelected()` to send the preview fields through the same controlled write-back route:

```js
async function applySelected() {
  const payload = {
    recordType: "koc",
    sheetName: state.selected.sheetName || (state.selected.year === "2025" ? "2025 KOC" : "2026 KOC"),
    rowNumber: state.selected.rowNumber,
    fields: state.currentSuggestion?.fields || {},
  };
  const result = await applyFields(payload, sessionToken());
  document.querySelector("#suggestion-output").insertAdjacentHTML(
    "beforeend",
    `<p class="state-message">Applied ${Object.keys(result.fields || {}).length} approved fields.</p>`,
  );
  await loadUsers();
}
```

- [ ] **Step 6: Verify no Viewer save button**

Open the app with a Viewer account after deployment. Expected: no Save Record, Analyze Update, or Apply Preview buttons.

- [ ] **Step 7: Commit**

```bash
git add static/app.js static/styles.css
git commit -m "Add KOC record write-back UI"
```

---

### Task 8: Add Influencer Write-Back UI

**Files:**
- Modify: `static/app.js`
- Modify: `static/styles.css`

- [ ] **Step 1: Add edit controls to influencer detail**

In `renderInfluencerInlineDetail(user)`, show edit controls only for Editor/Admin:

```text
Level
Status
Product
Next Action
Latest Note / Notes
Next Follow-up Date
Update Input - Write Here
```

- [ ] **Step 2: Build influencer payload**

Add:

```js
function buildInfluencerUpdatePayload(user) {
  return {
    recordType: "influencer",
    sheetName: user.sheetName || "Influencers",
    rowNumber: user.rowNumber,
    fields: {
      Level: document.querySelector("#edit-influencer-level")?.value || user.level || "",
      Status: document.querySelector("#edit-influencer-status")?.value || user.status || "",
      Product: document.querySelector("#edit-influencer-product")?.value || user.product || "",
      "Next Action": document.querySelector("#edit-influencer-next-action")?.value || user.nextAction || "",
      Notes: document.querySelector("#edit-influencer-notes")?.value || user.notes || "",
      "Next Follow-up Date": document.querySelector("#edit-influencer-next-follow-up")?.value || user.nextFollowUpDate || "",
      "Update Input - Write Here": document.querySelector("#edit-influencer-update-input")?.value || user.updateInput || "",
    },
  };
}
```

- [ ] **Step 3: Add save handler**

Add:

```js
document.querySelector("#save-influencer-button")?.addEventListener("click", async () => {
  const result = await applyFields(buildInfluencerUpdatePayload(user), sessionToken());
  influencerInlineDetail.insertAdjacentHTML(
    "beforeend",
    `<p class="state-message">Saved ${Object.keys(result.fields || {}).length} fields.</p>`,
  );
  await loadUsers();
});
```

- [ ] **Step 4: Run syntax check**

```bash
/Users/Zhuanz/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --check static/app.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add static/app.js static/styles.css
git commit -m "Add influencer record write-back UI"
```

---

### Task 9: Keep Render Fallback Compatible

**Files:**
- Modify: `server.mjs`
- Modify: `static/config.js`
- Modify: `README.md`

- [ ] **Step 1: Allow local mode config**

Document that `static/config.js` can be changed temporarily for Render/local testing:

```js
export const KOC_CONFIG = {
  apiMode: "local",
  appsScriptUrl: "",
};
```

- [ ] **Step 2: Update local login handler to accept username**

In `server.mjs`, keep password behavior but accept a username field:

```js
const body = await readRequestJson(req);
if (!safeCompare(body.password || "", adminPassword)) {
  sendJson(res, 401, {
    status: "invalid_password",
    message: "Incorrect password.",
  });
  return;
}

const token = randomUUID();
activeSessions.add(token);
sendJson(res, 200, {
  status: "ok",
  token,
  account: {
    username: body.username || "local",
    displayName: body.username || "Local",
    role: "Admin",
  },
});
```

- [ ] **Step 3: Run server syntax**

```bash
/Users/Zhuanz/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --check server.mjs
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add server.mjs static/config.js README.md
git commit -m "Keep local dashboard mode compatible"
```

---

### Task 10: Add GitHub Pages Deployment Docs

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add GitHub Pages section**

Add:

```md
## GitHub Pages Deployment

The GitHub Pages version serves the static dashboard from `static/`.

1. Deploy the updated Google Apps Script Web App.
2. Copy the Web App URL.
3. Put that URL in `static/config.js` as `appsScriptUrl`.
4. Commit and push changes.
5. In GitHub, open Settings -> Pages.
6. Set the source to the `main` branch and the `/static` folder if available. If GitHub only offers root/docs, use a GitHub Actions Pages workflow in a later step.

The expected public URL is:

```text
https://julia-workwork.github.io/koc-admin-dashboard/
```
```

- [ ] **Step 2: Add Apps Script account setup**

Add:

```md
## Apps Script Accounts

Set Script Property `KOC_ACCOUNTS_JSON`:

```json
[
  {"username":"julia","displayName":"Julia","role":"Admin","password":"change-this","active":true},
  {"username":"editor01","displayName":"Editor 01","role":"Editor","password":"change-this","active":true},
  {"username":"viewer01","displayName":"Viewer 01","role":"Viewer","password":"change-this","active":true}
]
```

Do not commit real passwords to GitHub.
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "Document GitHub Pages deployment"
```

---

### Task 11: Optional GitHub Pages Workflow If `/static` Is Not Selectable

**Files:**
- Create: `.github/workflows/pages.yml`

- [ ] **Step 1: Create workflow**

Create `.github/workflows/pages.yml`:

```yaml
name: Deploy GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
      - name: Prepare site
        run: |
          mkdir -p dist
          cp -R static/* dist/
          cp -R lib dist/lib
      - name: Setup Pages
        uses: actions/configure-pages@v5
      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: dist
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/pages.yml
git commit -m "Add GitHub Pages workflow"
```

---

### Task 12: Final Verification And Rollout

**Files:**
- Modify only if verification finds a bug.

- [ ] **Step 1: Run local checks**

```bash
/Users/Zhuanz/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --check server.mjs
/Users/Zhuanz/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --check static/app.js
/Users/Zhuanz/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --check static/api-client.js
/Users/Zhuanz/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --test test/*.mjs
```

Expected: all commands pass.

- [ ] **Step 2: Manual role test on GitHub Pages beta**

Test these accounts after Apps Script is configured:

```text
Admin: can read, edit KOC, edit Influencer.
Editor: can read, edit KOC, edit Influencer, cannot manage rules/accounts.
Viewer: can read, cannot see edit buttons, write requests are rejected.
```

- [ ] **Step 3: Manual write-back test**

Use one low-risk test row. Update:

```text
Update Input - Write Here
User Status
Next Follow-up Date
Follow-up Reason
```

Expected:

- Google Sheet row changes.
- Audit Log row is appended.
- Dashboard reload shows the new values.

- [ ] **Step 4: Push to GitHub**

```bash
git status --short --branch
git push origin main
```

Expected: GitHub contains the new commits and Pages deploy starts.

- [ ] **Step 5: Keep Render as backup**

Do not delete Render until the GitHub Pages URL has been used successfully for daily work.

---

## Self-Review Notes

- Spec coverage: architecture, account login, Admin/Editor/Viewer, editable fields, local update analysis, read-only Viewer, write-back, audit trail, rollout, and Render fallback are covered.
- Scope: this remains one migration project because the frontend and Apps Script API must change together for a working beta.
- Placeholders: the only placeholder is the Apps Script URL in `static/config.js`, which is intentionally user-specific and must not be committed with a secret URL unless the user chooses to make that Web App URL public.
