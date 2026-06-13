import test from "node:test";
import assert from "node:assert/strict";
import { parseCsv, parseCsvRows } from "../lib/csv.mjs";

test("parses quoted commas and newlines", () => {
  const rows = parseCsv('Name,Notes\n"Andre, Solo","line 1\nline 2"\n');
  assert.deepEqual(rows, [{ Name: "Andre, Solo", Notes: "line 1\nline 2" }]);
});

test("keeps missing trailing cells as empty strings", () => {
  const rows = parseCsv("Name,Email,Notes\nAdam,,\n");
  assert.deepEqual(rows, [{ Name: "Adam", Email: "", Notes: "" }]);
});

test("keeps Google Sheet two-row headers available for server header detection", () => {
  const rows = parseCsvRows(
    "Basic Information,,,,Evaluation & Segmentation\nNo.,Date,Name,Profile,Raw Update Notes\n1,2026-01-01,Adam,,Needs follow-up\n",
  );

  assert.deepEqual(rows[0], ["Basic Information", "", "", "", "Evaluation & Segmentation"]);
  assert.deepEqual(rows[1], ["No.", "Date", "Name", "Profile", "Raw Update Notes"]);
  assert.deepEqual(rows[2], ["1", "2026-01-01", "Adam", "", "Needs follow-up"]);
});
