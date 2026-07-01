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

test("User filters stay compact in two rows on narrow screens", () => {
  const narrowRules = css.match(/@media \(max-width: 980px\)\s*{[\s\S]*?(?=\n@media \(max-width: 640px\))/)?.[0] || "";

  assert.match(narrowRules, /\.users-sticky-panel\s*{[\s\S]*position:\s*static;/);
  assert.match(narrowRules, /\.users-sticky-panel \.toolbar\s*{[\s\S]*display:\s*grid;[\s\S]*grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\);/);
  assert.match(narrowRules, /\.users-sticky-panel \.toolbar \.search-box\s*{[\s\S]*grid-column:\s*span 2;/);
  assert.match(narrowRules, /\.users-sticky-panel \.toolbar input,[\s\S]*\.users-sticky-panel \.toolbar select\s*{[\s\S]*min-height:\s*46px;/);
});

test("Influencer narrow screens keep summary and filters compact", () => {
  const narrowRules = css.match(/@media \(max-width: 980px\)\s*{[\s\S]*?(?=\n@media \(max-width: 640px\))/)?.[0] || "";

  assert.match(narrowRules, /\.influencer-summary\s*{[\s\S]*grid-template-columns:\s*repeat\(3, minmax\(150px, 1fr\)\);/);
  assert.match(narrowRules, /\.influencer-summary \.summary-card\s*{[\s\S]*min-height:\s*96px;/);
  assert.match(narrowRules, /\.influencer-toolbar\s*{[\s\S]*display:\s*grid;[\s\S]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/);
  assert.match(narrowRules, /\.influencer-toolbar \.search-box\s*{[\s\S]*grid-column:\s*auto;/);
});

test("Today overview stays dense and readable on narrow screens", () => {
  const narrowRules = css.match(/@media \(max-width: 980px\)\s*{[\s\S]*?(?=\n@media \(max-width: 640px\))/)?.[0] || "";
  const phoneRules = css.match(/@media \(max-width: 640px\)\s*{[\s\S]*$/)?.[0] || "";

  assert.match(narrowRules, /\.summary-strip\s*{[\s\S]*grid-template-columns:\s*repeat\(3, minmax\(150px, 1fr\)\);/);
  assert.match(narrowRules, /\.summary-strip \.summary-card\s*{[\s\S]*min-height:\s*96px;/);
  assert.match(narrowRules, /\.summary-strip \.summary-card strong\s*{[\s\S]*font-size:\s*34px;/);
  assert.match(narrowRules, /\.today-grid\s*{[\s\S]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/);
  assert.match(phoneRules, /\.summary-strip\s*{[\s\S]*grid-template-columns:\s*repeat\(2, minmax\(130px, 1fr\)\);/);
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
  assert.match(app, /renderUserTypeMultiSelect\(user\.types\)/);
  assert.match(app, /function renderUserTypeMultiSelect/);
  assert.match(app, /class="multi-select-chips"/);
  assert.match(app, /<h3>Notes<\/h3>[\s\S]*edit-notes/);
  assert.match(app, /<h3>Follow-up<\/h3>[\s\S]*edit-next-follow-up/);
  assert.doesNotMatch(app, /id="edit-user-type" value=/);
  assert.match(app, /detail-save-bar/);
});

test("KOC user type writes selected multi-select chips back as comma text", () => {
  assert.match(app, /querySelectorAll\("#edit-user-type-options input:checked"\)/);
  assert.match(app, /map\(\(input\) => input\.value\)/);
  assert.match(app, /join\(", "\)/);
});

test("KOC user detail keeps only the save action after raw input removal", () => {
  assert.match(app, /id="save-record-button"[\s\S]*Save Record/);
  assert.doesNotMatch(app, /Analyze Update/);
  assert.doesNotMatch(app, /Apply Preview/);
  assert.doesNotMatch(app, /id="analyze-button"/);
  assert.doesNotMatch(app, /id="apply-button"/);
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
