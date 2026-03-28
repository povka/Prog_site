let deckData = {};
let siteData = {};
let currentBinderRows = [];

const deckSearch = document.getElementById("deckSearch");
const deckSelector = document.getElementById("deckSelector");
const deckDisplay = document.getElementById("deckDisplay");
const deckResultsLabel = document.getElementById("deckResultsLabel");

const binderPlayer = document.getElementById("binderPlayer");
const binderSearch = document.getElementById("binderSearch");
const binderGrid = document.getElementById("binderGrid");
const binderStatus = document.getElementById("binderStatus");

const filterType = document.getElementById("filterType");
const filterSpellType = document.getElementById("filterSpellType");
const filterAttribute = document.getElementById("filterAttribute");
const filterRace = document.getElementById("filterRace");
const filterSubtypes = document.getElementById("filterSubtypes");

const filterAtkExact = document.getElementById("filterAtkExact");
const filterAtkMin = document.getElementById("filterAtkMin");
const filterAtkMax = document.getElementById("filterAtkMax");

const filterDefExact = document.getElementById("filterDefExact");
const filterDefMin = document.getElementById("filterDefMin");
const filterDefMax = document.getElementById("filterDefMax");

const filterLevelExact = document.getElementById("filterLevelExact");
const filterLevelMin = document.getElementById("filterLevelMin");
const filterLevelMax = document.getElementById("filterLevelMax");
const binderSort = document.getElementById("binderSort");

const modal = document.getElementById("imageModal");
const modalImage = document.getElementById("modalImage");
const modalTitle = document.getElementById("modalTitle");
const closeModalButton = document.getElementById("closeModal");

function safeText(value) {
  return value ? String(value).trim() : "";
}

function toNumber(value) {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

function openModal(src, title) {
  modalImage.src = src;
  modalImage.alt = title;
  modalTitle.textContent = title;
  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
}

function closeModal() {
  modal.classList.remove("is-open");
  modal.setAttribute("aria-hidden", "true");
  modalImage.src = "";
  modalImage.alt = "";
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
  const res = await fetch("data/decks.json");
  deckData = await res.json();

  deckSelector.innerHTML = Object.entries(deckData)
    .map(([key, week]) => `<option value="${key}">${week.label}</option>`)
    .join("");

  const firstKey = Object.keys(deckData)[0];
  if (firstKey) renderDecks(firstKey);
}

function renderDecks(weekKey) {
  const week = deckData[weekKey];
  if (!week) return;

  deckResultsLabel.textContent = `Showing decks for: ${week.label}`;
  deckDisplay.innerHTML = "";

  week.decks.forEach((deck) => {
    const card = document.createElement("button");
    card.className = "deck-gallery-card";
    card.type = "button";

    card.innerHTML = `
      <div class="deck-gallery-image-wrap">
        <img src="${deck.image}" alt="${deck.title}" class="deck-gallery-image" />
      </div>
      <div class="deck-gallery-meta">
        <span class="deck-gallery-player">${deck.player}</span>
        <span class="deck-gallery-action">Open full list</span>
      </div>
    `;

    card.addEventListener("click", () => {
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

function isMonsterFilterMode() {
  const selectedType = safeText(filterType.value);
  return selectedType === "" || selectedType === "Monster";
}

function isSpellFilterMode() {
  const selectedType = safeText(filterType.value);
  return selectedType === "" || selectedType === "Spell";
}

function syncMonsterOnlyFilterVisibility() {
  const showMonsterOnly = isMonsterFilterMode();
  const showSpellOnly = isSpellFilterMode();

  document.querySelectorAll(".monster-only-control").forEach((el) => {
    el.classList.toggle("is-hidden", !showMonsterOnly);
  });

  document.querySelectorAll(".spell-only-control").forEach((el) => {
    el.classList.toggle("is-hidden", !showSpellOnly);
  });

  if (!showMonsterOnly) {
    filterAttribute.value = "";
    filterAttribute.disabled = true;
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
  } else {
    filterAttribute.disabled = false;
    filterSubtypes.classList.remove("is-disabled");
  }

  if (!showSpellOnly) {
    filterSpellType.value = "";
  }
}

function applyBinderFilters(rows) {
  const q = binderSearch.value.trim().toLowerCase();
  const selectedType = safeText(filterType.value);
  const selectedSpellType = safeText(filterSpellType.value);
  const selectedAttribute = safeText(filterAttribute.value).toUpperCase();
  const selectedRace = safeText(filterRace.value);
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

  const useMonsterOnly = isMonsterFilterMode();

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
    ]
      .map(safeText)
      .join(" ")
      .toLowerCase();

    const rowAttribute = safeText(row.attribute).toUpperCase();
    const rowType = safeText(row.type);
    const rowRace = safeText(row.race);
    const rowAtk = toNumber(row.atk);
    const rowDef = toNumber(row.def);
    const rowLevel = toNumber(row.level);

    if (q && !searchable.includes(q)) return false;
    if (selectedType && getHighLevelType(row) !== selectedType) return false;

    if (useMonsterOnly && selectedAttribute && rowAttribute !== selectedAttribute) return false;
    if (useMonsterOnly && selectedRace && rowRace !== selectedRace) return false;

    if (useMonsterOnly && selectedSubtypes.length > 0) {
      const matchesAllSelectedSubtypes = selectedSubtypes.every((subtype) =>
        rowType.toLowerCase().includes(subtype.toLowerCase())
      );
      if (!matchesAllSelectedSubtypes) return false;
    }

    if (useMonsterOnly && atkExact !== null) {
      if (rowAtk === null || rowAtk !== atkExact) return false;
    }

    if (useMonsterOnly && minAtk !== null) {
      if (rowAtk === null || rowAtk < minAtk) return false;
    }

    if (useMonsterOnly && maxAtk !== null) {
      if (rowAtk === null || rowAtk > maxAtk) return false;
    }

    if (useMonsterOnly && defExact !== null) {
      if (rowDef === null || rowDef !== defExact) return false;
    }

    if (useMonsterOnly && minDef !== null) {
      if (rowDef === null || rowDef < minDef) return false;
    }

    if (useMonsterOnly && maxDef !== null) {
      if (rowDef === null || rowDef > maxDef) return false;
    }

    if (useMonsterOnly && levelExact !== null) {
      if (rowLevel === null || rowLevel !== levelExact) return false;
    }

    if (useMonsterOnly && minLevel !== null) {
      if (rowLevel === null || rowLevel < minLevel) return false;
    }

    if (useMonsterOnly && maxLevel !== null) {
      if (rowLevel === null || rowLevel > maxLevel) return false;
    }

    if (isSpellFilterMode() && selectedSpellType) {
      if (getHighLevelType(row) !== "Spell" || safeText(row.race) !== selectedSpellType) {
        return false;
      }
    }

    return true;
  });

  switch (binderSort.value) {
    case "name-desc":
      filtered.sort((a, b) => safeText(b.name).localeCompare(safeText(a.name)));
      break;
    case "qty-desc":
      filtered.sort((a, b) => (toNumber(b.quantity) ?? 0) - (toNumber(a.quantity) ?? 0));
      break;
    case "atk-desc":
      filtered.sort((a, b) => (toNumber(b.atk) ?? -1) - (toNumber(a.atk) ?? -1));
      break;
    case "def-desc":
      filtered.sort((a, b) => (toNumber(b.def) ?? -1) - (toNumber(a.def) ?? -1));
      break;
    case "level-desc":
      filtered.sort((a, b) => (toNumber(b.level) ?? -1) - (toNumber(a.level) ?? -1));
      break;
    default:
      filtered.sort((a, b) => safeText(a.name).localeCompare(safeText(b.name)));
  }

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
        <span class="binder-qty">x${safeText(row.quantity) || "1"}</span>
      </div>
      <div class="binder-meta">
        <div class="binder-name" title="${safeText(row.name)}">${safeText(row.name) || "Unknown Card"}</div>
        <div class="binder-code" title="${safeText(row.set_code)}">${safeText(row.set_code) || "—"}</div>
      </div>
    `;

    if (imageUrl) {
      card.addEventListener("click", () => {
        openModal(imageUrl, safeText(row.name) || "Card Image");
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

binderPlayer.addEventListener("change", () => {
  syncMonsterOnlyFilterVisibility();
  loadBinder(binderPlayer.value);
});

binderSearch.addEventListener("input", () => renderBinder(currentBinderRows));

filterType.addEventListener("change", () => {
  syncMonsterOnlyFilterVisibility();
  renderBinder(currentBinderRows);
});

filterSpellType.addEventListener("change", () => renderBinder(currentBinderRows));

filterAttribute.addEventListener("change", () => renderBinder(currentBinderRows));
filterRace.addEventListener("change", () => renderBinder(currentBinderRows));

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

binderSort.addEventListener("change", () => renderBinder(currentBinderRows));

async function init() {
  await Promise.all([
    loadSiteData(),
    loadDeckData()
  ]);

  syncMonsterOnlyFilterVisibility();
  loadBinder(binderPlayer.value);
}

init();