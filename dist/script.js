let deckData = {};
let siteData = {};
let currentBinderRows = [];
let banlistStatusById = new Map();
let deckStatsData = { byYdk: {}, playerStats: {} };

const deckSearch = document.getElementById("deckSearch");
const deckSelector = document.getElementById("deckSelector");
const deckDisplay = document.getElementById("deckDisplay");
const deckResultsLabel = document.getElementById("deckResultsLabel");
const deckPlayerStatsSection = document.getElementById("deckPlayerStatsSection");
const deckPlayerStatsGrid = document.getElementById("deckPlayerStatsGrid");

const binderPlayer = document.getElementById("binderPlayer");
const binderSearch = document.getElementById("binderSearch");
const binderGrid = document.getElementById("binderGrid");
const binderStatus = document.getElementById("binderStatus");

const filterType = document.getElementById("filterType");
const filterAttribute = document.getElementById("filterAttribute");
const filterRace = document.getElementById("filterRace");
const filterSubtypes = document.getElementById("filterSubtypes");

const filterAtkExact = document.getElementById("filterAtkExact");
const filterAtkMin = document.getElementById("filterAtkMin");
const filterAtkMax = document.getElementById("filterAtkMax");

const filterDefMin = document.getElementById("filterDefMin");

const filterLevelMin = document.getElementById("filterLevelMin");
const binderSort = document.getElementById("binderSort");
const binderSortDirectionButton = document.getElementById("binderSortDirection");
let binderSortDirection = "asc";

const modal = document.getElementById("imageModal");
const modalImage = document.getElementById("modalImage");
const modalBanlistBadge = document.getElementById("modalBanlistBadge");
const modalBanlistIcon = document.getElementById("modalBanlistIcon");
const modalTitle = document.getElementById("modalTitle");
const closeModalButton = document.getElementById("closeModal");

const filterSpellType = document.getElementById("filterSpellType");
const filterTrapType = document.getElementById("filterTrapType");

const filterDefExact = document.getElementById("filterDefExact");
const filterDefMax = document.getElementById("filterDefMax");

const filterLevelExact = document.getElementById("filterLevelExact");
const filterLevelMax = document.getElementById("filterLevelMax");

const filterRankExact = document.getElementById("filterRankExact");
const filterRankMin = document.getElementById("filterRankMin");
const filterRankMax = document.getElementById("filterRankMax");

const filterLinkExact = document.getElementById("filterLinkExact");
const filterLinkMin = document.getElementById("filterLinkMin");
const filterLinkMax = document.getElementById("filterLinkMax");

const filterScaleExact = document.getElementById("filterScaleExact");
const filterScaleMin = document.getElementById("filterScaleMin");
const filterScaleMax = document.getElementById("filterScaleMax");
const filterLinkArrows = document.getElementById("filterLinkArrows");

const binderFiltersPanel = document.getElementById("binderFiltersPanel");
const toggleFiltersButton = document.getElementById("toggleFiltersButton");
let binderFiltersCollapsed = true;

let activeBanlistFile = "Pharaoh's Servant.conf";

const BANLISTS_BASE_PATH = "data/Banlists";
const BANLIST_MANIFEST_PATH = `${BANLISTS_BASE_PATH}/banlists.json`;
const FALLBACK_BANLIST_FILE = "Pharaoh's Servant.conf";
const binderBanlist = document.getElementById("binderBanlist");

function safeText(value) {
  return value ? String(value).trim() : "";
}

function normalizeAssetPath(value) {
  return safeText(value)
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/^\/+/, "");
}

function formatDeckCount(value) {
  return `${value} deck${value === 1 ? "" : "s"}`;
}

function getDeckStatsForDeck(deck) {
  const ydkPath = normalizeAssetPath(deck?.ydk);
  if (!ydkPath) return null;

  const entry = deckStatsData?.byYdk?.[ydkPath] || null;
  return entry && !entry.missing ? entry : null;
}

function getDeckPlayersInOrder() {
  const seen = new Set();
  const players = [];

  Object.values(deckData).forEach((week) => {
    (week?.decks || []).forEach((deck) => {
      const player = safeText(deck.player);
      const key = player.toLowerCase();

      if (!player || seen.has(key)) return;

      seen.add(key);
      players.push(player);
    });
  });

  return players;
}

function buildArchetypeHref(name) {
  return `archetype.html?name=${encodeURIComponent(safeText(name))}`;
}

function renderArchetypeChip(item, type = "default") {
  const name = safeText(item.name) || "Unknown";
  const suffix = type === "player"
    ? `<b>${item.decks}</b>`
    : `· ${item.copies}`;

  return `
    <a
      class="deck-chip deck-chip-link${type === "current" ? " deck-chip-current" : ""}"
      href="${buildArchetypeHref(name)}"
      title="Open ${name} archive"
    >
      ${name} ${suffix}
    </a>
  `;
}

function renderDeckChipRow(items, type = "default") {
  if (!Array.isArray(items) || !items.length) {
    return `<span class="deck-chip deck-chip-muted">No archetype data</span>`;
  }

  return items.map((item) => renderArchetypeChip(item, type)).join("");
}

function toNumber(value) {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

function normalizeCardId(value) {
  const raw = safeText(value);
  if (!raw) return "";

  const digitsOnly = raw.replace(/\D+/g, "");
  if (!digitsOnly) return "";

  return String(Number(digitsOnly));
}

function formatBanlistLabel(fileName) {
  return safeText(fileName).replace(/\.conf$/i, "");
}

function setBanlistOptions(files, defaultFile) {
  const normalizedFiles = Array.from(
    new Set(
      (files || [])
        .map((file) => safeText(file))
        .filter((file) => file && /\.conf$/i.test(file))
    )
  ).sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" })
  );

  if (!normalizedFiles.length) {
    normalizedFiles.push(FALLBACK_BANLIST_FILE);
  }

  const selectedFile = normalizedFiles.includes(defaultFile)
    ? defaultFile
    : normalizedFiles.includes(FALLBACK_BANLIST_FILE)
      ? FALLBACK_BANLIST_FILE
      : normalizedFiles[0];

  binderBanlist.innerHTML = "";

  normalizedFiles.forEach((fileName) => {
    const option = document.createElement("option");
    option.value = fileName;
    option.textContent = formatBanlistLabel(fileName);
    binderBanlist.appendChild(option);
  });

  binderBanlist.value = selectedFile;
  activeBanlistFile = selectedFile;
}

async function loadBanlistManifest() {
  try {
    const res = await fetch(BANLIST_MANIFEST_PATH, { cache: "no-store" });
    if (!res.ok) throw new Error("Failed to load banlist manifest");

    const manifest = await res.json();
    const files = Array.isArray(manifest.files) ? manifest.files : [];
    const defaultFile = safeText(manifest.default) || FALLBACK_BANLIST_FILE;

    setBanlistOptions(files, defaultFile);
  } catch {
    setBanlistOptions([FALLBACK_BANLIST_FILE], FALLBACK_BANLIST_FILE);
  }
}

function parseBanlistConfig(content) {
  const map = new Map();
  const lines = String(content || "").split(/\r?\n/);

  let currentSection = "";

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith("#")) {
      currentSection = line.slice(1).trim().toLowerCase();
      continue;
    }

    if (
      line.startsWith("!") ||
      line.startsWith("--") ||
      line.startsWith("$")
    ) {
      continue;
    }

    const match = line.match(/^(\d+)\s+(\d+)\b/);
    if (!match) continue;

    const cardId = normalizeCardId(match[1]);
    const count = Number(match[2]);

    if (!cardId || !Number.isFinite(count)) continue;

    let status = null;

    if (currentSection === "forbidden" || count === 0) {
      status = 0;
    } else if (currentSection === "limited" || count === 1) {
      status = 1;
    } else if (
      currentSection === "semi-limited" ||
      currentSection === "semilimited" ||
      count === 2
    ) {
      status = 2;
    } else {
      status = null;
    }

    if (status !== null) {
      map.set(cardId, status);
    }
  }

  return map;
}

async function loadBanlistData(fileName = binderBanlist.value || activeBanlistFile || FALLBACK_BANLIST_FILE) {
  const selectedFile = safeText(fileName) || FALLBACK_BANLIST_FILE;
  activeBanlistFile = selectedFile;

  try {
    const res = await fetch(
      `${BANLISTS_BASE_PATH}/${encodeURIComponent(selectedFile)}`,
      { cache: "no-store" }
    );

    if (!res.ok) throw new Error("Failed to load banlist");

    const text = await res.text();
    banlistStatusById = parseBanlistConfig(text);
  } catch {
    banlistStatusById = new Map();
  }
}

function getBanlistStatusForRow(row) {
  const possibleIds = [
    row.cardid,
    row.cardId,
    row.id,
    row.passcode
  ];

  for (const value of possibleIds) {
    const normalized = normalizeCardId(value);
    if (normalized && banlistStatusById.has(normalized)) {
      return banlistStatusById.get(normalized);
    }
  }

  return null;
}

function getBanlistIconForRow(row) {
  const status = getBanlistStatusForRow(row);

  if (status === 0) return "images/banlist/banned.png";
  if (status === 1) return "images/banlist/limited1.png";
  if (status === 2) return "images/banlist/limited2.png";

  return "";
}

function getBanlistLabelForRow(row) {
  const status = getBanlistStatusForRow(row);

  if (status === 0) return "Forbidden";
  if (status === 1) return "Limited";
  if (status === 2) return "Semi-Limited";

  return "";
}

function parseMultiSearchTerms(value) {
  return safeText(value)
    .toLowerCase()
    .split("|")
    .map((term) => term.trim())
    .filter(Boolean);
}

function openModal(src, title, options = {}) {
  const { banlistIcon = "", banlistLabel = "" } = options;

  modalImage.src = src;
  modalImage.alt = title;
  modalTitle.textContent = title;

  if (banlistIcon) {
    modalBanlistIcon.src = banlistIcon;
    modalBanlistIcon.alt = banlistLabel ? `${banlistLabel} status` : "Banlist status";
    modalBanlistBadge.hidden = false;
  } else {
    modalBanlistIcon.src = "";
    modalBanlistIcon.alt = "";
    modalBanlistBadge.hidden = true;
  }

  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
}

function closeModal() {
  modal.classList.remove("is-open");
  modal.setAttribute("aria-hidden", "true");
  modalImage.src = "";
  modalImage.alt = "";
  modalBanlistIcon.src = "";
  modalBanlistIcon.alt = "";
  modalBanlistBadge.hidden = true;
  document.body.classList.remove("modal-open");
}

closeModalButton.addEventListener("click", closeModal);

modal.addEventListener("click", (event) => {
  if (event.target.dataset.close === "true") closeModal();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && modal.classList.contains("is-open")) closeModal();
});

async function loadSiteData() {
  const res = await fetch("data/site.json");
  siteData = await res.json();
  renderHero();
  renderSnapshot();
  renderResults();
}

function renderHero() {
  const heroTitle = document.getElementById("heroTitle");
  const heroDescription = document.getElementById("heroDescription");

  if (heroTitle && siteData.hero?.title) heroTitle.textContent = siteData.hero.title;
  if (heroDescription && siteData.hero?.description) heroDescription.textContent = siteData.hero.description;
}

function renderSnapshot() {
  const snapshotGrid = document.getElementById("snapshotGrid");
  if (!snapshotGrid || !Array.isArray(siteData.snapshot)) return;

  snapshotGrid.innerHTML = "";

  siteData.snapshot.forEach((item) => {
    const card = document.createElement("div");
    card.className = "mini-card";
    card.innerHTML = `
      <span>${item.label}</span>
      <strong>${item.value}</strong>
    `;
    snapshotGrid.appendChild(card);
  });
}

function renderResults() {
  const resultsContainer = document.getElementById("resultsContainer");
  if (!resultsContainer || !Array.isArray(siteData.weeks)) return;

  resultsContainer.innerHTML = "";

  siteData.weeks.forEach((week) => {
    const article = document.createElement("article");
    article.className = "card week-card";

    article.innerHTML = `
      <div class="week-card-header">
        <div>
          <h4>${week.week}</h4>
          <p>${week.date} • ${week.format}</p>
          ${week.note ? `<p>${week.note}</p>` : ""}
        </div>
        <div class="winner-badge">Winner: ${week.winner}</div>
      </div>
      <div class="week-card-body">
        <div class="info-panel">
          <p class="section-label">Meta Overview</p>
          <h5>${week.metaTitle}</h5>
          <p>${week.metaDescription}</p>
          <div class="rewatch-box">
            <a class="rewatch-link" href="${week.rewatchUrl}" target="_blank" rel="noopener noreferrer">
              ${week.rewatchLabel}
            </a>
          </div>
        </div>
        <div class="info-panel">
          <div class="standings-header">
            <p class="section-label">Standings</p>
            <span>Record</span>
          </div>
          ${week.standings.map((row) => `
            <div class="standing-row">
              <span class="player-cell">
                <b>${row.rank}</b>
                <img class="avatar" src="${row.avatar}" alt="${row.player} profile picture">
                <span>${row.player}</span>
              </span>
              <span>${row.record}</span>
            </div>
          `).join("")}
        </div>
      </div>
    `;

    resultsContainer.appendChild(article);
  });
}

async function loadDeckData() {
  const decksResponse = await fetch("data/decks.json");
  deckData = await decksResponse.json();

  try {
    const statsResponse = await fetch("data/generated/deck-stats.json", {
      cache: "no-store"
    });

    if (!statsResponse.ok) throw new Error("Failed to load deck stats");

    deckStatsData = await statsResponse.json();
  } catch {
    deckStatsData = { byYdk: {}, playerStats: {} };
  }

  deckSelector.innerHTML = Object.entries(deckData)
    .map(([key, week]) => `<option value="${key}">${week.label}</option>`)
    .join("");

  const defaultWeekKey =
    Object.keys(deckData).find((key) => key.toLowerCase() === "week3") ||
    Object.keys(deckData).find((key) => safeText(deckData[key]?.label).toLowerCase().includes("week 3")) ||
    Object.keys(deckData)[0];

  if (defaultWeekKey) renderDecks(defaultWeekKey);
}

function renderDeckPlayerStats(selectedWeekKey) {
  if (!deckPlayerStatsSection || !deckPlayerStatsGrid) return;

  const players = getDeckPlayersInOrder();

  if (!players.length) {
    deckPlayerStatsSection.hidden = true;
    deckPlayerStatsGrid.innerHTML = "";
    return;
  }

  const selectedWeek = deckData[selectedWeekKey] || null;
  deckPlayerStatsSection.hidden = false;
  deckPlayerStatsGrid.innerHTML = "";

  players.forEach((player) => {
    const playerKey = safeText(player).toLowerCase();
    const playerStats = deckStatsData?.playerStats?.[playerKey] || null;

    const currentDeck = selectedWeek?.decks?.find(
      (deck) => safeText(deck.player).toLowerCase() === playerKey
    );

    const currentDeckStats = currentDeck ? getDeckStatsForDeck(currentDeck) : null;

    const article = document.createElement("article");
    article.className = "deck-player-stat-card";

    article.innerHTML = `
      <div class="deck-player-stat-head">
        <span class="deck-gallery-player">${safeText(player)}</span>
        <span class="deck-player-stat-count">${formatDeckCount(playerStats?.trackedDeckCount || 0)}</span>
      </div>

      <div class="deck-player-stat-section">
        <span class="deck-player-stat-label">Most played archetypes</span>
        <div class="deck-chip-row">
          ${renderDeckChipRow((playerStats?.topArchetypes || []).slice(0, 4), "player")}
        </div>
      </div>

      <div class="deck-player-stat-section">
        <span class="deck-player-stat-label">${safeText(selectedWeek?.label) || "Selected week"}</span>
        <div class="deck-chip-row">
          ${renderDeckChipRow((currentDeckStats?.topArchetypes || []).slice(0, 3), "current")}
        </div>
      </div>
    `;

    deckPlayerStatsGrid.appendChild(article);
  });
}

function renderDecks(weekKey) {
  const week = deckData[weekKey];
  if (!week) return;

  const trackedDecks = week.decks.filter((deck) => !!getDeckStatsForDeck(deck)).length;

  deckResultsLabel.textContent =
    ``;

  deckDisplay.innerHTML = "";
  renderDeckPlayerStats(weekKey);

  week.decks.forEach((deck) => {
    const deckStats = getDeckStatsForDeck(deck);
    const card = document.createElement("article");
    card.className = "deck-gallery-card";

    const ydkPath = normalizeAssetPath(deck.ydk);

    card.innerHTML = `
      <button class="deck-gallery-preview" type="button" aria-label="Open ${safeText(deck.title)} image">
        <div class="deck-gallery-image-wrap">
          <img src="${deck.image}" alt="${deck.title}" class="deck-gallery-image" />
        </div>
      </button>

      <div class="deck-gallery-meta">
        <div class="deck-gallery-copy">
          <span class="deck-gallery-player">${safeText(deck.player)}</span>
          <span class="deck-gallery-title">${safeText(deck.title)}</span>
        </div>

        <div class="deck-chip-row">
          ${renderDeckChipRow((deckStats?.topArchetypes || []).slice(0, 3))}
        </div>
      </div>

      ${ydkPath ? `
        <div class="deck-gallery-footer">
          <a href="${ydkPath}" class="deck-action-button deck-download-button" download>Download .ydk</a>
        </div>
      ` : ""}
    `;

    const previewButton = card.querySelector(".deck-gallery-preview");
    previewButton?.addEventListener("click", () => {
      openModal(deck.image, deck.title);
    });

    deckDisplay.appendChild(card);
  });

  deckSelector.value = weekKey;
}

function findWeekBySearch(query) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return deckSelector.value;

  for (const [key, value] of Object.entries(deckData)) {
    if (
      value.label.toLowerCase().includes(normalized) ||
      value.searchTerms.some((term) => term.includes(normalized))
    ) {
      return key;
    }
  }

  return null;
}

deckSelector.addEventListener("change", () => {
  renderDecks(deckSelector.value);
});

deckSearch.addEventListener("input", () => {
  const result = findWeekBySearch(deckSearch.value);
  if (result) renderDecks(result);
});

function getHighLevelType(row) {
  const type = safeText(row.type).toLowerCase();
  if (type.includes("monster")) return "Monster";
  if (type.includes("spell")) return "Spell";
  if (type.includes("trap")) return "Trap";
  return "";
}

function getCardImage(row) {
  if (safeText(row.image)) return safeText(row.image);
  if (safeText(row.cardid)) return `images/cards/${safeText(row.cardid)}.jpg`;
  return "";
}

function getSelectedSubtypeValues() {
  return Array.from(
    document.querySelectorAll('#filterSubtypes input[type="checkbox"]:checked')
  ).map((input) => input.value);
}

function getSelectedLinkArrowValues() {
  return Array.from(
    document.querySelectorAll('#filterLinkArrows input[type="checkbox"]:checked')
  ).map((input) => input.value);
}

function normalizeLinkArrow(value) {
  const normalized = safeText(value)
    .toLowerCase()
    .replace(/[_\s]+/g, "-");

  switch (normalized) {
    case "top-left":
    case "up-left":
    case "upleft":
      return "Top-Left";

    case "top":
    case "up":
      return "Top";

    case "top-right":
    case "up-right":
    case "upright":
      return "Top-Right";

    case "left":
      return "Left";

    case "right":
      return "Right";

    case "bottom-left":
    case "down-left":
    case "downleft":
      return "Bottom-Left";

    case "bottom":
    case "down":
      return "Bottom";

    case "bottom-right":
    case "down-right":
    case "downright":
      return "Bottom-Right";

    default:
      return "";
  }
}

function getRowLinkArrows(row) {
  const raw =
    row.linkmarkers ??
    row.linkMarkers ??
    row.link_arrows ??
    row.linkArrows ??
    [];

  if (Array.isArray(raw)) {
    return raw.map(normalizeLinkArrow).filter(Boolean);
  }

  if (typeof raw === "string") {
    return raw
      .split(/[,|/]+/)
      .map((part) => normalizeLinkArrow(part))
      .filter(Boolean);
  }

  return [];
}

function isMonsterFilterMode() {
  const selectedType = safeText(filterType.value);
  return selectedType === "" || selectedType === "Monster";
}

function isSpellFilterMode() {
  const selectedType = safeText(filterType.value);
  return selectedType === "" || selectedType === "Spell";
}

function isTrapFilterMode() {
  const selectedType = safeText(filterType.value);
  return selectedType === "" || selectedType === "Trap";
}

function isXyzMonster(row) {
  return safeText(row.type).toLowerCase().includes("xyz");
}

function isLinkMonster(row) {
  return safeText(row.type).toLowerCase().includes("link");
}

function syncFilterVisibility() {
  const showMonsterRows = isMonsterFilterMode();
  const showSpellRow = isSpellFilterMode();
  const showTrapRow = isTrapFilterMode();

  document.querySelectorAll(".monster-filter-row").forEach((row) => {
    row.classList.toggle("is-hidden", !showMonsterRows);
  });

  document.querySelectorAll(".spell-filter-row").forEach((row) => {
    row.classList.toggle("is-hidden", !showSpellRow);
  });

  document.querySelectorAll(".trap-filter-row").forEach((row) => {
    row.classList.toggle("is-hidden", !showTrapRow);
  });

  if (!showMonsterRows) {
    filterAttribute.value = "";
    filterRace.value = "";

    document.querySelectorAll('#filterSubtypes input[type="checkbox"]').forEach((input) => {
      input.checked = false;
    });
    filterSubtypes.classList.add("is-disabled");

    filterAtkExact.value = "";
    filterAtkMin.value = "";
    filterAtkMax.value = "";

    filterDefExact.value = "";
    filterDefMin.value = "";
    filterDefMax.value = "";

    filterLevelExact.value = "";
    filterLevelMin.value = "";
    filterLevelMax.value = "";

    filterRankExact.value = "";
    filterRankMin.value = "";
    filterRankMax.value = "";

    filterLinkExact.value = "";
    filterLinkMin.value = "";
    filterLinkMax.value = "";

    filterScaleExact.value = "";
    filterScaleMin.value = "";
    filterScaleMax.value = "";

    document.querySelectorAll('#filterLinkArrows input[type="checkbox"]').forEach((input) => {
      input.checked = false;
    });
    filterLinkArrows.classList.add("is-disabled");
  } else {
    filterSubtypes.classList.remove("is-disabled");
    filterLinkArrows.classList.remove("is-disabled");
  }

  if (!showSpellRow) {
    filterSpellType.value = "";
  }

  if (!showTrapRow) {
    filterTrapType.value = "";
  }
}

function isXyzMonster(row) {
  return safeText(row.type).toLowerCase().includes("xyz");
}

function getSortValue(row, sortKey) {
  switch (sortKey) {
    case "name":
      return safeText(row.name).toLowerCase();

    case "level":
      return isXyzMonster(row) ? null : toNumber(row.level);

    case "rank":
      return isXyzMonster(row) ? toNumber(row.level) : null;

    case "link":
      return toNumber(row.linkval ?? row.linkVal);

    case "scale":
      return toNumber(row.scale);

    case "atk":
      return toNumber(row.atk);

    case "def":
      return toNumber(row.def);

    default:
      return safeText(row.name).toLowerCase();
  }
}

function compareSortValues(aValue, bValue, direction) {
  const aMissing = aValue === null || aValue === undefined || aValue === "";
  const bMissing = bValue === null || bValue === undefined || bValue === "";

  if (aMissing && bMissing) return 0;
  if (aMissing) return 1;
  if (bMissing) return -1;

  if (typeof aValue === "string" || typeof bValue === "string") {
    const result = String(aValue).localeCompare(String(bValue), undefined, { sensitivity: "base" });
    return direction === "asc" ? result : -result;
  }

  const result = aValue - bValue;
  return direction === "asc" ? result : -result;
}

function updateFiltersToggleButton() {
  const expanded = !binderFiltersCollapsed;

  toggleFiltersButton.textContent = expanded ? "Hide filters" : "Show filters";
  toggleFiltersButton.title = expanded ? "Hide filters" : "Show filters";
  toggleFiltersButton.setAttribute("aria-expanded", String(expanded));
}

function setBinderFiltersCollapsed(collapsed) {
  binderFiltersCollapsed = collapsed;
  binderFiltersPanel.classList.toggle("is-collapsed", collapsed);
  updateFiltersToggleButton();
}

function updateSortDirectionButton() {
  const ascending = binderSortDirection === "asc";
  binderSortDirectionButton.textContent = ascending ? "↑" : "↓";
  binderSortDirectionButton.title = ascending ? "Ascending" : "Descending";
  binderSortDirectionButton.setAttribute("aria-label", ascending ? "Sorting ascending" : "Sorting descending");
}

function applyBinderFilters(rows) {
  const searchTerms = parseMultiSearchTerms(binderSearch.value);
  const selectedType = safeText(filterType.value);
  const selectedAttribute = safeText(filterAttribute.value).toUpperCase();
  const selectedRace = safeText(filterRace.value);
  const selectedSpellType = safeText(filterSpellType.value);
  const selectedTrapType = safeText(filterTrapType.value);
  const selectedSubtypes = getSelectedSubtypeValues();

  const atkExact = toNumber(filterAtkExact.value);
  const minAtk = toNumber(filterAtkMin.value);
  const maxAtk = toNumber(filterAtkMax.value);

  const defExact = toNumber(filterDefExact.value);
  const minDef = toNumber(filterDefMin.value);
  const maxDef = toNumber(filterDefMax.value);

  const levelExact = toNumber(filterLevelExact.value);
  const minLevel = toNumber(filterLevelMin.value);
  const maxLevel = toNumber(filterLevelMax.value);

  const rankExact = toNumber(filterRankExact.value);
  const minRank = toNumber(filterRankMin.value);
  const maxRank = toNumber(filterRankMax.value);

  const linkExact = toNumber(filterLinkExact.value);
  const minLink = toNumber(filterLinkMin.value);
  const maxLink = toNumber(filterLinkMax.value);

  const scaleExact = toNumber(filterScaleExact.value);
  const minScale = toNumber(filterScaleMin.value);
  const maxScale = toNumber(filterScaleMax.value);

  const selectedLinkArrows = getSelectedLinkArrowValues();

  const useMonsterFilters = isMonsterFilterMode();
  const useSpellFilters = isSpellFilterMode();
  const useTrapFilters = isTrapFilterMode();

  let filtered = rows.filter((row) => {
    const searchable = [
      row.name,
      row.set_name,
      row.set_code,
      row.rarity,
      row.edition,
      row.type,
      row.race,
      row.attribute,
      row.archetype
    ].map(safeText).join(" ").toLowerCase();

    const rowAttribute = safeText(row.attribute).toUpperCase();
    const rowType = safeText(row.type);
    const rowRace = safeText(row.race);

    const rawLevel = toNumber(row.level);
    const rowAtk = toNumber(row.atk);
    const rowDef = toNumber(row.def);
    const rowLevel = isXyzMonster(row) ? null : rawLevel;
    const rowRank = isXyzMonster(row) ? rawLevel : null;
    const rowLink = isLinkMonster(row) ? toNumber(row.linkval ?? row.linkVal) : null;
    const rowScale = toNumber(row.scale);
    const rowLinkArrows = getRowLinkArrows(row);

    if (searchTerms.length > 0) {
      const matchesAnySearchTerm = searchTerms.some((term) => searchable.includes(term));
      if (!matchesAnySearchTerm) return false;
    }
    if (selectedType && getHighLevelType(row) !== selectedType) return false;

    if (useSpellFilters && selectedSpellType) {
      if (getHighLevelType(row) !== "Spell" || rowRace !== selectedSpellType) return false;
    }

    if (useTrapFilters && selectedTrapType) {
      if (getHighLevelType(row) !== "Trap" || rowRace !== selectedTrapType) return false;
    }

    if (useMonsterFilters && selectedAttribute && rowAttribute !== selectedAttribute) return false;
    if (useMonsterFilters && selectedRace && rowRace !== selectedRace) return false;

    if (useMonsterFilters && selectedSubtypes.length > 0) {
      const matchesAllSelectedSubtypes = selectedSubtypes.every((subtype) =>
        rowType.toLowerCase().includes(subtype.toLowerCase())
      );
      if (!matchesAllSelectedSubtypes) return false;
    }

    if (useMonsterFilters && atkExact !== null) {
      if (rowAtk === null || rowAtk !== atkExact) return false;
    }
    if (useMonsterFilters && minAtk !== null) {
      if (rowAtk === null || rowAtk < minAtk) return false;
    }
    if (useMonsterFilters && maxAtk !== null) {
      if (rowAtk === null || rowAtk > maxAtk) return false;
    }

    if (useMonsterFilters && defExact !== null) {
      if (rowDef === null || rowDef !== defExact) return false;
    }
    if (useMonsterFilters && minDef !== null) {
      if (rowDef === null || rowDef < minDef) return false;
    }
    if (useMonsterFilters && maxDef !== null) {
      if (rowDef === null || rowDef > maxDef) return false;
    }

    if (useMonsterFilters && levelExact !== null) {
      if (rowLevel === null || rowLevel !== levelExact) return false;
    }
    if (useMonsterFilters && minLevel !== null) {
      if (rowLevel === null || rowLevel < minLevel) return false;
    }
    if (useMonsterFilters && maxLevel !== null) {
      if (rowLevel === null || rowLevel > maxLevel) return false;
    }

    if (useMonsterFilters && rankExact !== null) {
      if (rowRank === null || rowRank !== rankExact) return false;
    }
    if (useMonsterFilters && minRank !== null) {
      if (rowRank === null || rowRank < minRank) return false;
    }
    if (useMonsterFilters && maxRank !== null) {
      if (rowRank === null || rowRank > maxRank) return false;
    }

    if (useMonsterFilters && linkExact !== null) {
      if (rowLink === null || rowLink !== linkExact) return false;
    }
    if (useMonsterFilters && minLink !== null) {
      if (rowLink === null || rowLink < minLink) return false;
    }
    if (useMonsterFilters && maxLink !== null) {
      if (rowLink === null || rowLink > maxLink) return false;
    }
        if (useMonsterFilters && scaleExact !== null) {
      if (rowScale === null || rowScale !== scaleExact) return false;
    }
    if (useMonsterFilters && minScale !== null) {
      if (rowScale === null || rowScale < minScale) return false;
    }
    if (useMonsterFilters && maxScale !== null) {
      if (rowScale === null || rowScale > maxScale) return false;
    }

    if (useMonsterFilters && selectedLinkArrows.length > 0) {
      if (!isLinkMonster(row)) return false;

      const matchesAllSelectedArrows = selectedLinkArrows.every((arrow) =>
        rowLinkArrows.includes(arrow)
      );

      if (!matchesAllSelectedArrows) return false;
    }

    return true;
  });

    filtered.sort((a, b) => {
    const result = compareSortValues(
      getSortValue(a, binderSort.value),
      getSortValue(b, binderSort.value),
      binderSortDirection
    );

    if (result !== 0) return result;

    return safeText(a.name).localeCompare(safeText(b.name), undefined, {
      sensitivity: "base"
    });
  });

  return filtered;
}

function renderBinder(rows) {
  const filtered = applyBinderFilters(rows);

  const totalCopies = filtered.reduce((sum, row) => sum + (toNumber(row.quantity) ?? 1), 0);

  binderStatus.textContent = `Showing ${totalCopies} cards across ${filtered.length} entries`;
  binderGrid.innerHTML = "";

  if (!filtered.length) {
    binderGrid.innerHTML = `<p class="muted">No cards matched your filters.</p>`;
    return;
  }

  filtered.forEach((row) => {
    const imageUrl = getCardImage(row);
    const banlistIcon = getBanlistIconForRow(row);
    const card = document.createElement("button");
    card.className = "binder-card";
    card.type = "button";

    card.innerHTML = `
      <div class="binder-image-wrap">
        ${
          imageUrl
            ? `<img src="${imageUrl}" alt="${safeText(row.name)}" class="binder-image" loading="lazy" />`
            : `<div class="binder-no-image">No Image</div>`
        }

        ${
          banlistIcon
            ? `
              <span class="binder-banlist-badge">
                <img
                  src="${banlistIcon}"
                  alt="Banlist status"
                  class="binder-banlist-icon"
                  loading="lazy"
                />
              </span>
            `
            : ""
        }

        <span class="binder-qty">x${safeText(row.quantity) || "1"}</span>
      </div>
      <div class="binder-meta">
        <div class="binder-name" title="${safeText(row.name)}">${safeText(row.name) || "Unknown Card"}</div>
        <div class="binder-code" title="${safeText(row.set_code)}">${safeText(row.set_code) || "—"}</div>
      </div>
    `;

    if (imageUrl) {
      card.addEventListener("click", () => {
        openModal(imageUrl, safeText(row.name) || "Card Image", {
          banlistIcon,
          banlistLabel: getBanlistLabelForRow(row)
        });
      });
    }

    binderGrid.appendChild(card);
  });
}

async function loadBinder(jsonPath) {
  binderStatus.textContent = "Loading binder...";
  binderGrid.innerHTML = "";

  try {
    const res = await fetch(jsonPath);
    if (!res.ok) throw new Error("Failed to load binder JSON");
    currentBinderRows = await res.json();
    renderBinder(currentBinderRows);
  } catch {
    binderStatus.textContent = "Could not load binder JSON.";
  }
}

binderSearch.addEventListener("input", () => renderBinder(currentBinderRows));

filterType.addEventListener("change", () => {
  syncFilterVisibility();
  renderBinder(currentBinderRows);
});

filterAttribute.addEventListener("change", () => renderBinder(currentBinderRows));
filterRace.addEventListener("change", () => renderBinder(currentBinderRows));
filterSpellType.addEventListener("change", () => renderBinder(currentBinderRows));
filterTrapType.addEventListener("change", () => renderBinder(currentBinderRows));

filterSubtypes.addEventListener("change", (event) => {
  if (event.target.matches('input[type="checkbox"]')) {
    renderBinder(currentBinderRows);
  }
});

filterAtkExact.addEventListener("input", () => renderBinder(currentBinderRows));
filterAtkMin.addEventListener("input", () => renderBinder(currentBinderRows));
filterAtkMax.addEventListener("input", () => renderBinder(currentBinderRows));

filterDefExact.addEventListener("input", () => renderBinder(currentBinderRows));
filterDefMin.addEventListener("input", () => renderBinder(currentBinderRows));
filterDefMax.addEventListener("input", () => renderBinder(currentBinderRows));

filterLevelExact.addEventListener("input", () => renderBinder(currentBinderRows));
filterLevelMin.addEventListener("input", () => renderBinder(currentBinderRows));
filterLevelMax.addEventListener("input", () => renderBinder(currentBinderRows));

filterRankExact.addEventListener("input", () => renderBinder(currentBinderRows));
filterRankMin.addEventListener("input", () => renderBinder(currentBinderRows));
filterRankMax.addEventListener("input", () => renderBinder(currentBinderRows));

filterLinkExact.addEventListener("input", () => renderBinder(currentBinderRows));
filterLinkMin.addEventListener("input", () => renderBinder(currentBinderRows));
filterLinkMax.addEventListener("input", () => renderBinder(currentBinderRows));

filterScaleExact.addEventListener("input", () => renderBinder(currentBinderRows));
filterScaleMin.addEventListener("input", () => renderBinder(currentBinderRows));
filterScaleMax.addEventListener("input", () => renderBinder(currentBinderRows));

filterLinkArrows.addEventListener("change", (event) => {
  if (event.target.matches('input[type="checkbox"]')) {
    renderBinder(currentBinderRows);
  }
});

binderPlayer.addEventListener("change", () => {
  syncFilterVisibility();
  loadBinder(binderPlayer.value);
});

binderSort.addEventListener("change", () => renderBinder(currentBinderRows));

binderSortDirectionButton.addEventListener("click", () => {
  binderSortDirection = binderSortDirection === "asc" ? "desc" : "asc";
  updateSortDirectionButton();
  renderBinder(currentBinderRows);
});

toggleFiltersButton.addEventListener("click", () => {
  setBinderFiltersCollapsed(!binderFiltersCollapsed);
});

binderBanlist.addEventListener("change", async () => {
  await loadBanlistData(binderBanlist.value);
  renderBinder(currentBinderRows);
});

async function init() {
  await Promise.all([
    loadSiteData(),
    loadDeckData(),
    loadBanlistManifest()
  ]);

  await loadBanlistData(binderBanlist.value);

  syncFilterVisibility();
  updateSortDirectionButton();
  updateFiltersToggleButton();
  loadBinder(binderPlayer.value);
}

init();