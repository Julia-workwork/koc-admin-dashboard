import test from "node:test";
import assert from "node:assert/strict";

import { isAuthenticationError, messageForApiFailure } from "../static/api-client.js";

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
