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
