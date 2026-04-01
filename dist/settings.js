const PLAYERS = [
  { key: "asapaska", label: "asapaska" },
  { key: "retroid99", label: "Retroid99" },
  { key: "mhkaixer", label: "MHKaixer" },
  { key: "shiruba", label: "ShirubaMaebure" }
];

let currentPlayer = "asapaska";
let altArts = {};
let prefs = {};
let searchText = "";

const playerTabs = document.getElementById("playerTabs");
const searchInput = document.getElementById("searchInput");
const tokenInput = document.getElementById("tokenInput");
const statusText = document.getElementById("statusText");
const cardList = document.getElementById("cardList");

function safeText(value) {
  return value ? String(value).trim() : "";
}

function setStatus(text) {
  statusText.textContent = text;
}

function getToken() {
  return safeText(tokenInput.value);
}

async function loadAltArts() {
  const resp = await fetch("/data/generated/alt-artworks.json", { cache: "no-store" });
  if (!resp.ok) {
    throw new Error("Failed to load alt-artworks.json");
  }
  altArts = await resp.json();
}

async function loadPrefs() {
  const resp = await fetch(`/api/artwork-prefs?player=${encodeURIComponent(currentPlayer)}`, {
    cache: "no-store"
  });

  if (!resp.ok) {
    throw new Error(`Failed to load prefs for ${currentPlayer}`);
  }

  const data = await resp.json();
  prefs = data?.prefs || {};
}

async function savePref(cardId, imageId) {
  const token = getToken();

  if (!token) {
    alert("Enter admin token first.");
    return;
  }

  const resp = await fetch("/api/artwork-prefs", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": `Bearer ${token}`
    },
    body: JSON.stringify({
      player: currentPlayer,
      cardId: String(cardId),
      imageId: String(imageId)
    })
  });

  const data = await resp.json().catch(() => ({}));

  if (!resp.ok) {
    alert(data?.error || "Failed to save preference.");
    return;
  }

  prefs = data?.prefs || {};
  renderCards();
  setStatus(`Saved artwork for ${currentPlayer}.`);
}

function buildTabs() {
  playerTabs.innerHTML = "";

  for (const player of PLAYERS) {
    const btn = document.createElement("button");
    btn.className = `settings-player-tab${player.key === currentPlayer ? " is-active" : ""}`;
    btn.type = "button";
    btn.textContent = player.label;

    btn.addEventListener("click", async () => {
      currentPlayer = player.key;
      buildTabs();
      setStatus(`Loading ${player.label} preferences...`);
      await loadPrefs();
      renderCards();
      setStatus(`Showing ${player.label} preferences.`);
    });

    playerTabs.appendChild(btn);
  }
}

function getFilteredEntries() {
  const entries = Object.entries(altArts)
    .filter(([, entry]) => entry?.hasAlternateArt);

  if (!searchText) {
    return entries.sort((a, b) => {
      const nameA = safeText(a[1]?.name);
      const nameB = safeText(b[1]?.name);
      return nameA.localeCompare(nameB);
    });
  }

  const q = searchText.toLowerCase();

  return entries
    .filter(([, entry]) => safeText(entry?.name).toLowerCase().includes(q))
    .sort((a, b) => {
      const nameA = safeText(a[1]?.name);
      const nameB = safeText(b[1]?.name);
      return nameA.localeCompare(nameB);
    });
}

function renderCards() {
  const entries = getFilteredEntries();
  cardList.innerHTML = "";

  if (!entries.length) {
    cardList.innerHTML = `<div class="settings-empty">No matching cards found.</div>`;
    return;
  }

  for (const [cardId, entry] of entries) {
    const row = document.createElement("div");
    row.className = "settings-card-row";

    const head = document.createElement("div");
    head.className = "settings-card-head";

    const titleWrap = document.createElement("div");

    const title = document.createElement("h5");
    title.className = "settings-card-title";
    title.textContent = entry?.name || cardId;

    const subtitle = document.createElement("p");
    subtitle.className = "settings-card-subtitle";
    subtitle.textContent = `Card ID: ${cardId}`;

    titleWrap.appendChild(title);
    titleWrap.appendChild(subtitle);
    head.appendChild(titleWrap);
    row.appendChild(head);

    const artGrid = document.createElement("div");
    artGrid.className = "settings-art-grid";

    const selectedImageId = safeText(prefs?.[cardId]);

    for (const option of entry?.options || []) {
      const imageId = safeText(option?.imageId);
      const imageUrl = safeText(option?.image);

      const button = document.createElement("button");
      button.className = `settings-art-button${selectedImageId === imageId ? " is-selected" : ""}`;
      button.type = "button";
      button.addEventListener("click", () => savePref(cardId, imageId));

      const imageWrap = document.createElement("div");
      imageWrap.className = "settings-art-image-wrap";

      const img = document.createElement("img");
      img.className = "settings-art-image";
      img.src = imageUrl;
      img.alt = `${entry?.name || cardId} - ${imageId}`;

      const meta = document.createElement("div");
      meta.className = "settings-art-meta";
      meta.textContent = imageId;

      imageWrap.appendChild(img);
      button.appendChild(imageWrap);
      button.appendChild(meta);
      artGrid.appendChild(button);
    }

    row.appendChild(artGrid);
    cardList.appendChild(row);
  }
}

async function init() {
  try {
    buildTabs();

    searchInput.addEventListener("input", () => {
      searchText = safeText(searchInput.value);
      renderCards();
    });

    await loadAltArts();
    await loadPrefs();
    renderCards();
    setStatus(`Showing ${PLAYERS.find(p => p.key === currentPlayer)?.label || currentPlayer} preferences.`);
  } catch (err) {
    console.error(err);
    setStatus(err?.message || "Failed to load settings page.");
  }
}

init();