// Required Script Property:
// KOC_ACCOUNTS_JSON=[
//   {"username":"julia","displayName":"Julia","role":"Admin","password":"change-me","active":true},
//   {"username":"editor01","displayName":"Editor 01","role":"Editor","password":"change-me","active":true},
//   {"username":"viewer01","displayName":"Viewer 01","role":"Viewer","password":"change-me","active":true}
// ]

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
    const action = body.action || params.action || legacyAction(params);

    if (action === 'health') return jsonOutput({ status: 'ok', app: 'koc-admin-dashboard' });
    if (action === 'login') return handleLogin(body);

    const session = requireSession(body.token || params.token);

    if (action === 'users') return jsonOutput({ status: 'ok', account: publicAccount(session), data: readDashboardData() });
    if (action === 'sheet') return jsonOutput(readSheetValues(params.sheet));
    if (action === 'apply') return handleApply(session, body);

    return jsonOutput({ status: 'not_found', message: 'Unknown action.' });
  } catch (error) {
    return jsonOutput({
      status: 'error',
      message: String(error && error.message ? error.message : error),
      statusCode: error.statusCode || 500,
    });
  }
}

function legacyAction(params) {
  return params.sheet ? 'sheet' : 'users';
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
  PropertiesService.getScriptProperties().setProperty(`KOC_SESSION_${token}`, JSON.stringify({
    username: account.username,
    displayName: account.displayName || account.username,
    role: account.role || ROLES.viewer,
    expiresAt,
  }));

  return jsonOutput({ status: 'ok', token, expiresAt, account: publicAccount(account) });
}

function requireSession(token) {
  if (!token) throw withStatus(new Error('Please sign in again.'), 401);
  const sessionKey = `KOC_SESSION_${token}`;
  const raw = PropertiesService.getScriptProperties().getProperty(sessionKey);
  if (!raw) throw withStatus(new Error('Session expired. Please sign in again.'), 401);
  const session = JSON.parse(raw);
  if (session.expiresAt && new Date(session.expiresAt).getTime() < Date.now()) {
    PropertiesService.getScriptProperties().deleteProperty(sessionKey);
    throw withStatus(new Error('Session expired. Please sign in again.'), 401);
  }
  return session;
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
  const allowedSheets = Object.keys(SHEET_NAMES).map((key) => SHEET_NAMES[key]);
  if (allowedSheets.indexOf(sheetName) === -1 || sheetName === SHEET_NAMES.audit) {
    throw withStatus(new Error(`Sheet not allowed: ${sheetName}`), 403);
  }

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) throw withStatus(new Error(`Sheet not found: ${sheetName}`), 404);
  return {
    sheetName,
    updatedAt: new Date().toISOString(),
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

function withStatus(error, statusCode) {
  error.statusCode = statusCode;
  return error;
}

function jsonOutput(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
