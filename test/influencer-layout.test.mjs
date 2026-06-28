import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const html = fs.readFileSync(new URL("../static/index.html", import.meta.url), "utf8");
const app = fs.readFileSync(new URL("../static/app.js", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../static/styles.css", import.meta.url), "utf8");

test("Influencer list uses the compact five-column table", () => {
  const influencerSection = html.match(/<section id="influencers-view"[\s\S]*?<\/section>\s*<section id="rules-view"/)?.[0] || "";

  ["Name", "Level", "Channel", "Audience", "Status"].forEach((header) => {
    assert.match(influencerSection, new RegExp(`<th>${header}</th>`));
  });
  assert.doesNotMatch(influencerSection, /<th>Product<\/th>/);
  assert.doesNotMatch(influencerSection, /<th>Next Action<\/th>/);
});

test("Influencer details open in the shared detail drawer instead of a permanent side panel", () => {
  assert.doesNotMatch(html, /id="influencer-inline-detail"/);
  assert.doesNotMatch(app, /influencerInlineDetail/);
  assert.match(app, /detailPanel\.classList\.add\("open"\)/);
});

test("User list table is integrated into the page instead of a small inner scroll panel", () => {
  assert.match(html, /class="table-shell user-table-shell"/);
  assert.match(html, /<table class="user-table">/);
  assert.match(css, /\.table-shell\.user-table-shell\s*{[\s\S]*max-height:\s*none;/);
  assert.match(css, /\.table-shell\.user-table-shell\s*{[\s\S]*overflow:\s*visible;/);
});

test("Influencer detail uses a compact decision panel", () => {
  const keylineStart = app.indexOf('<div class="creator-keyline">');
  const keylineEnd = app.indexOf("</div>", keylineStart);
  const creatorKeyline = app.slice(keylineStart, keylineEnd);

  assert.match(app, /creator-compact-hero/);
  assert.match(app, /creator-keyline/);
  assert.match(creatorKeyline, /renderChips\(user\.channels, PALETTES\.channel\)/);
  assert.match(creatorKeyline, /renderChips\(user\.types, PALETTES\.type\)/);
  assert.match(app, /creator-action-row/);
  assert.match(app, /creator-ops-grid/);
  assert.match(app, /More Creator Details/);
  assert.doesNotMatch(app, /Selected Creator/);
  assert.doesNotMatch(app, /creator-avatar/);
  assert.doesNotMatch(css, /\.creator-avatar/);
  assert.doesNotMatch(app, /Basic Information/);
  assert.doesNotMatch(app, /Raw Sheet Fields/);
});

test("Detail drawer shows the record level beside the selected name", () => {
  assert.match(html, /id="detail-level-badge"/);
  assert.match(css, /\.detail-title-row/);
  assert.match(css, /\.detail-level-badge/);
  assert.match(app, /function setDetailHeader/);
  assert.match(app, /setDetailHeader\(user, "Influencer Detail"\)/);
  assert.match(app, /setDetailHeader\(user, "User Detail"\)/);
});

test("KOC user editable controls live inside the original detail sections", () => {
  assert.doesNotMatch(app, /Editable Operations/);
  assert.match(app, /<h3>Evaluation<\/h3>[\s\S]*edit-user-level/);
  assert.match(app, /<h3>Notes<\/h3>[\s\S]*edit-notes/);
  assert.match(app, /<h3>Follow-up<\/h3>[\s\S]*edit-next-follow-up/);
  assert.match(app, /detail-save-bar/);
});

test("Influencer editable controls live inside the original detail sections", () => {
  assert.doesNotMatch(app, /Edit Collaboration/);
  assert.doesNotMatch(app, /influencer-edit-section/);
  assert.match(app, /const visibleOpsFields = fieldGrid\([\s\S]*edit-influencer-level/);
  assert.match(app, /const visibleOpsFields = fieldGrid\([\s\S]*edit-influencer-status/);
  assert.match(app, /const visibleOpsFields = fieldGrid\([\s\S]*edit-influencer-product/);
  assert.match(app, /const visibleNotesFields = fieldGrid\([\s\S]*edit-influencer-notes/);
  assert.match(app, /const visibleNotesFields = fieldGrid\([\s\S]*edit-influencer-update-input/);
  assert.match(app, /id="save-influencer-button"[\s\S]*Save Influencer/);
});
