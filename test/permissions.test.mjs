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
    Channel: "TikTok, YouTube",
    "ABC Program Potential": "Yes",
    "Beta Tester Potential": "Yes",
    "Cooperation Level": "High",
    "User Type": "KOC Content, Beta Test",
    "Exchange Product": "HA2",
    "Country/Region": "UK",
    Status: "Active Collab",
    "Next Action": "Send sample follow-up",
    Profile: "Do not change",
  });

  assert.deepEqual(filtered, {
    Channel: "TikTok, YouTube",
    "ABC Program Potential": "Yes",
    "Beta Tester Potential": "Yes",
    "Cooperation Level": "High",
    "User Type": "KOC Content, Beta Test",
    "Exchange Product": "HA2",
    "Country/Region": "UK",
    Status: "Active Collab",
    "Next Action": "Send sample follow-up",
  });
});

test("Editable field lists include the planned operational fields", () => {
  assert.ok(EDITABLE_FIELDS.koc.includes("Update Input - Write Here"));
  assert.equal(EDITABLE_FIELDS.koc.includes("Raw Update Notes"), false);
  assert.ok(EDITABLE_FIELDS.koc.includes("User Type"));
  assert.equal(EDITABLE_FIELDS.influencer.includes("Raw Update Notes"), false);
  assert.ok(EDITABLE_FIELDS.influencer.includes("Next Action"));
  assert.ok(EDITABLE_FIELDS.influencer.includes("Channel"));
  assert.ok(EDITABLE_FIELDS.influencer.includes("ABC Program Potential"));
  assert.ok(EDITABLE_FIELDS.influencer.includes("User Type"));
  assert.ok(EDITABLE_FIELDS.influencer.includes("Exchange Product"));
});
