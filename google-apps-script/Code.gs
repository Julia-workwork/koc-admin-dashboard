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
    'Description',
    'Notes',
    'AI Suggestion Status',
  ],
  influencer: [
    'Update Input - Write Here',
    'Level',
    'Channel',
    'ABC Program Potential',
    'Beta Tester Potential',
    'Content Feedback Quality',
    'Cooperation Level',
    'User Type',
    'Status',
    'Product',
    'Self-Owned Product',
    'Exchange Product',
    'Country/Region',
    'Address',
    'Description',
    'Resources',
    'Extra Notes 1',
    'Extended Background',
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
  const params = e && e.parameter ? e.parameter : {};
  try {
    const body = parseBody(e);
    const action = body.action || params.action || legacyAction(params);

    if (action === 'health') return outputResponse({ status: 'ok', app: 'koc-admin-dashboard' }, params);
    if (action === 'login') return handleLogin(readRequestData(body, params), params);

    const requestData = readRequestData(body, params);
    const session = requireSession(requestData.token || params.token);

    if (action === 'users') return outputResponse({ status: 'ok', account: publicAccount(session), data: readDashboardData() }, params);
    if (action === 'sheet') return outputResponse(readSheetValues(params.sheet), params);
    if (action === 'apply') return handleApply(session, requestData, params);

    return outputResponse({ status: 'not_found', message: 'Unknown action.' }, params);
  } catch (error) {
    return outputResponse({
      status: 'error',
      message: String(error && error.message ? error.message : error),
      statusCode: error.statusCode || 500,
    }, params);
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

function readRequestData(body, params) {
  if (params.payload) {
    try {
      return JSON.parse(params.payload);
    } catch (error) {
      throw withStatus(new Error('Invalid JSON payload.'), 400);
    }
  }
  return body;
}

function handleLogin(body, params) {
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

  return outputResponse({ status: 'ok', token, expiresAt, account: publicAccount(account) }, params);
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

function handleApply(session, body, params) {
  if (session.role === ROLES.viewer) {
    throw withStatus(new Error('Viewer accounts cannot edit records.'), 403);
  }

  const recordType = body.recordType === 'influencer' ? 'influencer' : 'koc';
  const sheetName = String(body.sheetName || '');
  const rowNumber = Number(body.rowNumber);
  const updates = filterAllowedFields(recordType, body.fields || {});

  if (!Object.keys(updates).length) throw withStatus(new Error('No approved fields to update.'), 400);
  if (!rowNumber || rowNumber < 1) throw withStatus(new Error('Invalid row number.'), 400);

  const resolvedRowNumber = writeRowFields(sheetName, rowNumber, updates, body.identity || {});
  appendAudit(session, sheetName, resolvedRowNumber, updates);

  return outputResponse({ status: 'ok', sheetName, rowNumber: resolvedRowNumber, fields: updates }, params);
}

function filterAllowedFields(recordType, fields) {
  const allowed = EDITABLE_FIELDS[recordType] || [];
  const output = {};
  Object.keys(fields || {}).forEach((field) => {
    if (allowed.indexOf(field) !== -1) output[field] = fields[field];
  });
  return output;
}

function writeRowFields(sheetName, rowNumber, updates, identity) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) throw withStatus(new Error(`Sheet not found: ${sheetName}`), 404);
  const headerInfo = getHeaderInfo(sheet);
  const headers = headerInfo.headers;
  const resolvedRowNumber = resolveRowNumber(sheet, headerInfo, rowNumber, identity || {});

  Object.keys(updates).forEach((field) => {
    const colIndex = headers.indexOf(field) + 1;
    if (!colIndex) return;
    sheet.getRange(resolvedRowNumber, colIndex).setValue(updates[field]);
  });
  return resolvedRowNumber;
}

function getHeaderInfo(sheet) {
  const lastColumn = sheet.getLastColumn();
  const scanRows = Math.min(10, sheet.getLastRow());
  const values = sheet.getRange(1, 1, scanRows, lastColumn).getDisplayValues();
  const headerIndex = values.findIndex((row) => row.indexOf('Name') !== -1 && (row.indexOf('No.') !== -1 || row.indexOf('Level') !== -1));
  const rowNumber = headerIndex === -1 ? 2 : headerIndex + 1;
  return {
    rowNumber,
    headers: sheet.getRange(rowNumber, 1, 1, lastColumn).getDisplayValues()[0],
  };
}

function resolveRowNumber(sheet, headerInfo, requestedRowNumber, identity) {
  if (!hasIdentity(identity) || rowMatchesIdentity(sheet, headerInfo, requestedRowNumber, identity)) {
    return requestedRowNumber;
  }

  const match = findIdentityRow(sheet, headerInfo, identity);
  if (match) return match;
  throw withStatus(new Error(`Selected row no longer matches ${identity.name || 'this record'}. Please reload the dashboard and try again.`), 409);
}

function hasIdentity(identity) {
  return Boolean(identity && (identity.name || identity.email || identity.no));
}

function rowMatchesIdentity(sheet, headerInfo, rowNumber, identity) {
  if (rowNumber <= headerInfo.rowNumber || rowNumber > sheet.getLastRow()) return false;
  const row = readRowObject(sheet, headerInfo, rowNumber);
  if (identity.name) return cleanText(row.Name) === cleanText(identity.name);
  if (identity.email) return cleanText(row.Email) === cleanText(identity.email);
  if (identity.no) return cleanText(row['No.']) === cleanText(identity.no);
  return true;
}

function findIdentityRow(sheet, headerInfo, identity) {
  const lastRow = sheet.getLastRow();
  let bestRow = 0;
  let bestScore = 0;
  for (let rowNumber = headerInfo.rowNumber + 1; rowNumber <= lastRow; rowNumber += 1) {
    const row = readRowObject(sheet, headerInfo, rowNumber);
    let score = 0;
    if (identity.name && cleanText(row.Name) === cleanText(identity.name)) score += 5;
    if (identity.email && cleanText(row.Email) === cleanText(identity.email)) score += 3;
    if (identity.no && cleanText(row['No.']) === cleanText(identity.no)) score += 3;
    if (identity.date && cleanText(row.Date) === cleanText(identity.date)) score += 1;
    if (identity.profile && cleanText(row.Profile) === cleanText(identity.profile)) score += 1;
    if (score > bestScore) {
      bestScore = score;
      bestRow = rowNumber;
    }
  }
  return bestScore >= 5 ? bestRow : 0;
}

function readRowObject(sheet, headerInfo, rowNumber) {
  const values = sheet.getRange(rowNumber, 1, 1, headerInfo.headers.length).getDisplayValues()[0];
  const row = {};
  headerInfo.headers.forEach((header, index) => {
    row[header] = values[index] || '';
  });
  return row;
}

function cleanText(value) {
  return String(value || '').trim();
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

function outputResponse(payload, params) {
  if (params && params.callback) return jsonpOutput(params.callback, payload);
  return jsonOutput(payload);
}

function jsonpOutput(callback, payload) {
  const safeCallback = String(callback || '').replace(/[^\w.$]/g, '');
  if (!safeCallback) return jsonOutput(payload);
  return ContentService
    .createTextOutput(`${safeCallback}(${JSON.stringify(payload)});`)
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}
