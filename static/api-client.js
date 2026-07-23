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

export function validateAppsScriptData(data, response = {}) {
  const responseOk = response.ok ?? true;
  if (!responseOk || data.status === "error") {
    const error = new Error(
      data.message || messageForApiFailure({ status: response.status, contentType: response.contentType, fallback: "Request failed." }),
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

export function buildJsonpUrl(baseUrl, action, payload = {}) {
  const params = new URLSearchParams();
  params.set("action", action);
  if (payload.callback) params.set("callback", String(payload.callback));
  const requestPayload = { ...payload };
  delete requestPayload.callback;
  params.set("payload", JSON.stringify(requestPayload));
  return `${baseUrl}?${params.toString()}`;
}

function getJsonpCallbackName() {
  return `__kocJsonp${Date.now()}${Math.floor(Math.random() * 100000)}`;
}

function getBrowserDocument() {
  return typeof document === "undefined" ? null : document;
}

function isGithubPagesHost() {
  return typeof location !== "undefined" && location.hostname.endsWith("github.io");
}

export function shouldUseLocalApi() {
  if (KOC_CONFIG.apiMode === "local") return true;
  if (KOC_CONFIG.apiMode === "apps-script") return false;
  if (isGithubPagesHost()) return false;
  return !isAppsScriptConfigured();
}

function jsonpAppsScript(action, payload = {}) {
  const pageDocument = getBrowserDocument();
  if (!pageDocument || typeof window === "undefined") {
    return Promise.reject(new Error("JSONP fallback is only available in a browser."));
  }

  return new Promise((resolve, reject) => {
    const callbackName = getJsonpCallbackName();
    const script = pageDocument.createElement("script");
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("Google Apps Script request timed out. Please try again."));
    }, 20000);

    function cleanup() {
      window.clearTimeout(timeout);
      delete window[callbackName];
      script.remove();
    }

    window[callbackName] = (data) => {
      cleanup();
      try {
        resolve(validateAppsScriptData(data || {}, { ok: true }));
      } catch (error) {
        reject(error);
      }
    };
    script.onerror = () => {
      cleanup();
      reject(new Error("Google Apps Script request was blocked. Please allow script.google.com or try another browser."));
    };
    script.src = buildJsonpUrl(KOC_CONFIG.appsScriptUrl, action, { ...payload, callback: callbackName });
    pageDocument.head.appendChild(script);
  });
}

async function postAppsScript(action, payload = {}) {
  if (!isAppsScriptConfigured()) {
    throw new Error("Google Apps Script URL is not configured.");
  }

  let response;
  try {
    response = await fetch(KOC_CONFIG.appsScriptUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action, ...payload }),
    });
  } catch (error) {
    return jsonpAppsScript(action, payload);
  }
  const contentType = response.headers.get("content-type") || "";
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    return jsonpAppsScript(action, payload);
  }
  return validateAppsScriptData(data, { ok: response.ok, status: response.status, contentType });
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
