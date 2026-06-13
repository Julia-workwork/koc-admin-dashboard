import { createServer } from "node:http";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCsvRows } from "./lib/csv.mjs";
import {
  analyzeUpdateNote,
  buildTodayBuckets,
  DEFAULT_SHEET_CSV_URL,
  normalizeKocRow,
  REQUIRED_COLUMNS,
  validateColumns,
} from "./lib/koc-domain.mjs";

const root = fileURLToPath(new URL(".", import.meta.url));
const staticRoot = join(root, "static");
const libRoot = join(root, "lib");
const dataRoot = join(root, "data");
const port = Number(process.env.PORT || 5174);
const host = process.env.HOST || "0.0.0.0";
const adminPassword = process.env.ADMIN_PASSWORD || "";
const activeSessions = new Set();

const sheetCsvUrl = process.env.KOC_SHEET_CSV_URL || DEFAULT_SHEET_CSV_URL;
const appsScriptUrl = process.env.KOC_APPS_SCRIPT_URL || "";

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

function send(res, status, body, contentType = "text/plain; charset=utf-8") {
  res.writeHead(status, {
    "Content-Type": contentType,
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function sendJson(res, status, body) {
  send(res, status, JSON.stringify(body), "application/json; charset=utf-8");
}

function safeCompare(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function getBearerToken(req) {
  const authorization = req.headers.authorization || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || "";
}

function requireAuth(req, res) {
  const token = getBearerToken(req);
  if (token && activeSessions.has(token)) return true;
  sendJson(res, 401, {
    status: "unauthorized",
    message: "Please enter the team password to access KOC Admin.",
  });
  return false;
}

async function readRequestJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks).toString("utf8");
  return body ? JSON.parse(body) : {};
}

function rowsFromValues(values) {
  if (!Array.isArray(values) || values.length < 2) {
    throw new Error("Google Sheet response has no usable values.");
  }

  const headerRowIndex = values.findIndex((row) => row.includes("No.") && row.includes("Name"));

  if (headerRowIndex === -1) {
    throw new Error("Could not find the field header row containing No. and Name.");
  }

  const headers = values[headerRowIndex];
  const body = values.slice(headerRowIndex + 1);

  const rows = body
    .map((cells) => Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""])))
    .filter((row) => Object.values(row).some((value) => String(value ?? "").trim()));

  const missing = validateColumns(headers, REQUIRED_COLUMNS);

  if (missing.length) {
    throw new Error(`Missing required columns: ${missing.join(", ")}`);
  }

  return rows.map((row, index) => normalizeKocRow(row, index + headerRowIndex + 2));
}

async function fetchRowsFromAppsScript(sheetName) {
  if (!appsScriptUrl) {
    throw new Error("No Google Apps Script URL configured.");
  }

  const url = new URL(appsScriptUrl);
  url.searchParams.set("sheet", sheetName);

  const response = await fetch(url.toString());

  if (!response.ok) {
    throw new Error(`Google Apps Script request failed: ${response.status}`);
  }

  const text = await response.text();

  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(`Google Apps Script did not return JSON. First response text: ${text.slice(0, 180)}`);
  }

  if (payload.error) {
    throw new Error(`Google Apps Script returned error: ${payload.error}`);
  }

  if (Array.isArray(payload.values)) {
    return rowsFromValues(payload.values);
  }

  if (Array.isArray(payload.rows)) {
    const missing = validateColumns(Object.keys(payload.rows[0] || {}), REQUIRED_COLUMNS);
    if (missing.length) {
      throw new Error(`Missing required columns: ${missing.join(", ")}`);
    }

    return payload.rows.map((row, index) => normalizeKocRow(row, index + 3));
  }

  throw new Error("Google Apps Script response must include values or rows.");
}

async function fetchRowsFromCsv() {
  const response = await fetch(sheetCsvUrl);

  if (!response.ok) {
    throw new Error(`Google Sheets CSV request failed: ${response.status}`);
  }

  return rowsFromValues(parseCsvRows(await response.text()));
}

async function fetchSnapshotRowsForYear(year) {
  const snapshot = JSON.parse(await readFile(join(dataRoot, `${year}-koc-snapshot.json`), "utf8"));

  return snapshot.rows.map((row, index) => ({
    ...normalizeKocRow(row, index + 3),
    year,
    key: `${year}-${index + 3}`,
  }));
}

async function loadYearFromAppsScript(year) {
  const sheetName = `${year} KOC`;

  const users = await fetchRowsFromAppsScript(sheetName);

  return users.map((user) => ({
    ...user,
    year,
    key: `${year}-${user.rowNumber}`,
  }));
}

async function loadInfluencersFromAppsScript() {
  const users = await fetchRowsFromAppsScript("Influencers");

  return users.map((user) => ({
    ...user,
    year: "Influencers",
    key: `influencers-${user.rowNumber}`,
  }));
}

async function handleUsers(res) {
  const warnings = [];
  let mode = "google_apps_script_2025_2026";

  let users2025 = [];
  let users2026 = [];
  let influencers = [];

  try {
    users2025 = await loadYearFromAppsScript("2025");
  } catch (error) {
    warnings.push(
      error instanceof Error
        ? `2025 Google Apps Script load failed: ${error.message}`
        : "2025 Google Apps Script load failed.",
    );

    users2025 = await fetchSnapshotRowsForYear("2025");
    mode = "partial_google_apps_script_with_2025_snapshot";
  }

  try {
    users2026 = await loadYearFromAppsScript("2026");
  } catch (error) {
    warnings.push(
      error instanceof Error
        ? `2026 Google Apps Script load failed: ${error.message}`
        : "2026 Google Apps Script load failed.",
    );

    try {
      users2026 = (await fetchRowsFromCsv()).map((user) => ({
        ...user,
        year: "2026",
        key: `2026-${user.rowNumber}`,
      }));
      mode = "partial_google_apps_script_with_2026_csv";
    } catch (csvError) {
      warnings.push(csvError instanceof Error ? `2026 CSV load failed: ${csvError.message}` : "2026 CSV load failed.");
      users2026 = await fetchSnapshotRowsForYear("2026");
      mode = "local_snapshots";
    }
  }

  try {
    influencers = await loadInfluencersFromAppsScript();
  } catch (error) {
    warnings.push(
      error instanceof Error
        ? `Influencers Google Apps Script load failed: ${error.message}`
        : "Influencers Google Apps Script load failed.",
    );
    mode = mode === "google_apps_script_2025_2026" ? "partial_google_apps_script_without_influencers" : mode;
  }

  const users = [...users2025, ...users2026];

  sendJson(res, 200, {
    source: {
      sheetName: "2025 KOC + 2026 KOC + Influencers",
      appsScriptUrl,
      sheetCsvUrl,
      mode,
      warning: warnings.join(" "),
    },
    usersByYear: {
      2025: users2025,
      2026: users2026,
    },
    influencers,
    users,
    today: buildTodayBuckets(users),
  });
}

async function handleDiagnostics(res) {
  const checks = {
    appsScriptConfigured: Boolean(appsScriptUrl),
    appsScriptUrl,
    csvUrl: sheetCsvUrl,
    sheets: {},
  };

  for (const sheetName of ["2025 KOC", "2026 KOC", "Influencers"]) {
    try {
      const url = new URL(appsScriptUrl);
      url.searchParams.set("sheet", sheetName);

      const response = await fetch(url.toString());
      const text = await response.text();

      checks.sheets[sheetName] = {
        ok: response.ok,
        status: response.status,
        contentType: response.headers.get("content-type"),
        preview: text.slice(0, 300),
      };
    } catch (error) {
      checks.sheets[sheetName] = {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  sendJson(res, 200, checks);
}

async function handleLogin(req, res) {
  if (!adminPassword) {
    sendJson(res, 503, {
      status: "password_not_configured",
      message: "ADMIN_PASSWORD is not configured on this server.",
    });
    return;
  }

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
  });
}

async function handleHealth(res) {
  sendJson(res, 200, {
    status: "ok",
    app: "koc-admin-dashboard",
    passwordConfigured: Boolean(adminPassword),
    appsScriptConfigured: Boolean(appsScriptUrl),
  });
}

async function handleAnalyze(req, res) {
  const body = await readRequestJson(req);

  const row = normalizeKocRow(
    {
      ...body.row?.raw,
      "Raw Update Notes": body.updateInput ?? body.row?.updateInput ?? "",
    },
    body.row?.rowNumber,
  );

  sendJson(res, 200, analyzeUpdateNote(row));
}

async function handleApply(req, res) {
  await readRequestJson(req);

  if (!process.env.GOOGLE_SHEETS_ACCESS_TOKEN) {
    sendJson(res, 501, {
      status: "authorization_required",
      message:
        "This local v1 can preview updates, but writing back needs Google Sheets authorization. Configure GOOGLE_SHEETS_ACCESS_TOKEN.",
    });
    return;
  }

  sendJson(res, 501, {
    status: "not_enabled",
    message: "Write-back token was found, but the direct Sheets write adapter has not been enabled in this v1.",
  });
}

async function readSafeFile(baseRoot, pathname) {
  const safePath = normalize(pathname).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(baseRoot, safePath);

  if (!filePath.startsWith(baseRoot)) {
    throw Object.assign(new Error("Forbidden"), { statusCode: 403 });
  }

  return {
    filePath,
    content: await readFile(filePath),
  };
}

async function handleStatic(req, res) {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  const requested = url.pathname === "/" ? "/index.html" : url.pathname;

  const baseRoot = requested.startsWith("/lib/")
    ? libRoot
    : requested.startsWith("/data/")
      ? dataRoot
      : staticRoot;

  const pathname = requested.startsWith("/lib/")
    ? requested.replace(/^\/lib\//, "/")
    : requested.startsWith("/data/")
      ? requested.replace(/^\/data\//, "/")
      : requested;

  const { filePath, content } = await readSafeFile(baseRoot, pathname);

  send(res, 200, content, mimeTypes[extname(filePath)] || "application/octet-stream");
}

const server = createServer(async (req, res) => {
  try {
    if (req.url?.startsWith("/api/health")) {
      await handleHealth(res);
      return;
    }

    if (req.url?.startsWith("/api/login") && req.method === "POST") {
      await handleLogin(req, res);
      return;
    }

    if (req.url?.startsWith("/api/users")) {
      if (!requireAuth(req, res)) return;
      await handleUsers(res);
      return;
    }

    if (req.url?.startsWith("/api/diagnostics")) {
      if (!requireAuth(req, res)) return;
      await handleDiagnostics(res);
      return;
    }

    if (req.url?.startsWith("/api/analyze") && req.method === "POST") {
      if (!requireAuth(req, res)) return;
      await handleAnalyze(req, res);
      return;
    }

    if (req.url?.startsWith("/api/apply") && req.method === "POST") {
      if (!requireAuth(req, res)) return;
      await handleApply(req, res);
      return;
    }

    await handleStatic(req, res);
  } catch (error) {
    if (error && typeof error === "object" && "statusCode" in error && error.statusCode === 403) {
      send(res, 403, "Forbidden");
      return;
    }

    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      send(res, 404, "Not found");
      return;
    }

    send(res, 500, error instanceof Error ? error.message : "Unknown server error");
  }
});

server.listen(port, host, () => {
  console.log(`KOC Admin running on ${host}:${port}`);
});
