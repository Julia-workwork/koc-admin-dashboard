export const SHEET_ID = "10fq2tS5iRcywlB9U5oJ5uOEy7tZ2vA8azD7bsCb-HOc";
export const SHEET_NAME = "2026 KOC";
export const DEFAULT_SHEET_CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(SHEET_NAME)}`;

export const REQUIRED_COLUMNS = [
  "No.",
  "Date",
  "Name",
  "Profile",
  "User Level (S/A/B/C/TBD)",
  "ABC Program Potential",
  "Beta Tester Potential",
  "Content Feedback Quality",
  "Cooperation Level",
  "User Status",
  "User Type",
  "Self-Owned Product",
  "Exchange Product",
  "Country/Region",
  "Email",
  "Address",
  "Description",
  "Resources",
  "Notes",
  "Extra Notes 1",
  "Extended Background",
  "Raw Update Notes",
];

export const MANAGEMENT_COLUMNS = [
  "Last Contact Date",
  "Next Follow-up Date",
  "Follow-up Priority",
  "Follow-up Reason",
  "AI Suggestion Status",
  "Last Parsed At",
];

export const PALETTES = {
  level: {
    S: "#08306B",
    A: "#2171B5",
    B: "#6BAED6",
    C: "#C6DBEF",
    TBD: "#F2F2F2",
  },
  potential: {
    Yes: "#00563F",
    No: "#F2F2F2",
  },
  beta: {
    Yes: "#00D1C3",
    No: "#F2F2F2",
  },
  contentQuality: {
    High: "#5B2C83",
    Medium: "#A569BD",
    Low: "#E8DAEF",
  },
  cooperation: {
    High: "#006D2C",
    Medium: "#74C476",
    Low: "#D9EAD3",
  },
  status: {
    Watchlist: "#AECBFA",
    "Ready to Follow Up": "#F9AB00",
    "In Collaboration": "#00563F",
    Paused: "#999999",
    Blocked: "#B00020",
  },
  type: {
    "KOC Content": "#B8A1D9",
    "Beta Test": "#00D1C3",
    "Community Active": "#AECBFA",
    "Technical Advisor": "#10398C",
    "Purchased User": "#F4B183",
    "Risk User": "#D93025",
  },
  channel: {
    INS: "#C2185B",
    Instagram: "#C2185B",
    TikTok: "#00A99D",
    YouTube: "#0969FF",
    Facebook: "#1877F2",
  },
  priority: {
    High: "#D93025",
    Medium: "#F9AB00",
    Low: "#D9EAD3",
  },
};

export const OPTIONS = {
  level: ["S", "A", "B", "C", "TBD"],
  yesNo: ["Yes", "No"],
  quality: ["High", "Medium", "Low"],
  status: ["Watchlist", "Ready to Follow Up", "In Collaboration", "Paused", "Blocked"],
  type: ["KOC Content", "Beta Test", "Community Active", "Technical Advisor", "Purchased User", "Risk User"],
  priority: ["High", "Medium", "Low"],
};

export const ROLES = {
  admin: "Admin",
  editor: "Editor",
  viewer: "Viewer",
};

export const EDITABLE_FIELDS = {
  koc: [
    "Update Input - Write Here",
    "Raw Update Notes",
    "User Level (S/A/B/C/TBD)",
    "ABC Program Potential",
    "Beta Tester Potential",
    "Content Feedback Quality",
    "Cooperation Level",
    "User Status",
    "User Type",
    "Last Contact Date",
    "Next Follow-up Date",
    "Follow-up Reason",
    "Notes",
    "AI Suggestion Status",
  ],
  influencer: [
    "Update Input - Write Here",
    "Raw Update Notes",
    "Level",
    "Status",
    "Product",
    "Next Action",
    "Latest Note",
    "Notes",
    "Last Contact Date",
    "Next Follow-up Date",
  ],
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function clean(value) {
  return String(value ?? "").trim();
}

function splitTypes(value) {
  return clean(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeDate(value) {
  const text = clean(value);
  if (!text) return "";
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return text;
  return parsed.toISOString().slice(0, 10);
}

function daysBetween(dateText, now) {
  const normalized = normalizeDate(dateText);
  if (!normalized) return null;
  const parsed = new Date(`${normalized}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return Math.floor((today.getTime() - parsed.getTime()) / MS_PER_DAY);
}

function addDays(now, days) {
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function includesAny(text, words) {
  const haystack = text.toLowerCase();
  return words.some((word) => haystack.includes(word.toLowerCase()));
}

function mergeTypes(...groups) {
  return [...new Set(groups.flat().filter(Boolean))].join(", ");
}

function extractUrls(...values) {
  return [
    ...new Set(
      values
        .map(clean)
        .join("\n")
        .match(/https?:\/\/[^\s)]+/g) || [],
    ),
  ];
}

function extractAudience(value) {
  const text = clean(value);
  if (!text) return "";
  const match = text.match(/(?:INS\s*)?([\d,.]+)\s*[Kk]?\s*(?:followers?|Followers?)/);
  if (match) {
    const unit = /[\d,.]+\s*[Kk]\s*(?:followers?|Followers?)/.test(match[0]) ? "K" : "";
    return `${match[1]}${unit} followers`;
  }
  const firstLine = text
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith("http"));
  return firstLine || "";
}

export function validateColumns(headers, required = REQUIRED_COLUMNS) {
  return required.filter((header) => !headers.includes(header));
}

export function canRoleEditRecords(role) {
  return role === ROLES.admin || role === ROLES.editor;
}

export function canRoleManageRules(role) {
  return role === ROLES.admin;
}

export function filterAllowedFields(recordType, fields) {
  const allowed = new Set(EDITABLE_FIELDS[recordType] || []);
  return Object.fromEntries(Object.entries(fields || {}).filter(([field]) => allowed.has(field)));
}

export function normalizeKocRow(row, rowNumber) {
  const name = clean(row.Name);
  const updateInput = clean(row["Raw Update Notes"] || row["Update Input - Write Here"]);
  return {
    raw: row,
    rowNumber,
    no: clean(row["No."]),
    date: normalizeDate(row.Date),
    name,
    profile: clean(row.Profile),
    level: clean(row["User Level (S/A/B/C/TBD)"]),
    abcPotential: clean(row["ABC Program Potential"]),
    betaPotential: clean(row["Beta Tester Potential"]),
    contentQuality: clean(row["Content Feedback Quality"]),
    cooperation: clean(row["Cooperation Level"]),
    status: clean(row["User Status"]),
    channel: clean(row.Channel),
    channels: splitTypes(row.Channel),
    userType: clean(row["User Type"]),
    types: splitTypes(row["User Type"]),
    ownedProduct: clean(row["Self-Owned Product"]),
    exchangeProduct: clean(row["Exchange Product"]),
    country: clean(row["Country/Region"]),
    email: clean(row.Email),
    address: clean(row.Address),
    description: clean(row.Description),
    resources: clean(row.Resources),
    notes: clean(row.Notes),
    extraNotes: clean(row["Extra Notes 1"]),
    extendedBackground: clean(row["Extended Background"]),
    updateInput,
    lastContactDate: normalizeDate(row["Last Contact Date"]),
    nextFollowUpDate: normalizeDate(row["Next Follow-up Date"]),
    followUpPriority: clean(row["Follow-up Priority"]),
    followUpReason: clean(row["Follow-up Reason"]),
    aiSuggestionStatus: clean(row["AI Suggestion Status"]),
    lastParsedAt: clean(row["Last Parsed At"]),
    audience: extractAudience(row.Resources),
    links: extractUrls(row.Resources, row.Notes, row["Extended Background"], row["Raw Update Notes"]),
    searchText: Object.values(row).map(clean).join(" ").toLowerCase(),
  };
}

export function buildTodayBuckets(rows, now = new Date()) {
  const updatePending = rows.filter((row) => row.updateInput && row.aiSuggestionStatus !== "Applied");
  const needFollowUp = rows.filter((row) => {
    const diff = daysBetween(row.nextFollowUpDate, now);
    return diff !== null && diff >= 0;
  });
  const highValueQuiet = rows.filter((row) => {
    if (!["S", "A"].includes(row.level)) return false;
    const diff = daysBetween(row.lastContactDate || row.date, now);
    return diff !== null && diff >= 30;
  });
  const betaCandidates = rows.filter((row) => row.betaPotential === "Yes" || row.types.includes("Beta Test"));
  const watchlist = rows.filter((row) => row.status === "Watchlist" || row.status === "Blocked");

  return {
    updatePending,
    needFollowUp,
    highValueQuiet,
    betaCandidates,
    watchlist,
  };
}

export function analyzeUpdateNote(row, now = new Date()) {
  const context = [
    row.updateInput,
    row.description,
    row.resources,
    row.notes,
    row.extendedBackground,
    row.ownedProduct,
    row.exchangeProduct,
  ]
    .map(clean)
    .join("\n");
  const fields = {};
  const reasons = [];
  const currentTypes = Array.isArray(row.types) ? row.types : splitTypes(row.userType);

  const technical = includesAny(context, [
    "bug",
    "firmware",
    "cps",
    "aprs",
    "kiss",
    "dmr",
    "codeplug",
    "test",
    "测试",
    "问题",
    "复现",
    "详细",
    "field",
  ]);
  const content = includesAny(context, ["video", "review", "photo", "photos", "unboxing", "直播", "视频", "图片", "素材", "内容"]);
  const community = includesAny(context, ["group", "community", "help", "search and rescue", "团队", "社区", "帮助"]);
  const slow = includesAny(context, ["slow", "late", "忙", "慢", "不及时", "回复比较慢"]);
  const noResponse = includesAny(context, ["no response", "no reply", "没回复", "不回复"]);
  const willing = includesAny(context, ["willing", "agree", "continue", "愿意", "继续", "可以"]);
  const highQuality = includesAny(context, ["complete", "detailed", "完整", "清晰", "详细", "useful", "有用"]);
  const poorQuality = includesAny(context, ["unclear", "poor", "简单", "不清楚", "很少", "只有"]);
  const risk = includesAny(context, ["scam", "abuse", "风险", "欺诈"]);

  if (technical || willing) {
    fields["Beta Tester Potential"] = "Yes";
    reasons.push("Shows testing interest or technical/product feedback signal.");
  }

  if (content || highQuality) {
    fields["Content Feedback Quality"] = highQuality ? "High" : "Medium";
    reasons.push("Has content or usable feedback evidence.");
  } else if (poorQuality) {
    fields["Content Feedback Quality"] = "Low";
    reasons.push("Feedback/content appears incomplete or unclear.");
  }

  if (noResponse) {
    fields["Cooperation Level"] = "Low";
    fields["User Status"] = "Paused";
    fields["Follow-up Priority"] = "Low";
    fields["Next Follow-up Date"] = addDays(now, 30);
    reasons.push("No-response pattern lowers immediate follow-up priority.");
  } else if (slow) {
    fields["Cooperation Level"] = "Medium";
    fields["User Status"] = "Watchlist";
    fields["Follow-up Priority"] = "Medium";
    fields["Next Follow-up Date"] = addDays(now, 7);
    reasons.push("Slow response suggests watchlist rather than downgrade.");
  } else if (willing) {
    fields["Cooperation Level"] = "High";
    fields["User Status"] = "Ready to Follow Up";
    fields["Follow-up Priority"] = "High";
    fields["Next Follow-up Date"] = addDays(now, 7);
    reasons.push("Willingness to continue needs timely follow-up.");
  }

  const suggestedTypes = [];
  if (content) suggestedTypes.push("KOC Content");
  if (technical || willing) suggestedTypes.push("Beta Test");
  if (community) suggestedTypes.push("Community Active");
  if (technical && highQuality) suggestedTypes.push("Technical Advisor");
  if (risk) {
    suggestedTypes.push("Risk User");
    fields["User Status"] = "Blocked";
    fields["Cooperation Level"] = "Low";
    fields["Follow-up Priority"] = "Low";
  }
  if (suggestedTypes.length) {
    fields["User Type"] = mergeTypes(currentTypes, suggestedTypes);
  }

  if (!fields["User Level (S/A/B/C/TBD)"]) {
    if ((technical || content) && fields["Cooperation Level"] === "High") {
      fields["User Level (S/A/B/C/TBD)"] = "A";
    } else if ((technical || content || community) && fields["Cooperation Level"] !== "Low") {
      fields["User Level (S/A/B/C/TBD)"] = "B";
    } else if (risk || noResponse) {
      fields["User Level (S/A/B/C/TBD)"] = "C";
    } else {
      fields["User Level (S/A/B/C/TBD)"] = row.level || "TBD";
    }
  }

  if (!fields["ABC Program Potential"] && (content || community)) {
    fields["ABC Program Potential"] = "Yes";
  }
  if (!fields["Follow-up Reason"]) {
    fields["Follow-up Reason"] = reasons[0] || "Review fragmented update and decide next user operation step.";
  }
  fields["Last Contact Date"] = addDays(now, 0);
  fields["AI Suggestion Status"] = "Pending";
  fields["Last Parsed At"] = now.toISOString();

  return {
    rowNumber: row.rowNumber,
    name: row.name,
    fields,
    reasons,
    summary: reasons.join(" ") || "Not enough evidence; keep a conservative status.",
  };
}
