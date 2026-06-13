import test from "node:test";
import assert from "node:assert/strict";
import {
  analyzeUpdateNote,
  buildTodayBuckets,
  normalizeKocRow,
  OPTIONS,
  PALETTES,
  REQUIRED_COLUMNS,
} from "../lib/koc-domain.mjs";

test("required columns include existing 2026 KOC sheet headers", () => {
  assert.equal(REQUIRED_COLUMNS.includes("Name"), true);
  assert.equal(REQUIRED_COLUMNS.includes("Raw Update Notes"), true);
});

test("normalizes one Google Sheet row into admin-friendly fields", () => {
  const row = normalizeKocRow(
    {
      "No.": "2",
      Date: "1/12/2026",
      Name: "Andre Solo",
      "User Level (S/A/B/C/TBD)": "A",
      "Beta Tester Potential": "Yes",
      "Content Feedback Quality": "High",
      "Cooperation Level": "Medium",
      "User Status": "Ready to Follow Up",
      Channel: "TikTok, YouTube",
      "User Type": "Beta Test, Community Active",
      "Self-Owned Product": "HA2",
      "Country/Region": "Canada",
      Email: "andre@example.com",
      "Raw Update Notes": "Replied slowly but gave useful field details.",
    },
    4,
  );

  assert.equal(row.rowNumber, 4);
  assert.equal(row.name, "Andre Solo");
  assert.equal(row.level, "A");
  assert.deepEqual(row.channels, ["TikTok", "YouTube"]);
  assert.equal(row.audience, "");
  assert.deepEqual(row.types, ["Beta Test", "Community Active"]);
  assert.equal(row.updateInput, "Replied slowly but gave useful field details.");
});

test("keeps Influencers separate from KOC user type options", () => {
  assert.equal(OPTIONS.type.includes("Influencer"), false);
  assert.equal(PALETTES.channel.INS, "#C2185B");
});

test("analyzes fragmented notes with balanced judgment", () => {
  const suggestion = analyzeUpdateNote(
    {
      name: "Andre Solo",
      updateInput: "回复比较慢，但是之前发过完整视频反馈，愿意继续测试 HA1G。",
      description: "",
      resources: "",
      notes: "",
      ownedProduct: "HA2",
      exchangeProduct: "",
    },
    new Date("2026-05-13T00:00:00Z"),
  );

  assert.equal(suggestion.fields["Beta Tester Potential"], "Yes");
  assert.equal(suggestion.fields["Content Feedback Quality"], "High");
  assert.equal(suggestion.fields["Cooperation Level"], "Medium");
  assert.equal(suggestion.fields["User Status"], "Watchlist");
  assert.equal(suggestion.fields["Follow-up Priority"], "Medium");
});

test("extracts influencer audience and links from resources", () => {
  const row = normalizeKocRow(
    {
      Name: "hamradiostuff",
      Channel: "INS",
      Resources: "INS 36K followers\nhttps://www.instagram.com/hamradiostuff/?g=5",
    },
    7,
  );

  assert.equal(row.audience, "36K followers");
  assert.deepEqual(row.links, ["https://www.instagram.com/hamradiostuff/?g=5"]);
});

test("builds Today buckets for pending updates and follow-up dates", () => {
  const rows = [
    normalizeKocRow({ Name: "A", "Raw Update Notes": "new note" }, 3),
    normalizeKocRow({ Name: "B", "Next Follow-up Date": "2026-05-12" }, 4),
    normalizeKocRow({ Name: "C", "User Level (S/A/B/C/TBD)": "S", "Last Contact Date": "2026-03-01" }, 5),
  ];
  const buckets = buildTodayBuckets(rows, new Date("2026-05-13T00:00:00Z"));
  assert.equal(buckets.updatePending.length, 1);
  assert.equal(buckets.needFollowUp.length, 1);
  assert.equal(buckets.highValueQuiet.length, 1);
});
