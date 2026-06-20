import { KOC_CONFIG } from "./config.js";

const PLACEHOLDER_APPS_SCRIPT_URL = "PASTE_APPS_SCRIPT_WEB_APP_URL_HERE";

function isAppsScriptConfigured() {
  return Boolean(KOC_CONFIG.appsScriptUrl && KOC_CONFIG.appsScriptUrl !== PLACEHOLDER_APPS_SCRIPT_URL);
}

export function isAuthenticationError(error) {
  const message = String(error?.message || "").toLowerCase();
  return (
    error?.status === 401 ||
    error?.status === "authorization_required" ||
    message.includes("sign in again") ||
    message.includes("session expired") ||
    message.includes("unauthorized")
  );
}

export function messageForApiFailure({ status, contentType = "", fallback = "Request failed." } = {}) {
  if (String(contentType).includes("text/html")) {
    return "Google Apps Script returned an error page. Please check the web app deployment and try signing in again.";
  }
  if (status) return `${fallback} (HTTP ${status})`;
  return fallback;
}

function shouldUseLocalApi() {
  if (KOC_CONFIG.apiMode === "local") return true;
  if (KOC_CONFIG.apiMode === "apps-script") return false;
  return !isAppsScriptConfigured() || !location.hostname.endsWith("github.io");
}

async function postAppsScript(action, payload = {}) {
  if (!isAppsScriptConfigured()) {
    throw new Error("Google Apps Script URL is not configured.");
  }

  const response = await fetch(KOC_CONFIG.appsScriptUrl, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action, ...payload }),
  });
  const contentType = response.headers.get("content-type") || "";
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    const error = new Error(messageForApiFailure({ status: response.status, contentType }));
    error.status = response.status;
    throw error;
  }
  if (!response.ok || data.status === "error") {
    const error = new Error(
      data.message || messageForApiFailure({ status: response.status, contentType, fallback: "Request failed." }),
    );
    error.status = data.statusCode || response.status;
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
  if (shouldUseLocalApi()) {
    return postLocal("/api/login", { username, password });
  }
  return postAppsScript("login", { username, password });
}

export async function loadDashboard(token) {
  if (shouldUseLocalApi()) {
    return getLocal("/api/users", token);
  }
  return postAppsScript("users", { token });
}

export async function analyzeUpdate(row, updateInput, token) {
  if (!shouldUseLocalApi()) {
    throw new Error("Update analysis will run locally in the static dashboard.");
  }
  return postLocal("/api/analyze", { row, updateInput }, token);
}

export async function applyFields(payload, token) {
  if (shouldUseLocalApi()) {
    return postLocal("/api/apply", payload, token);
  }
  return postAppsScript("apply", { token, ...payload });
}
