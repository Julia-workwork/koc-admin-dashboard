import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  buildJsonpUrl,
  isAuthenticationError,
  messageForApiFailure,
  shouldUseLocalApi,
  validateAppsScriptData,
} from "../static/api-client.js";

test("recognizes expired and unauthorized session errors from Apps Script", () => {
  assert.equal(isAuthenticationError({ status: 401 }), true);
  assert.equal(isAuthenticationError({ status: "authorization_required" }), true);
  assert.equal(isAuthenticationError(new Error("Session expired. Please sign in again.")), true);
});

test("turns non-json Apps Script failures into a clear message", () => {
  assert.equal(
    messageForApiFailure({ status: 500, contentType: "text/html", fallback: "Request failed." }),
    "Google Apps Script returned an error page. Please check the web app deployment and try signing in again.",
  );
});

test("builds a JSONP Apps Script URL for cross-origin fallback reads", () => {
  const url = buildJsonpUrl("https://script.google.com/macros/s/example/exec", "users", {
    token: "abc 123",
    callback: "__kocJsonp1",
  });

  assert.equal(
    url,
    "https://script.google.com/macros/s/example/exec?action=users&callback=__kocJsonp1&payload=%7B%22token%22%3A%22abc+123%22%7D",
  );
});

test("GitHub Pages never falls back to missing local APIs", () => {
  const previousLocation = global.location;
  global.location = { hostname: "julia-workwork.github.io" };

  try {
    assert.equal(shouldUseLocalApi(), false);
  } finally {
    if (previousLocation === undefined) {
      delete global.location;
    } else {
      global.location = previousLocation;
    }
  }
});

test("Apps Script supports callback-wrapped JSONP output", () => {
  const code = fs.readFileSync(new URL("../google-apps-script/Code.gs", import.meta.url), "utf8");
  assert.match(code, /params\.callback/);
  assert.match(code, /MimeType\.JAVASCRIPT/);
});

test("throws readable errors from JSONP Apps Script responses", () => {
  assert.throws(
    () => validateAppsScriptData({ status: "error", message: "Sheet not found: Influencers", statusCode: 404 }),
    /Sheet not found: Influencers/,
  );
});
