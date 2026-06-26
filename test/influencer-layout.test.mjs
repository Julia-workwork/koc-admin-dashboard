import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const html = fs.readFileSync(new URL("../static/index.html", import.meta.url), "utf8");
const app = fs.readFileSync(new URL("../static/app.js", import.meta.url), "utf8");

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
