let deckData = {};
let deckStatsData = { byYdk: {}, playerStats: {} };

const archetypeHeroName = document.getElementById("archetypeHeroName");
const archetypeHeroDescription = document.getElementById("archetypeHeroDescription");
const archetypeSnapshotGrid = document.getElementById("archetypeSnapshotGrid");
const archetypeSectionTitle = document.getElementById("archetypeSectionTitle");
const archetypeSectionNote = document.getElementById("archetypeSectionNote");
const archetypeWeekSections = document.getElementById("archetypeWeekSections");

const modal = document.getElementById("imageModal");
const modalImage = document.getElementById("modalImage");
const modalTitle = document.getElementById("modalTitle");
const closeModalButton = document.getElementById("closeModal");

function safeText(value) {
  return value ? String(value).trim() : "";
}

function escapeHtml(value) {
  return safeText(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeAssetPath(value) {
  return safeText(value)
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/^\/+/, "");
}

function normalizeKey(value) {
  return safeText(value).toLowerCase();
}

function buildArchetypeHref(name) {
  return `archetype.html?name=${encodeURIComponent(safeText(name))}`;
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
  if (event.key === "Escape" && modal.classList.contains("is-open")) {
    closeModal();
  }
});

function getRequestedArchetype() {
  const params = new URLSearchParams(window.location.search);
  return safeText(params.get("name"));
}

function getDeckStatsForDeck(deck) {
  const ydkPath = normalizeAssetPath(deck?.ydk);
  if (!ydkPath) return null;

  const entry = deckStatsData?.byYdk?.[ydkPath] || null;
  return entry && !entry.missing ? entry : null;
}

function getArchetypeRows(deckStats) {
  if (Array.isArray(deckStats?.archetypes) && deckStats.archetypes.length) {
    return deckStats.archetypes;
  }

  if (Array.isArray(deckStats?.topArchetypes) && deckStats.topArchetypes.length) {
    return deckStats.topArchetypes;
  }

  return [];
}

function findArchetypeMatch(deckStats, archetypeName) {
  const target = normalizeKey(archetypeName);

  return getArchetypeRows(deckStats).find((row) => {
    return normalizeKey(row?.name) === target;
  }) || null;
}

function renderLinkedChip(item, extraClass = "") {
  const name = safeText(item?.name) || "Unknown";
  const copies = item?.copies;
  const suffix = copies === undefined || copies === null ? "" : ` · ${copies}`;
  const classes = ["deck-chip", "deck-chip-link"];

  if (extraClass) classes.push(extraClass);

  return `
    <a
      class="${classes.join(" ")}"
      href="${buildArchetypeHref(name)}"
      title="Open ${escapeHtml(name)} archive"
    >
      ${escapeHtml(name)}${escapeHtml(suffix)}
    </a>
  `;
}

function renderSupportingChips(deckStats, activeArchetype) {
  const rows = getArchetypeRows(deckStats)
    .filter((row) => normalizeKey(row?.name) !== normalizeKey(activeArchetype))
    .slice(0, 2);

  if (!rows.length) {
    return "";
  }

  return rows.map((row) => renderLinkedChip(row)).join("");
}

function collectArchetypeWeeks(archetypeName) {
  const groups = [];

  Object.entries(deckData).forEach(([weekKey, week]) => {
    const matchedDecks = (week?.decks || [])
      .map((deck) => {
        const stats = getDeckStatsForDeck(deck);
        const match = findArchetypeMatch(stats, archetypeName);

        if (!match) return null;

        return {
          deck,
          stats,
          match
        };
      })
      .filter(Boolean);

    if (!matchedDecks.length) return;

    groups.push({
      weekKey,
      label: safeText(week?.label) || weekKey,
      matchedDecks
    });
  });

  return groups;
}

function renderSnapshot(groups) {
  const qualifyingWeeks = groups.length;
  const renderedDecks = groups.reduce((sum, group) => sum + group.matchedDecks.length, 0);

  const players = new Set();
  groups.forEach((group) => {
    group.matchedDecks.forEach(({ deck }) => {
      const player = safeText(deck?.player);
      if (player) players.add(player.toLowerCase());
    });
  });

  const items = [
    { label: "Weeks Found", value: qualifyingWeeks },
    { label: "Decks Shown", value: renderedDecks },
    { label: "Matched Decks", value: renderedDecks },
    { label: "Players On It", value: players.size }
  ];

  archetypeSnapshotGrid.innerHTML = items.map((item) => `
    <div class="mini-card">
      <span>${escapeHtml(item.label)}</span>
      <strong>${escapeHtml(item.value)}</strong>
    </div>
  `).join("");
}

function renderEmptyState(archetypeName) {
  const safeName = escapeHtml(archetypeName);

  archetypeWeekSections.innerHTML = `
    <article class="card archetype-empty-card">
      <div class="archetype-empty-copy">
        <p class="section-label">No Matches</p>
        <h4>No tracked weeks found for ${safeName}</h4>
        <p class="muted">
          Try another archetype chip from the deck browser, or rebuild deck stats if you just added fresh .ydk files.
        </p>
      </div>
    </article>
  `;

  archetypeSnapshotGrid.innerHTML = `
    <div class="mini-card"><span>Weeks Found</span><strong>0</strong></div>
    <div class="mini-card"><span>Decks Rendered</span><strong>0</strong></div>
    <div class="mini-card"><span>Matched Decks</span><strong>0</strong></div>
    <div class="mini-card"><span>Players On It</span><strong>0</strong></div>
  `;
}

function renderWeekSections(groups, archetypeName) {
  if (!groups.length) {
    renderEmptyState(archetypeName);
    return;
  }

  archetypeWeekSections.innerHTML = groups.map((group) => {
    const weekLabel = escapeHtml(group.label);
    const matchCount = group.matchedDecks.length;

    return `
      <section class="card archetype-week-card">
        <div class="week-card-header archetype-week-header">
          <div>
            <p class="section-label">Week</p>
            <h4>${weekLabel}</h4>
          </div>
          <div class="winner-badge">${matchCount} ${matchCount === 1 ? "deck" : "decks"}</div>
        </div>

        <div class="archetype-week-body">
          <div class="archetype-deck-grid">
            ${group.matchedDecks.map(({ deck, stats, match }) => {
              const image = safeText(deck?.image);
              const title = safeText(deck?.title) || `${safeText(deck?.player)} Deck`;
              const player = safeText(deck?.player) || "Unknown";
              const ydkPath = normalizeAssetPath(deck?.ydk);

              return `
                <article class="deck-gallery-card archetype-deck-card is-match">
                  <button
                    class="deck-gallery-preview"
                    type="button"
                    data-image="${escapeHtml(image)}"
                    data-title="${escapeHtml(title)}"
                    aria-label="Open ${escapeHtml(title)} image"
                  >
                    <div class="deck-gallery-image-wrap">
                      <img src="${escapeHtml(image)}" alt="${escapeHtml(title)}" class="deck-gallery-image" />
                    </div>
                  </button>

                  <div class="deck-gallery-meta">
                    <div class="deck-gallery-copy">
                      <span class="deck-gallery-player">${escapeHtml(player)}</span>
                      <span class="deck-gallery-title">${escapeHtml(title)}</span>
                    </div>

                    <div class="deck-chip-row">
                      <span class="deck-chip deck-chip-current archetype-match-chip">${escapeHtml(match.name)} · ${match.copies}</span>
                      ${renderSupportingChips(stats, archetypeName)}
                    </div>
                  </div>

                  ${ydkPath ? `
                    <div class="deck-gallery-footer">
                      <a href="${escapeHtml(ydkPath)}" class="deck-action-button deck-download-button" download>Download .ydk</a>
                    </div>
                  ` : ""}
                </article>
              `;
            }).join("")}
          </div>
        </div>
      </section>
    `;
  }).join("");

  document.querySelectorAll(".deck-gallery-preview").forEach((button) => {
    button.addEventListener("click", () => {
      openModal(button.dataset.image || "", button.dataset.title || "Deck Image");
    });
  });
}

async function loadData() {
  const [decksResponse, statsResponse] = await Promise.all([
    fetch("data/decks.json"),
    fetch("data/generated/deck-stats.json", { cache: "no-store" })
  ]);

  deckData = await decksResponse.json();
  deckStatsData = await statsResponse.json();
}

async function init() {
  const archetypeName = getRequestedArchetype();

  if (!archetypeName) {
    archetypeHeroName.textContent = "No Archetype Selected";
    archetypeHeroDescription.textContent = "Go back to the deck browser and click any archetype chip.";
    archetypeSectionTitle.textContent = "Archetype Archive";
    archetypeSectionNote.textContent = "This page needs a ?name= query string.";
    renderEmptyState("this archetype");
    return;
  }

  await loadData();

  const groups = collectArchetypeWeeks(archetypeName);

  document.title = `${archetypeName} • Prog with the Bois`;
  archetypeHeroName.textContent = archetypeName;
  archetypeHeroDescription.textContent =
    `Every qualifying week is shown with all four decks kept together for context.`;
  archetypeSectionTitle.textContent = `${archetypeName} Deck Archive`;
  archetypeSectionNote.textContent =
    `Only decks that actually used ${archetypeName} are shown here.`;
  renderSnapshot(groups);
  renderWeekSections(groups, archetypeName);
}

init();