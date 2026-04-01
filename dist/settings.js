const PLAYERS = [
  { key: "asapaska", label: "asapaska" },
  { key: "retroid99", label: "Retroid99" },
  { key: "mhkaixer", label: "MHKaixer" },
  { key: "shiruba", label: "ShirubaMaebure" }
];

let currentPlayer = "";
let altArts = {};
let prefs = {};
let searchText = "";
let currentUser = null;

const playerTabs = document.getElementById("playerTabs");
const searchInput = document.getElementById("searchInput");
const statusText = document.getElementById("statusText");
const cardList = document.getElementById("cardList");
const loginButton = document.getElementById("loginButton");
const logoutButton = document.getElementById("logoutButton");

function safeText(value) {
  return value ? String(value).trim() : "";
}

function setStatus(text) {
  statusText.textContent = text;
}

function getAllowedPlayers() {
  return Array.isArray(currentUser?.allowedPlayers) ? currentUser.allowedPlayers : [];
}

function isLoggedIn() {
  return !!currentUser;
}

function canEditPlayer(playerKey) {
  return getAllowedPlayers().includes(playerKey);
}

async function loadAltArts() {
  const resp = await fetch("/data/generated/alt-artworks.json", { cache: "no-store" });
  if (!resp.ok) {
    throw new Error("Failed to load alt-artworks.json");
  }
  altArts = await resp.json();
}

async function loadMe() {
  const resp = await fetch("/api/me", {
    cache: "no-store",
    credentials: "same-origin"
  });

  if (!resp.ok) {
    throw new Error("Failed to load session.");
  }

  const data = await resp.json();

  if (data?.loggedIn && data?.user) {
    currentUser = data.user;
  } else {
    currentUser = null;
  }
}

async function loadPrefs() {
  if (!currentPlayer) {
    prefs = {};
    return;
  }

  const resp = await fetch(`/api/artwork-prefs?player=${encodeURIComponent(currentPlayer)}`, {
    cache: "no-store",
    credentials: "same-origin"
  });

  if (!resp.ok) {
    throw new Error(`Failed to load prefs for ${currentPlayer}`);
  }

  const data = await resp.json();
  prefs = data?.prefs || {};
}

async function savePref(cardId, imageId) {
  if (!isLoggedIn()) {
    alert("Log in with Discord first.");
    return;
  }

  if (!canEditPlayer(currentPlayer)) {
    alert("You are not allowed to edit this player.");
    return;
  }

  const resp = await fetch("/api/artwork-prefs", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "content-type": "application/json"
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

async function logout() {
  await fetch("/auth/logout", {
    method: "POST",
    credentials: "same-origin"
  });

  currentUser = null;
  prefs = {};
  currentPlayer = "";
  renderAuth();
  buildTabs();
  renderCards();
  setStatus("Logged out.");
}

function renderAuth() {
  if (isLoggedIn()) {
    if (loginButton) {
      loginButton.style.display = "none";
    }

    if (logoutButton) {
      logoutButton.style.display = "inline-flex";
    }
  } else {
    if (loginButton) {
      loginButton.style.display = "inline-flex";
    }

    if (logoutButton) {
      logoutButton.style.display = "none";
    }
  }
}

function buildTabs() {
  playerTabs.innerHTML = "";

  const allowedPlayers = getAllowedPlayers();
  const visiblePlayers = PLAYERS.filter((player) => allowedPlayers.includes(player.key));

  if (!visiblePlayers.length) {
    currentPlayer = "";
    return;
  }

  if (!visiblePlayers.some((player) => player.key === currentPlayer)) {
    currentPlayer = visiblePlayers[0].key;
  }

  for (const player of visiblePlayers) {
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
  cardList.innerHTML = "";

  if (!isLoggedIn()) {
    cardList.innerHTML = `<div class="settings-empty">Log in with Discord to edit artwork preferences.</div>`;
    return;
  }

  if (!currentPlayer) {
    cardList.innerHTML = `<div class="settings-empty">Your Discord account is logged in, but it is not allowed to edit any player tabs yet.</div>`;
    return;
  }

  const entries = getFilteredEntries();

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
    logoutButton.addEventListener("click", logout);

    searchInput.addEventListener("input", () => {
      searchText = safeText(searchInput.value);
      renderCards();
    });

    await Promise.all([
      loadAltArts(),
      loadMe()
    ]);

    renderAuth();
    buildTabs();

    if (currentPlayer) {
      await loadPrefs();
      setStatus(`Showing ${PLAYERS.find((p) => p.key === currentPlayer)?.label || currentPlayer} preferences.`);
    } else if (isLoggedIn()) {
      setStatus("Logged in, but no editable players are assigned to this Discord account.");
    } else {
      setStatus("Log in with Discord to edit artwork preferences.");
    }

    renderCards();
  } catch (err) {
    console.error(err);
    setStatus(err?.message || "Failed to load settings page.");
  }
}

init();