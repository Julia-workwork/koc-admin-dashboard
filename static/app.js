import {
  OPTIONS,
  PALETTES,
  buildTodayBuckets,
  canRoleEditRecords,
  canRoleManageRules,
  normalizeKocRow,
} from "./lib/koc-domain.mjs";
import { applyFields, isAuthenticationError, loadDashboard, login } from "./api-client.js";

const state = {
  users: [],
  influencers: [],
  usersByYear: {
    2025: [],
    2026: [],
  },
  activeYear: "2026",
  today: null,
  selected: null,
  filters: {
    query: "",
    level: "",
    status: "",
    type: "",
    beta: "",
    content: "",
    cooperation: "",
  },
  influencerFilters: {
    query: "",
    channel: "",
    status: "",
    product: "",
  },
};

const SESSION_TOKEN_KEY = "koc_admin_session_token";
const SESSION_ACCOUNT_KEY = "koc_admin_account";

const loginView = document.querySelector("#login-view");
const loginForm = document.querySelector("#login-form");
const loginMessage = document.querySelector("#login-message");
const usernameInput = document.querySelector("#username-input");
const passwordInput = document.querySelector("#password-input");
const accountPill = document.querySelector("#account-pill");
const logoutButton = document.querySelector("#logout-button");
const appShell = document.querySelectorAll(".app-shell");
const message = document.querySelector("#state-message");
const summaryStrip = document.querySelector("#summary-strip");
const todayGrid = document.querySelector("#today-grid");
const usersBody = document.querySelector("#users-body");
const usersTitle = document.querySelector("#users-title");
const usersCount = document.querySelector("#users-count");
const influencerSummary = document.querySelector("#influencer-summary");
const influencerCount = document.querySelector("#influencer-count");
const influencersBody = document.querySelector("#influencers-body");
const detailPanel = document.querySelector("#detail-panel");
const detailEyebrow = document.querySelector("#detail-eyebrow");
const detailLevelBadge = document.querySelector("#detail-level-badge");
const detailName = document.querySelector("#detail-name");
const detailContent = document.querySelector("#detail-content");

function sessionToken() {
  return sessionStorage.getItem(SESSION_TOKEN_KEY) || "";
}

function currentAccount() {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_ACCOUNT_KEY) || "null");
  } catch {
    return null;
  }
}

function currentRole() {
  return currentAccount()?.role || "Viewer";
}

function canEditRecords() {
  return canRoleEditRecords(currentRole());
}

function canManageRulesUi() {
  return canRoleManageRules(currentRole());
}

function setSession(token, account) {
  sessionStorage.setItem(SESSION_TOKEN_KEY, token);
  sessionStorage.setItem(SESSION_ACCOUNT_KEY, JSON.stringify(account));
}

function clearSession() {
  sessionStorage.removeItem(SESSION_TOKEN_KEY);
  sessionStorage.removeItem(SESSION_ACCOUNT_KEY);
}

function showLogin(text = "") {
  loginView.hidden = false;
  appShell.forEach((element) => {
    element.hidden = true;
  });
  loginMessage.textContent = text;
  usernameInput.focus();
}

function showApp() {
  loginView.hidden = true;
  appShell.forEach((element) => {
    element.hidden = false;
  });
  const account = currentAccount();
  accountPill.textContent = account ? `${account.displayName} · ${account.role}` : "";
}

function setMessage(text, type = "") {
  message.textContent = text;
  message.className = `state-message ${type}`.trim();
}

function hideMessage() {
  message.textContent = "";
  message.className = "state-message is-hidden";
}

function textColorForBackground(color) {
  const fallback = "#1a2533";
  const hex = String(color || "").replace("#", "");
  if (!/^[\da-f]{6}$/i.test(hex)) return fallback;
  const red = parseInt(hex.slice(0, 2), 16);
  const green = parseInt(hex.slice(2, 4), 16);
  const blue = parseInt(hex.slice(4, 6), 16);
  const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255;
  return luminance < 0.46 ? "#ffffff" : fallback;
}

function chip(label, color) {
  if (!label) return "";
  const background = color || "#eef3f8";
  return `<span class="chip" style="background:${background};color:${textColorForBackground(background)}">${escapeHtml(label)}</span>`;
}

function setDetailHeader(user, label = "User Detail") {
  const level = user.level || "TBD";
  const background = PALETTES.level[level] || PALETTES.level.TBD;
  detailEyebrow.textContent = label;
  detailName.textContent = user.name || "(No name)";
  detailLevelBadge.textContent = level;
  detailLevelBadge.style.background = background;
  detailLevelBadge.style.color = textColorForBackground(background);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderChips(values, palette) {
  const items = (Array.isArray(values) ? values : [values]).filter(Boolean);
  if (!items.length) return "";
  return `<div class="chip-list">${items.map((item) => chip(item, palette?.[item])).join("")}</div>`;
}

function optionList(items) {
  return ["", ...items].map((item) => `<option value="${escapeHtml(item)}">${item || "All"}</option>`).join("");
}

function editOptionList(items, selected = "") {
  return ["", ...items]
    .map((item) => `<option value="${escapeHtml(item)}" ${item === selected ? "selected" : ""}>${escapeHtml(item)}</option>`)
    .join("");
}

function uniqueOptions(values) {
  return [...new Set(values.flat().filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function setupFilters() {
  document.querySelector("#level-filter").innerHTML = optionList(OPTIONS.level);
  document.querySelector("#status-filter").innerHTML = optionList(OPTIONS.status);
  document.querySelector("#type-filter").innerHTML = optionList(OPTIONS.type);
  document.querySelector("#beta-filter").innerHTML = optionList(OPTIONS.yesNo);
  document.querySelector("#content-filter").innerHTML = optionList(OPTIONS.quality);
  document.querySelector("#cooperation-filter").innerHTML = optionList(OPTIONS.quality);

  document.querySelector("#search-input").addEventListener("input", (event) => {
    state.filters.query = event.target.value.trim().toLowerCase();
    renderUsers();
  });

  [
    ["#level-filter", "level"],
    ["#status-filter", "status"],
    ["#type-filter", "type"],
    ["#beta-filter", "beta"],
    ["#content-filter", "content"],
    ["#cooperation-filter", "cooperation"],
  ].forEach(([selector, key]) => {
    document.querySelector(selector).addEventListener("change", (event) => {
      state.filters[key] = event.target.value;
      renderUsers();
    });
  });
}

function setupInfluencerFilters() {
  document.querySelector("#influencer-search-input").addEventListener("input", (event) => {
    state.influencerFilters.query = event.target.value.trim().toLowerCase();
    renderInfluencers();
  });

  [
    ["#influencer-channel-filter", "channel"],
    ["#influencer-status-filter", "status"],
    ["#influencer-product-filter", "product"],
  ].forEach(([selector, key]) => {
    document.querySelector(selector).addEventListener("change", (event) => {
      state.influencerFilters[key] = event.target.value;
      renderInfluencers();
    });
  });
}

function renderSummary() {
  const buckets = state.today;
  const cards = [
    ["2025 Users", state.usersByYear["2025"].length, "summary-total"],
    ["2026 Users", state.usersByYear["2026"].length, "summary-live"],
    ["Update Pending", buckets.updatePending.length, "summary-pending"],
    ["Need Follow-up", buckets.needFollowUp.length, "summary-followup"],
    ["Watchlist", buckets.watchlist.length, "summary-risk"],
  ];
  summaryStrip.innerHTML = cards
    .map(
      ([label, value, className]) =>
        `<div class="summary-card ${className}"><span class="meta">${label}</span><strong>${value}</strong><small>Current operating view</small></div>`,
    )
    .join("");
}

function smallUserCard(user) {
  return `<article class="user-card">
    <button data-key="${escapeHtml(user.key)}">${escapeHtml(user.name || "(No name)")}</button>
    <div class="chip-list">
      ${chip(user.year, "#eaf2f8")}
      ${chip(user.level || "TBD", PALETTES.level[user.level || "TBD"])}
      ${chip(user.status || "No Status", PALETTES.status[user.status])}
    </div>
    <div class="meta">${escapeHtml(user.followUpReason || user.updateInput || user.country || user.ownedProduct || "No reason yet")}</div>
  </article>`;
}

function renderToday() {
  const groups = [
    ["Need Follow-up", state.today.needFollowUp],
    ["Update Input Pending", state.today.updatePending],
    ["High Value Quiet", state.today.highValueQuiet],
    ["Watchlist / Risk", state.today.watchlist],
  ];
  todayGrid.innerHTML = groups
    .map(
      ([title, rows]) => `<section class="status-column">
        <h3>${title}</h3>
        ${rows.slice(0, 12).map(smallUserCard).join("") || '<p class="meta">No users here.</p>'}
      </section>`,
    )
    .join("");
}

function filteredUsers() {
  return state.usersByYear[state.activeYear].filter((user) => {
    if (state.filters.query && !user.searchText.includes(state.filters.query)) return false;
    if (state.filters.level && user.level !== state.filters.level) return false;
    if (state.filters.status && user.status !== state.filters.status) return false;
    if (state.filters.type && !user.types.includes(state.filters.type)) return false;
    if (state.filters.beta && user.betaPotential !== state.filters.beta) return false;
    if (state.filters.content && user.contentQuality !== state.filters.content) return false;
    if (state.filters.cooperation && user.cooperation !== state.filters.cooperation) return false;
    return true;
  });
}

function renderUsers() {
  const rows = filteredUsers();
  usersTitle.textContent = `${state.activeYear} Users`;
  usersCount.textContent = `${rows.length} users`;
  usersBody.innerHTML = rows
    .map(
      (user) => `<tr>
        <td>
          <button class="link-button" data-key="${escapeHtml(user.key)}">${escapeHtml(user.name || "(No name)")}</button>
          <div class="meta">${escapeHtml(user.email)}</div>
        </td>
        <td>${escapeHtml(user.date || user.Date || user.DATE || "")}</td>
        <td>${chip(user.level || "TBD", PALETTES.level[user.level || "TBD"])}</td>
        <td>${chip(user.status || "", PALETTES.status[user.status])}</td>
        <td>${renderChips(user.types, PALETTES.type)}</td>
        <td>${chip(user.betaPotential, PALETTES.beta[user.betaPotential])}</td>
        <td>${chip(user.contentQuality, PALETTES.contentQuality[user.contentQuality])}</td>
        <td>${chip(user.cooperation, PALETTES.cooperation[user.cooperation])}</td>
      </tr>`,
    )
    .join("");
}

function channelColor(channel) {
  return PALETTES.channel?.[channel] || PALETTES.channel?.[channel.replace("INS", "Instagram")] || "#eaf2f8";
}

function productLabel(user) {
  return user.product || user.exchangeProduct || user.ownedProduct || "TBD";
}

function nextAction(user) {
  if (user.followUpReason) return user.followUpReason;
  if (user.notes) return user.notes.split("\n").filter(Boolean).at(-1) || user.notes;
  if (user.status === "In Collaboration") return "Track collaboration progress";
  if (user.status === "Ready to Follow Up") return "Send or continue outreach";
  return user.updateInput || "Review creator fit";
}

function buildInfluencerUpdatePayload(user) {
  return {
    recordType: "influencer",
    sheetName: user.sheetName || "Influencers",
    rowNumber: user.rowNumber,
    fields: {
      Level: document.querySelector("#edit-influencer-level")?.value || user.level || "",
      Status: document.querySelector("#edit-influencer-status")?.value || user.status || "",
      Product: document.querySelector("#edit-influencer-product")?.value || "",
      "Next Action": document.querySelector("#edit-influencer-next-action")?.value || "",
      Notes: document.querySelector("#edit-influencer-notes")?.value || user.notes || "",
      "Next Follow-up Date": document.querySelector("#edit-influencer-next-follow-up")?.value || user.nextFollowUpDate || "",
      "Update Input - Write Here": document.querySelector("#edit-influencer-update-input")?.value || user.updateInput || "",
    },
  };
}

async function saveInfluencerRecord(user) {
  const feedbackTarget = document.querySelector("#influencer-feedback") || detailContent;
  try {
    const result = await applyFields(buildInfluencerUpdatePayload(user), sessionToken());
    feedbackTarget.insertAdjacentHTML(
      "beforeend",
      `<p class="state-message">Saved ${Object.keys(result.fields || {}).length} fields.</p>`,
    );
    await loadUsers();
  } catch (error) {
    feedbackTarget.insertAdjacentHTML(
      "beforeend",
      `<p class="state-message error">${escapeHtml(error instanceof Error ? error.message : "Unable to save influencer.")}</p>`,
    );
  }
}

function renderInfluencerSummary() {
  const rows = state.influencers;
  const channelCount = (name) => rows.filter((row) => row.channels.some((channel) => channel.toLowerCase() === name)).length;
  const cards = [
    ["Total Leads", rows.length, "summary-total"],
    ["Instagram", channelCount("ins") + channelCount("instagram"), "summary-insta"],
    ["TikTok", channelCount("tiktok"), "summary-tiktok"],
    ["YouTube", channelCount("youtube"), "summary-live"],
    ["Active Collab", rows.filter((row) => row.status === "In Collaboration").length, "summary-collab"],
    ["Need Follow-up", rows.filter((row) => row.status === "Ready to Follow Up").length, "summary-followup"],
  ];
  influencerSummary.innerHTML = cards
    .map(
      ([label, value, className]) =>
        `<div class="summary-card ${className}"><span class="meta">${label}</span><strong>${value}</strong><small>Creator pipeline</small></div>`,
    )
    .join("");
}

function setupInfluencerOptions() {
  const channels = uniqueOptions(state.influencers.map((row) => row.channels));
  const statuses = uniqueOptions(state.influencers.map((row) => [row.status]));
  const products = uniqueOptions(state.influencers.map((row) => [productLabel(row)]));
  document.querySelector("#influencer-channel-filter").innerHTML = optionList(channels);
  document.querySelector("#influencer-status-filter").innerHTML = optionList(statuses);
  document.querySelector("#influencer-product-filter").innerHTML = optionList(products);
}

function filteredInfluencers() {
  return state.influencers.filter((user) => {
    const filters = state.influencerFilters;
    if (filters.query && !user.searchText.includes(filters.query)) return false;
    if (filters.channel && !user.channels.includes(filters.channel)) return false;
    if (filters.status && user.status !== filters.status) return false;
    if (filters.product && productLabel(user) !== filters.product) return false;
    return true;
  });
}

function renderInfluencers() {
  const rows = filteredInfluencers();
  influencerCount.textContent = `${rows.length} creators`;
  influencersBody.innerHTML = rows
    .map(
      (user) => `<tr>
        <td>
          <button class="link-button" data-key="${escapeHtml(user.key)}">${escapeHtml(user.name || "(No name)")}</button>
          <div class="meta">${escapeHtml(user.email || user.country || "creator lead")}</div>
        </td>
        <td>${chip(user.level || "TBD", PALETTES.level[user.level || "TBD"])}</td>
        <td>${renderChips(user.channels, PALETTES.channel)}</td>
        <td>${escapeHtml(user.audience || "TBD")}</td>
        <td>${chip(user.status || "", PALETTES.status[user.status])}</td>
      </tr>`,
    )
    .join("");
  if (!rows.length) {
    influencersBody.innerHTML = `<tr><td colspan="5"><p class="detail-empty">No influencers match these filters.</p></td></tr>`;
  }
}

function field(label, value) {
  const cleaned = String(value ?? "").trim();
  if (!cleaned) return "";
  return `<div class="field"><span>${label}</span><p class="field-value">${escapeHtml(cleaned)}</p></div>`;
}

function fieldHtml(label, html) {
  if (!html) return "";
  return `<div class="field"><span>${label}</span><div class="field-value">${html}</div></div>`;
}

function fieldGrid(fields, emptyText = "No information recorded.") {
  const filled = fields.filter(Boolean).join("");
  return filled || `<p class="detail-empty">${emptyText}</p>`;
}

function renderLinkList(links) {
  if (!links?.length) return "";
  return `<div class="link-list">${links
    .map((link) => `<a href="${escapeHtml(link)}" target="_blank" rel="noreferrer">${escapeHtml(link)}</a>`)
    .join("")}</div>`;
}

function renderLinkActions(links) {
  if (!links?.length) return "";
  return `<div class="creator-action-row">${links
    .map((link, index) => `<a href="${escapeHtml(link)}" target="_blank" rel="noreferrer">Open Link ${index + 1}</a>`)
    .join("")}</div>`;
}

function renderInfluencerInlineDetail(user) {
  state.selected = user;
  setDetailHeader(user, "Influencer Detail");
  const canEdit = canEditRecords();
  const visibleOpsFields = fieldGrid([
    canEdit
      ? editableFieldHtml("User Level", `<select id="edit-influencer-level">${editOptionList(OPTIONS.level, user.level || "TBD")}</select>`)
      : fieldHtml("User Level", chip(user.level || "TBD", PALETTES.level[user.level || "TBD"])),
    canEdit
      ? editableFieldHtml("User Status", `<select id="edit-influencer-status">${editOptionList(OPTIONS.status, user.status)}</select>`)
      : fieldHtml("User Status", chip(user.status, PALETTES.status[user.status])),
    canEdit
      ? editableFieldHtml(
          "Product",
          `<input id="edit-influencer-product" value="${escapeHtml(productLabel(user) === "TBD" ? "" : productLabel(user))}" />`,
        )
      : field("Product", productLabel(user)),
    field("Audience", user.audience),
    field("Email", user.email || "No email"),
  ]);
  const visibleNotesFields = fieldGrid(
    [
      canEdit
        ? editableFieldHtml("Next Action", `<input id="edit-influencer-next-action" value="${escapeHtml(nextAction(user))}" />`)
        : field("Next Action", nextAction(user)),
      canEdit
        ? editableFieldHtml(
            "Next Follow-up Date",
            `<input id="edit-influencer-next-follow-up" type="date" value="${escapeHtml(user.nextFollowUpDate)}" />`,
          )
        : field("Next Follow-up Date", user.nextFollowUpDate),
      canEdit
        ? editableFieldHtml("Latest Note / Notes", `<textarea id="edit-influencer-notes">${escapeHtml(user.notes)}</textarea>`)
        : field("Notes", user.notes),
      canEdit
        ? editableFieldHtml("Update Input - Write Here", `<textarea id="edit-influencer-update-input">${escapeHtml(user.updateInput)}</textarea>`)
        : field("Update Input - Write Here", user.updateInput),
    ],
    "No action fields recorded.",
  );
  const moreDetailFields = fieldGrid(
    [
      field("No.", user.no),
      field("Date", user.date),
      field("Profile", user.profile),
      field("Channel", user.channel),
      fieldHtml("ABC Program Potential", chip(user.abcPotential, PALETTES.potential[user.abcPotential])),
      fieldHtml("Beta Tester Potential", chip(user.betaPotential, PALETTES.beta[user.betaPotential])),
      fieldHtml("Content Feedback Quality", chip(user.contentQuality, PALETTES.contentQuality[user.contentQuality])),
      fieldHtml("Cooperation Level", chip(user.cooperation, PALETTES.cooperation[user.cooperation])),
      fieldHtml("User Type", renderChips(user.types, PALETTES.type)),
      field("Self-Owned Product", user.ownedProduct),
      field("Exchange Product", user.exchangeProduct),
      field("Country/Region", user.country),
      field("Address", user.address),
      field("Description", user.description),
      field("Resources", user.resources),
      field("Extra Notes 1", user.extraNotes),
      field("Extended Background", user.extendedBackground),
    ],
    "No extra details recorded.",
  );
  const actionSection = canEdit
    ? `<section class="detail-section detail-save-bar">
        <button class="button primary" id="save-influencer-button" type="button">Save Influencer</button>
        <div id="influencer-feedback"></div>
      </section>`
    : `<section class="detail-section readonly-note">
        <h3>Read-only access</h3>
        <p>Your account can view this creator, but cannot edit or write updates.</p>
      </section>`;
  detailContent.innerHTML = `
    <section class="detail-section creator-compact-hero">
      <div>
        <div class="creator-keyline">
          ${renderChips(user.channels, PALETTES.channel)}
          ${renderChips(user.types, PALETTES.type)}
          ${chip(user.status || "No Status", PALETTES.status[user.status])}
        </div>
        <p class="creator-subline">${escapeHtml([user.audience, productLabel(user), user.email ? "Email on file" : "No email", user.country].filter(Boolean).join(" · "))}</p>
      </div>
      ${renderLinkActions(user.links)}
    </section>
    <section class="detail-section creator-decision-grid">
      <div class="creator-note">
        <span>Latest Note</span>
        <p>${escapeHtml(user.notes || user.description || "No notes recorded yet.")}</p>
      </div>
      <div class="creator-note">
        <span>Next Action</span>
        <p>${escapeHtml(nextAction(user))}</p>
      </div>
    </section>
    <section class="detail-section creator-ops-grid">
      <h3>Collaboration Setup</h3>
      <div class="field-grid compact-field-grid">${visibleOpsFields}</div>
    </section>
    <section class="detail-section creator-ops-grid">
      <h3>Action & Notes</h3>
      <div class="field-stack">${visibleNotesFields}</div>
    </section>
    <details class="creator-detail-group">
      <summary>More Creator Details</summary>
      <div class="field-grid compact-field-grid">${moreDetailFields}</div>
    </details>
    ${actionSection}
  `;
  detailPanel.classList.add("open");
  detailPanel.setAttribute("aria-hidden", "false");
  document.querySelector("#save-influencer-button")?.addEventListener("click", () => saveInfluencerRecord(user));
}

function editableFieldHtml(label, controlHtml) {
  return `<div class="field editable-field"><span>${label}</span>${controlHtml}</div>`;
}

function renderUserTypeMultiSelect(selectedTypes = []) {
  const selected = new Set(selectedTypes);
  return `<div id="edit-user-type-options" class="multi-select-chips">
    ${OPTIONS.type
      .map((type) => {
        const color = PALETTES.type[type] || "#eef3f8";
        return `<label class="multi-select-chip" style="--chip-color:${color};--chip-text:${textColorForBackground(color)}">
          <input type="checkbox" value="${escapeHtml(type)}" ${selected.has(type) ? "checked" : ""} />
          <span>${escapeHtml(type)}</span>
        </label>`;
      })
      .join("")}
  </div>`;
}

function renderDetail(user) {
  state.selected = user;
  setDetailHeader(user, "User Detail");
  const canEdit = canEditRecords();
  const evaluationFields = fieldGrid([
    canEdit
      ? editableFieldHtml("User Level", `<select id="edit-user-level">${editOptionList(OPTIONS.level, user.level || "TBD")}</select>`)
      : fieldHtml("User Level", chip(user.level || "TBD", PALETTES.level[user.level || "TBD"])),
    canEdit
      ? editableFieldHtml("User Status", `<select id="edit-user-status">${editOptionList(OPTIONS.status, user.status)}</select>`)
      : fieldHtml("User Status", chip(user.status, PALETTES.status[user.status])),
    canEdit
      ? editableFieldHtml("User Type", renderUserTypeMultiSelect(user.types))
      : fieldHtml("User Type", renderChips(user.types, PALETTES.type)),
    fieldHtml("ABC Program Potential", chip(user.abcPotential, PALETTES.potential[user.abcPotential])),
    fieldHtml("Beta Tester Potential", chip(user.betaPotential, PALETTES.beta[user.betaPotential])),
    canEdit
      ? editableFieldHtml("Content Feedback Quality", `<select id="edit-content-quality">${editOptionList(OPTIONS.quality, user.contentQuality)}</select>`)
      : fieldHtml("Content Feedback Quality", chip(user.contentQuality, PALETTES.contentQuality[user.contentQuality])),
    canEdit
      ? editableFieldHtml("Cooperation Level", `<select id="edit-cooperation">${editOptionList(OPTIONS.quality, user.cooperation)}</select>`)
      : fieldHtml("Cooperation Level", chip(user.cooperation, PALETTES.cooperation[user.cooperation])),
    fieldHtml("Follow-up Priority", chip(user.followUpPriority, PALETTES.priority[user.followUpPriority])),
  ]);
  const profileFields = fieldGrid([
    field("Email", user.email),
    field("Country/Region", user.country),
    field("Address", user.address),
    field("Self-Owned Product", user.ownedProduct),
    field("Exchange Product", user.exchangeProduct),
    field("Profile", user.profile),
  ]);
  const noteFields = fieldGrid(
    [
      field("Description", user.description),
      field("Resources", user.resources),
      canEdit
        ? editableFieldHtml("Notes", `<textarea id="edit-notes">${escapeHtml(user.notes)}</textarea>`)
        : field("Notes", user.notes),
      field("Extra Notes", user.extraNotes),
      field("Extended Background", user.extendedBackground),
      canEdit
        ? editableFieldHtml("Update Input - Write Here", `<textarea id="update-input" class="update-input">${escapeHtml(user.updateInput)}</textarea>`)
        : field("Update Input - Write Here", user.updateInput),
    ],
    "No notes recorded.",
  );
  const followUpFields = fieldGrid(
    [
      field("Last Contact Date", user.lastContactDate),
      canEdit
        ? editableFieldHtml("Next Follow-up Date", `<input id="edit-next-follow-up" type="date" value="${escapeHtml(user.nextFollowUpDate)}" />`)
        : field("Next Follow-up Date", user.nextFollowUpDate),
      canEdit
        ? editableFieldHtml("Follow-up Reason", `<input id="edit-follow-up-reason" value="${escapeHtml(user.followUpReason)}" />`)
        : field("Follow-up Reason", user.followUpReason),
      field("AI Suggestion Status", user.aiSuggestionStatus),
      field("Last Parsed At", user.lastParsedAt),
    ],
    "No follow-up fields recorded.",
  );
  const actionSection = canEdit
    ? `<section class="detail-section detail-save-bar">
      <div class="actions">
        <button class="button primary" id="save-record-button">Save Record</button>
      </div>
      <div id="suggestion-output"></div>
    </section>`
    : `<section class="detail-section readonly-note">
      <h3>Read-only access</h3>
      <p>Your account can view this record, but cannot edit or write updates.</p>
    </section>`;
  detailContent.innerHTML = `
    <section class="detail-section detail-overview">
      <div class="detail-overview-top">
        <div>
          <p class="eyebrow">Current Snapshot</p>
          <h3>${escapeHtml(user.year || state.activeYear)} KOC Profile</h3>
        </div>
        ${chip(user.status || "No Status", PALETTES.status[user.status])}
      </div>
      <div class="detail-chip-row">
        ${chip(user.level || "TBD", PALETTES.level[user.level || "TBD"])}
        ${renderChips(user.types, PALETTES.type)}
      </div>
      <p class="detail-summary">${escapeHtml(user.followUpReason || user.updateInput || user.description || user.notes || "No summary recorded yet.")}</p>
    </section>
    <section class="detail-section">
      <h3>Evaluation</h3>
      <div class="field-grid">
        ${evaluationFields}
      </div>
    </section>
    <section class="detail-section">
      <h3>Profile</h3>
      <div class="field-grid">
        ${profileFields}
      </div>
    </section>
    <section class="detail-section">
      <h3>Notes</h3>
      <div class="field-stack">
        ${noteFields}
      </div>
    </section>
    <section class="detail-section">
      <h3>Follow-up</h3>
      <div class="field-grid">
        ${followUpFields}
      </div>
    </section>
    ${actionSection}
  `;
  detailPanel.classList.add("open");
  detailPanel.setAttribute("aria-hidden", "false");
  if (canEdit) {
    document.querySelector("#save-record-button").addEventListener("click", saveSelectedRecord);
  }
}

function selectedKocSheetName(user) {
  return user.sheetName || (user.year === "2025" ? "2025 KOC" : "2026 KOC");
}

function buildKocUpdatePayload(user) {
  const selectedTypes = Array.from(document.querySelectorAll("#edit-user-type-options input:checked"))
    .map((input) => input.value)
    .join(", ");

  return {
    recordType: "koc",
    sheetName: selectedKocSheetName(user),
    rowNumber: user.rowNumber,
    fields: {
      "Update Input - Write Here": document.querySelector("#update-input")?.value || "",
      "User Level (S/A/B/C/TBD)": document.querySelector("#edit-user-level")?.value || user.level || "TBD",
      "User Status": document.querySelector("#edit-user-status")?.value || user.status || "",
      "User Type": selectedTypes,
      "Content Feedback Quality": document.querySelector("#edit-content-quality")?.value || user.contentQuality || "",
      "Cooperation Level": document.querySelector("#edit-cooperation")?.value || user.cooperation || "",
      "Next Follow-up Date": document.querySelector("#edit-next-follow-up")?.value || user.nextFollowUpDate || "",
      "Follow-up Reason": document.querySelector("#edit-follow-up-reason")?.value || user.followUpReason || "",
      Notes: document.querySelector("#edit-notes")?.value || user.notes || "",
    },
  };
}

function suggestionOutput() {
  return document.querySelector("#suggestion-output");
}

async function saveSelectedRecord() {
  try {
    const result = await applyFields(buildKocUpdatePayload(state.selected), sessionToken());
    suggestionOutput().insertAdjacentHTML(
      "beforeend",
      `<p class="state-message">Saved ${Object.keys(result.fields || {}).length} fields.</p>`,
    );
    await loadUsers();
  } catch (error) {
    suggestionOutput().insertAdjacentHTML(
      "beforeend",
      `<p class="state-message error">${escapeHtml(error instanceof Error ? error.message : "Unable to save record.")}</p>`,
    );
  }
}

function renderRules() {
  const groups = [
    ["User Level", PALETTES.level],
    ["User Status", PALETTES.status],
    ["User Type", PALETTES.type],
    ["Content Feedback Quality", PALETTES.contentQuality],
    ["Cooperation Level", PALETTES.cooperation],
    ["Follow-up Priority", PALETTES.priority],
  ];
  document.querySelector("#rules-grid").innerHTML = groups
    .map(
      ([title, palette]) => `<section class="rules-card">
        <h3>${title}</h3>
        <div class="chip-list">${Object.entries(palette)
          .map(([label, color]) => chip(label, color))
          .join("")}</div>
      </section>`,
    )
    .join("");
  if (!canManageRulesUi()) {
    document.querySelector("#rules-grid").insertAdjacentHTML(
      "beforeend",
      `<section class="rules-card readonly-note">
        <h3>Rule management</h3>
        <p>Your account can view rules, but only Admin can change dropdowns, colors, and account settings.</p>
      </section>`,
    );
  }
}

function rowsFromSheetValues(sheetPayload, year) {
  const values = sheetPayload?.values || [];
  const headerRowIndex = values.findIndex((row) => row.includes("Name"));
  if (headerRowIndex === -1) return [];

  const headers = values[headerRowIndex];
  return values
    .slice(headerRowIndex + 1)
    .map((cells, index) => {
      const raw = Object.fromEntries(headers.map((header, cellIndex) => [header, cells[cellIndex] ?? ""]));
      return {
        ...normalizeKocRow(raw, index + headerRowIndex + 2),
        sheetName: sheetPayload.sheetName,
        year,
        key: `${year}-${index + headerRowIndex + 2}`,
      };
    })
    .filter((row) => Object.values(row.raw).some((value) => String(value ?? "").trim()));
}

function normalizeAppsScriptDashboard(data) {
  if (!data?.usersByYear) return data;

  const users2025 = rowsFromSheetValues(data.usersByYear["2025"], "2025");
  const users2026 = rowsFromSheetValues(data.usersByYear["2026"], "2026");
  const influencers = rowsFromSheetValues(data.influencers, "Influencers").map((user) => ({
    ...user,
    key: `influencers-${user.rowNumber}`,
  }));
  const users = [...users2025, ...users2026];

  return {
    usersByYear: {
      2025: users2025,
      2026: users2026,
    },
    influencers,
    users,
    today: buildTodayBuckets(users),
    source: {
      mode: "google_apps_script_static",
      updatedAt: data.updatedAt,
    },
  };
}

function setupTabs() {
  document.querySelectorAll(".tab").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((tab) => tab.classList.remove("active"));
      document.querySelectorAll(".view").forEach((view) => view.classList.remove("active"));
      button.classList.add("active");
      if (button.dataset.year) {
        state.activeYear = button.dataset.year;
        renderUsers();
      }
      document.querySelector(`#${button.dataset.view}-view`).classList.add("active");
    });
  });
}

function setupClicks() {
  document.body.addEventListener("click", (event) => {
    const button = event.target.closest("[data-key]");
    if (!button) return;
    const user = state.users.find((item) => item.key === button.dataset.key);
    if (user) {
      renderDetail(user);
      return;
    }
    const influencer = state.influencers.find((item) => item.key === button.dataset.key);
    if (influencer) renderInfluencerInlineDetail(influencer);
  });
  document.querySelector("#close-detail").addEventListener("click", () => {
    detailPanel.classList.remove("open");
    detailPanel.setAttribute("aria-hidden", "true");
  });
}

function setupLogin() {
  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    loginMessage.textContent = "";

    try {
      const result = await login(usernameInput.value, passwordInput.value);

      if (!result.token) {
        loginMessage.textContent = result.message || "Unable to sign in.";
        return;
      }

      setSession(
        result.token,
        result.account || {
          username: usernameInput.value || "local",
          displayName: usernameInput.value || "Local",
          role: "Admin",
        },
      );
      usernameInput.value = "";
      passwordInput.value = "";
      showApp();
      await loadUsers();
    } catch (error) {
      loginMessage.textContent = error instanceof Error ? error.message : "Unable to sign in.";
    }
  });
}

async function loadUsers() {
  try {
    const raw = await loadDashboard(sessionToken());
    const data = raw.data ? normalizeAppsScriptDashboard(raw.data) : raw;
    state.users = data.users.filter((user) => user.name || user.email || user.ownedProduct || user.updateInput);
    state.usersByYear = {
      2025: (data.usersByYear?.["2025"] || []).filter((user) => user.name || user.email || user.ownedProduct || user.updateInput),
      2026: (data.usersByYear?.["2026"] || []).filter((user) => user.name || user.email || user.ownedProduct || user.updateInput),
    };
    state.influencers = (data.influencers || []).filter((user) => user.name || user.email || user.resources || user.updateInput);
    state.today = data.today;
    if (data.source?.warning) {
      setMessage(
        `Loaded ${state.users.length} KOC users and ${state.influencers.length} influencers. ${data.source.warning}`,
        "warning",
      );
    } else if (data.source?.mode === "google_apps_script_2026") {
      hideMessage();
    } else {
      hideMessage();
    }
    renderSummary();
    renderToday();
    renderUsers();
    setupInfluencerOptions();
    renderInfluencerSummary();
    renderInfluencers();
    renderRules();
  } catch (error) {
    if (isAuthenticationError(error)) {
      clearSession();
      showLogin("Please enter the team password.");
      return;
    }
    setMessage(error instanceof Error ? error.message : "Unable to load Google Sheet data.", "error");
  }
}

setupLogin();
setupTabs();
setupFilters();
setupInfluencerFilters();
setupClicks();
logoutButton.addEventListener("click", () => {
  clearSession();
  showLogin("Signed out.");
});

if (sessionToken()) {
  showApp();
  loadUsers();
} else {
  showLogin();
}
