const PLAYERS = [
  { key: "asapaska", label: "asapaska" },
  { key: "retroid99", label: "Retroid99" },
  { key: "mhkaixer", label: "MHKaixer" },
  { key: "shiruba", label: "ShirubaMaebure" }
]

const IMAGE_VERSION = "2"
const STORAGE_PREFIX = "prog_deckbuilder_"
const MAX_COPIES_PER_DECK = 3
const DECK_LIMITS = {
  main: 60,
  extra: 15
}
const BANLISTS_BASE_PATH = "/data/Banlists"
const BANLIST_MANIFEST_PATH = `${BANLISTS_BASE_PATH}/banlists.json`
const FALLBACK_BANLIST_FILE = "Pharaoh's Servant.conf"

let currentUser = null
let currentPlayer = ""
let binderRows = []
let currentBinderRows = []
let poolRows = []
let poolByKey = new Map()
let artworkManifest = {}
let artworkPrefs = {}
let artworkPrefsPlayer = ""
let artworkManifestByImageId = {}
let binderSortDirection = "asc"
let binderFiltersCollapsed = true
let previewCardKey = ""
let activeBanlistFile = FALLBACK_BANLIST_FILE
let banlistLimitById = new Map()
let deckState = {
  main: [],
  extra: []
}

const playerTabs = document.getElementById("playerTabs")
const binderSearch = document.getElementById("binderSearch")
const binderGrid = document.getElementById("binderGrid")
const binderStatus = document.getElementById("binderStatus")
const statusText = document.getElementById("statusText")
const accessNotice = document.getElementById("accessNotice")
const builderShell = document.getElementById("builderShell")
const loginButton = document.getElementById("loginButton")
const logoutButton = document.getElementById("logoutButton")
const exportButton = document.getElementById("exportButton")
const clearDeckButton = document.getElementById("clearDeckButton")
const exportHint = document.getElementById("exportHint")
const deckAuthActions = document.getElementById("deckAuthActions")
const mainSectionLabel = document.getElementById("mainSectionLabel")
const extraSectionLabel = document.getElementById("extraSectionLabel")
const mainList = document.getElementById("mainList")
const extraList = document.getElementById("extraList")
const previewTitle = document.getElementById("previewTitle")
const previewSubtitle = document.getElementById("previewSubtitle")
const previewImage = document.getElementById("previewImage")
const previewEmpty = document.getElementById("previewEmpty")

const filterType = document.getElementById("filterType")
const filterAttribute = document.getElementById("filterAttribute")
const filterRace = document.getElementById("filterRace")
const filterSubtypes = document.getElementById("filterSubtypes")
const filterAtkExact = document.getElementById("filterAtkExact")
const filterAtkMin = document.getElementById("filterAtkMin")
const filterAtkMax = document.getElementById("filterAtkMax")
const filterDefExact = document.getElementById("filterDefExact")
const filterDefMin = document.getElementById("filterDefMin")
const filterDefMax = document.getElementById("filterDefMax")
const filterLevelExact = document.getElementById("filterLevelExact")
const filterLevelMin = document.getElementById("filterLevelMin")
const filterLevelMax = document.getElementById("filterLevelMax")
const filterRankExact = document.getElementById("filterRankExact")
const filterRankMin = document.getElementById("filterRankMin")
const filterRankMax = document.getElementById("filterRankMax")
const filterLinkExact = document.getElementById("filterLinkExact")
const filterLinkMin = document.getElementById("filterLinkMin")
const filterLinkMax = document.getElementById("filterLinkMax")
const filterScaleExact = document.getElementById("filterScaleExact")
const filterScaleMin = document.getElementById("filterScaleMin")
const filterScaleMax = document.getElementById("filterScaleMax")
const filterLinkArrows = document.getElementById("filterLinkArrows")
const filterSpellType = document.getElementById("filterSpellType")
const filterTrapType = document.getElementById("filterTrapType")
const binderFiltersPanel = document.getElementById("binderFiltersPanel")
const toggleFiltersButton = document.getElementById("toggleFiltersButton")
const binderSort = document.getElementById("binderSort")
const binderSortDirectionButton = document.getElementById("binderSortDirection")
const deckBanlist = document.getElementById("deckBanlist")

function safeText(value) {
  return value ? String(value).trim() : ""
}

function setStatus(text) {
  statusText.textContent = text
}

function withImageVersion(url) {
  const text = safeText(url)
  if (!text) return ""

  const separator = text.includes("?") ? "&" : "?"
  return `${text}${separator}v=${encodeURIComponent(IMAGE_VERSION)}`
}

function toNumber(value) {
  if (value === null || value === undefined) return null
  const trimmed = String(value).trim()
  if (trimmed === "") return null
  const n = Number(trimmed)
  return Number.isFinite(n) ? n : null
}

function normalizeCardId(value) {
  const raw = safeText(value)
  if (!raw) return ""

  const digitsOnly = raw.replace(/\D+/g, "")
  if (!digitsOnly) return ""

  return String(Number(digitsOnly))
}

function formatYdkCardId(value) {
  const normalized = normalizeCardId(value)
  if (!normalized) return ""
  return normalized.length < 8 ? normalized.padStart(8, "0") : normalized
}

function formatBanlistLabel(fileName) {
  return safeText(fileName).replace(/\.conf$/i, "")
}

function setBanlistOptions(files, defaultFile) {
  const normalizedFiles = Array.from(
    new Set(
      (files || [])
        .map((file) => safeText(file))
        .filter((file) => file && /\.conf$/i.test(file))
    )
  ).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))

  if (!normalizedFiles.length) {
    normalizedFiles.push(FALLBACK_BANLIST_FILE)
  }

  const selectedFile = normalizedFiles.includes(defaultFile)
    ? defaultFile
    : normalizedFiles.includes(FALLBACK_BANLIST_FILE)
      ? FALLBACK_BANLIST_FILE
      : normalizedFiles[0]

  deckBanlist.innerHTML = ""

  normalizedFiles.forEach((fileName) => {
    const option = document.createElement("option")
    option.value = fileName
    option.textContent = formatBanlistLabel(fileName)
    deckBanlist.appendChild(option)
  })

  deckBanlist.value = selectedFile
  activeBanlistFile = selectedFile
}

async function loadBanlistManifest() {
  try {
    const res = await fetch(BANLIST_MANIFEST_PATH, { cache: "no-store" })
    if (!res.ok) throw new Error("Failed to load banlist manifest")

    const manifest = await res.json()
    const files = Array.isArray(manifest.files) ? manifest.files : []
    const defaultFile = safeText(manifest.default) || FALLBACK_BANLIST_FILE

    setBanlistOptions(files, defaultFile)
  } catch {
    setBanlistOptions([FALLBACK_BANLIST_FILE], FALLBACK_BANLIST_FILE)
  }
}

function parseBanlistConfig(content) {
  const map = new Map()
  const lines = String(content || "").split(/\r?\n/)

  let currentSection = ""

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) continue

    if (line.startsWith("#")) {
      currentSection = line.slice(1).trim().toLowerCase()
      continue
    }

    if (line.startsWith("!") || line.startsWith("--") || line.startsWith("$")) {
      continue
    }

    const match = line.match(/^(\d+)\s+(\d+)/)
    if (!match) continue

    const cardId = normalizeCardId(match[1])
    const count = Number(match[2])

    if (!cardId || !Number.isFinite(count)) continue

    let limit = null

    if (currentSection === "forbidden" || count === 0) {
      limit = 0
    } else if (currentSection === "limited" || count === 1) {
      limit = 1
    } else if (
      currentSection === "semi-limited" ||
      currentSection === "semilimited" ||
      count === 2
    ) {
      limit = 2
    } else {
      limit = Math.max(0, Math.min(MAX_COPIES_PER_DECK, count))
    }

    map.set(cardId, limit)
  }

  return map
}

async function loadBanlistData(fileName = deckBanlist.value || activeBanlistFile || FALLBACK_BANLIST_FILE) {
  const selectedFile = safeText(fileName) || FALLBACK_BANLIST_FILE
  activeBanlistFile = selectedFile

  if (deckBanlist.value !== selectedFile) {
    deckBanlist.value = selectedFile
  }

  try {
    const res = await fetch(`${BANLISTS_BASE_PATH}/${encodeURIComponent(selectedFile)}`, {
      cache: "no-store"
    })

    if (!res.ok) throw new Error("Failed to load banlist")

    const text = await res.text()
    banlistLimitById = parseBanlistConfig(text)
  } catch {
    banlistLimitById = new Map()
  }
}

function getStorageKey() {
  return currentPlayer ? `${STORAGE_PREFIX}${currentPlayer}` : ""
}

function getBanlistLimit(cardKey) {
  const normalized = normalizeCardId(cardKey)
  if (!normalized) return MAX_COPIES_PER_DECK
  if (!banlistLimitById.has(normalized)) return MAX_COPIES_PER_DECK

  const limit = Number(banlistLimitById.get(normalized))
  if (!Number.isFinite(limit)) return MAX_COPIES_PER_DECK
  return Math.max(0, Math.min(MAX_COPIES_PER_DECK, limit))
}

function getCopyLimitLabel(cardKey) {
  const ownedCount = getOwnedCount(cardKey)
  const banlistLimit = getBanlistLimit(cardKey)

  if (banlistLimit === 0) {
    return `Forbidden in ${formatBanlistLabel(activeBanlistFile)}`
  }

  if (banlistLimit < Math.min(MAX_COPIES_PER_DECK, ownedCount)) {
    return `Limited ${banlistLimit} in ${formatBanlistLabel(activeBanlistFile)}`
  }

  if (ownedCount < MAX_COPIES_PER_DECK) {
    return `Owned x${ownedCount}`
  }

  return `Max ${MAX_COPIES_PER_DECK}`
}

function getDeckCopyLimit(cardKey) {
  const ownedCount = getOwnedCount(cardKey)
  if (ownedCount <= 0) return 0
  return Math.max(0, Math.min(MAX_COPIES_PER_DECK, ownedCount, getBanlistLimit(cardKey)))
}

function getGeneralDeckCopyLimit(cardKey) {
  const ownedCount = getOwnedCount(cardKey)
  if (ownedCount <= 0) return 0
  return Math.max(0, Math.min(MAX_COPIES_PER_DECK, ownedCount))
}

function isLoggedIn() {
  return !!currentUser
}

function getAllowedPlayers() {
  return Array.isArray(currentUser?.allowedPlayers) ? currentUser.allowedPlayers : []
}

function getPlayerLabel(playerKey) {
  return PLAYERS.find((player) => player.key === playerKey)?.label || playerKey
}

function parseMultiSearchTerms(value) {
  return safeText(value)
    .toLowerCase()
    .split("|")
    .map((term) => term.trim())
    .filter(Boolean)
}

function swapCardImageFolder(path, folderName) {
  const text = safeText(path)
  if (!text) return ""

  if (text.includes("/images/cards_small/")) {
    return text.replace("/images/cards_small/", `/images/${folderName}/`)
  }

  if (text.includes("/images/cards/")) {
    return text.replace("/images/cards/", `/images/${folderName}/`)
  }

  if (text.includes("images/cards_small/")) {
    return text.replace("images/cards_small/", `images/${folderName}/`)
  }

  if (text.includes("images/cards/")) {
    return text.replace("images/cards/", `images/${folderName}/`)
  }

  return text
}

async function loadMe() {
  const resp = await fetch("/api/me", {
    cache: "no-store",
    credentials: "same-origin"
  })

  if (!resp.ok) {
    throw new Error("Failed to load session.")
  }

  const data = await resp.json()
  currentUser = data?.loggedIn && data?.user ? data.user : null
}

function resetPreview() {
  previewCardKey = ""
  previewTitle.textContent = "Select a card"
  previewSubtitle.textContent = "Left click a card to preview it here. Right click a card to add it to your deck."
  previewImage.src = ""
  previewImage.alt = ""
  previewImage.hidden = true
  previewEmpty.hidden = false
  previewEmpty.textContent = "No card selected yet."
}

function refreshPreviewPanel() {
  if (!previewCardKey) {
    resetPreview()
    return
  }

  const row = poolByKey.get(previewCardKey)
  if (!row) {
    resetPreview()
    return
  }

  const imageUrl = getBinderModalImage(row)
  previewTitle.textContent = safeText(row.name) || "Unknown Card"
  previewSubtitle.textContent = `Owned x${safeText(row.quantity) || "1"} • ${getCopyLimitLabel(previewCardKey)} • ${getRemainingCount(previewCardKey)} left to add`

  if (imageUrl) {
    previewImage.src = imageUrl
    previewImage.alt = safeText(row.name) || "Card image"
    previewImage.hidden = false
    previewEmpty.hidden = true
  } else {
    previewImage.src = ""
    previewImage.alt = ""
    previewImage.hidden = true
    previewEmpty.hidden = false
    previewEmpty.textContent = "No image available for this card."
  }
}

function showPreviewForRow(row) {
  if (!row) {
    resetPreview()
    return
  }

  previewCardKey = normalizeCardId(row._deckKey || row.cardid || row.cardId || row.id || row.passcode)
  refreshPreviewPanel()
}

async function logout() {
  await fetch("/auth/logout", {
    method: "POST",
    credentials: "same-origin"
  })

  currentUser = null
  currentPlayer = ""
  binderRows = []
  currentBinderRows = []
  poolRows = []
  poolByKey = new Map()
  deckState = { main: [], extra: [] }
  artworkPrefs = {}
  artworkPrefsPlayer = ""
  resetPreview()
  renderAuth()
  buildTabs()
  renderAccessState()
  renderAll()
  setStatus("Logged out.")
}

function renderAuth() {
  const hasAccess = isLoggedIn() && !!getAllowedPlayers().length

  if (isLoggedIn()) {
    if (loginButton) loginButton.style.display = "none"
    if (logoutButton) logoutButton.style.display = "inline-flex"
    if (exportButton) exportButton.hidden = !hasAccess
    if (clearDeckButton) clearDeckButton.hidden = !hasAccess
    if (exportHint) exportHint.hidden = !hasAccess
  } else {
    if (loginButton) loginButton.style.display = "inline-flex"
    if (logoutButton) logoutButton.style.display = "none"
    if (exportButton) exportButton.hidden = true
    if (clearDeckButton) clearDeckButton.hidden = true
    if (exportHint) exportHint.hidden = true
  }
}

function buildTabs() {
  playerTabs.innerHTML = ""

  const allowedPlayers = getAllowedPlayers()
  const visiblePlayers = PLAYERS.filter((player) => allowedPlayers.includes(player.key))

  if (!visiblePlayers.length) {
    currentPlayer = ""
    return
  }

  if (!visiblePlayers.some((player) => player.key === currentPlayer)) {
    currentPlayer = visiblePlayers[0].key
  }

  for (const player of visiblePlayers) {
    const btn = document.createElement("button")
    btn.className = `settings-player-tab${player.key === currentPlayer ? " is-active" : ""}`
    btn.type = "button"
    btn.textContent = player.label

    btn.addEventListener("click", async () => {
      if (player.key === currentPlayer) return
      currentPlayer = player.key
      resetPreview()
      buildTabs()
      await loadPlayerContext()
    })

    playerTabs.appendChild(btn)
  }
}

function renderAccessState() {
  if (deckAuthActions) deckAuthActions.hidden = !isLoggedIn()

  if (!isLoggedIn()) {
    accessNotice.hidden = false
    accessNotice.textContent = "Log in with Discord to load your private binder and build a deck."
    builderShell.hidden = true
    return
  }

  if (!getAllowedPlayers().length) {
    accessNotice.hidden = false
    accessNotice.textContent = "Your Discord account is logged in, but it is not mapped to any player binder yet."
    builderShell.hidden = true
    return
  }

  accessNotice.hidden = true
  builderShell.hidden = false
}

async function loadArtworkManifest() {
  if (Object.keys(artworkManifest).length) {
    return artworkManifest
  }

  const resp = await fetch("/data/generated/alt-artworks.json", {
    cache: "no-store"
  })

  if (!resp.ok) {
    throw new Error("Failed to load alt-artworks.json")
  }

  artworkManifest = await resp.json()
  artworkManifestByImageId = {}

  for (const [baseCardId, entry] of Object.entries(artworkManifest || {})) {
    const normalizedBaseId = normalizeCardId(baseCardId)

    if (normalizedBaseId) {
      artworkManifestByImageId[normalizedBaseId] = {
        baseCardId: normalizedBaseId,
        entry
      }
    }

    for (const option of entry?.options || []) {
      const normalizedImageId = normalizeCardId(option?.imageId)
      if (!normalizedImageId) continue

      artworkManifestByImageId[normalizedImageId] = {
        baseCardId: normalizedBaseId || normalizeCardId(baseCardId),
        entry
      }
    }
  }

  return artworkManifest
}

async function loadArtworkPrefsForPlayer(player) {
  const playerKey = String(player || "").trim().toLowerCase()

  if (!playerKey) {
    artworkPrefs = {}
    artworkPrefsPlayer = ""
    return artworkPrefs
  }

  if (artworkPrefsPlayer === playerKey) {
    return artworkPrefs
  }

  const resp = await fetch(`/api/artwork-prefs?player=${encodeURIComponent(playerKey)}`, {
    cache: "no-store",
    credentials: "same-origin"
  })

  if (!resp.ok) {
    throw new Error(`Failed to load artwork prefs for ${playerKey}`)
  }

  const data = await resp.json()
  artworkPrefs = data?.prefs || {}
  artworkPrefsPlayer = playerKey
  return artworkPrefs
}

function getArtworkLookupIds(row) {
  return [
    normalizeCardId(row?.cardid),
    normalizeCardId(row?.cardId),
    normalizeCardId(row?.image_id),
    normalizeCardId(row?.imageId),
    normalizeCardId(row?.id),
    normalizeCardId(row?.passcode)
  ].filter(Boolean)
}

function getPreferredArtworkUrl(row, folderName = "cards") {
  const lookupIds = getArtworkLookupIds(row)

  if (!lookupIds.length) {
    return ""
  }

  let baseCardId = ""
  let manifestEntry = null

  for (const lookupId of lookupIds) {
    const found = artworkManifestByImageId[lookupId]
    if (found?.entry) {
      baseCardId = normalizeCardId(found.baseCardId)
      manifestEntry = found.entry
      break
    }
  }

  if (!manifestEntry) {
    return ""
  }

  const prefLookupOrder = [baseCardId, ...lookupIds]
  let preferredImageId = ""

  for (const key of prefLookupOrder) {
    const saved = normalizeCardId(artworkPrefs?.[key])
    if (saved) {
      preferredImageId = saved
      break
    }
  }

  if (!preferredImageId) {
    return ""
  }

  const match = (manifestEntry.options || []).find(
    (option) => normalizeCardId(option?.imageId) === preferredImageId
  )

  const imagePath = safeText(match?.image)
  if (!imagePath) {
    return ""
  }

  return swapCardImageFolder(imagePath, folderName) || imagePath
}

function getCardImageId(row) {
  return safeText(row.cardid || row.cardId || row.id || row.passcode)
}

function getDefaultBinderPreviewImage(row) {
  const directImage = safeText(row.image)
  if (directImage) {
    return withImageVersion(
      swapCardImageFolder(directImage, "cards_small") || directImage
    )
  }

  const cardId = getCardImageId(row)
  return cardId ? withImageVersion(`/images/cards_small/${cardId}.jpg`) : ""
}

function getDefaultBinderModalImage(row) {
  const directImage = safeText(row.image)
  if (directImage) {
    return withImageVersion(
      swapCardImageFolder(directImage, "cards") || directImage
    )
  }

  const cardId = getCardImageId(row)
  return cardId ? withImageVersion(`/images/cards/${cardId}.jpg`) : ""
}

function getBinderPreviewImage(row) {
  const preferredImage = getPreferredArtworkUrl(row)
  if (preferredImage) {
    return withImageVersion(
      swapCardImageFolder(preferredImage, "cards_small") || preferredImage
    )
  }

  return getDefaultBinderPreviewImage(row)
}

function getBinderModalImage(row) {
  const preferredImage = getPreferredArtworkUrl(row)
  if (preferredImage) {
    return withImageVersion(
      swapCardImageFolder(preferredImage, "cards") || preferredImage
    )
  }

  return getDefaultBinderModalImage(row)
}

function getHighLevelType(row) {
  const type = safeText(row.type).toLowerCase()
  if (type.includes("monster")) return "Monster"
  if (type.includes("spell")) return "Spell"
  if (type.includes("trap")) return "Trap"
  return ""
}

function normalizeLinkArrow(value) {
  const normalized = safeText(value)
    .toLowerCase()
    .replace(/[_\s]+/g, "-")

  switch (normalized) {
    case "top-left":
    case "up-left":
    case "upleft":
      return "Top-Left"

    case "top":
    case "up":
      return "Top"

    case "top-right":
    case "up-right":
    case "upright":
      return "Top-Right"

    case "left":
      return "Left"

    case "right":
      return "Right"

    case "bottom-left":
    case "down-left":
    case "downleft":
      return "Bottom-Left"

    case "bottom":
    case "down":
      return "Bottom"

    case "bottom-right":
    case "down-right":
    case "downright":
      return "Bottom-Right"

    default:
      return ""
  }
}

function getRowLinkArrows(row) {
  const raw =
    row.linkmarkers ??
    row.linkMarkers ??
    row.link_arrows ??
    row.linkArrows ??
    []

  if (Array.isArray(raw)) {
    return raw.map(normalizeLinkArrow).filter(Boolean)
  }

  if (typeof raw === "string") {
    return raw
      .split(/[,|/]+/)
      .map((part) => normalizeLinkArrow(part))
      .filter(Boolean)
  }

  return []
}

function getSelectedSubtypeValues() {
  return Array.from(
    document.querySelectorAll('#filterSubtypes input[type="checkbox"]:checked')
  ).map((input) => input.value)
}

function getSelectedLinkArrowValues() {
  return Array.from(
    document.querySelectorAll('#filterLinkArrows input[type="checkbox"]:checked')
  ).map((input) => input.value)
}

function isMonsterFilterMode() {
  const selectedType = safeText(filterType.value)
  return selectedType === "" || selectedType === "Monster"
}

function isSpellFilterMode() {
  const selectedType = safeText(filterType.value)
  return selectedType === "" || selectedType === "Spell"
}

function isTrapFilterMode() {
  const selectedType = safeText(filterType.value)
  return selectedType === "" || selectedType === "Trap"
}

function isXyzMonster(row) {
  return safeText(row.type).toLowerCase().includes("xyz")
}

function isLinkMonster(row) {
  return safeText(row.type).toLowerCase().includes("link")
}

function syncFilterVisibility() {
  const showMonsterRows = isMonsterFilterMode()
  const showSpellRow = isSpellFilterMode()
  const showTrapRow = isTrapFilterMode()

  document.querySelectorAll(".monster-filter-row").forEach((row) => {
    row.classList.toggle("is-hidden", !showMonsterRows)
  })

  document.querySelectorAll(".spell-filter-row").forEach((row) => {
    row.classList.toggle("is-hidden", !showSpellRow)
  })

  document.querySelectorAll(".trap-filter-row").forEach((row) => {
    row.classList.toggle("is-hidden", !showTrapRow)
  })

  if (!showMonsterRows) {
    filterAttribute.value = ""
    filterRace.value = ""

    document.querySelectorAll('#filterSubtypes input[type="checkbox"]').forEach((input) => {
      input.checked = false
    })
    filterSubtypes.classList.add("is-disabled")

    filterAtkExact.value = ""
    filterAtkMin.value = ""
    filterAtkMax.value = ""
    filterDefExact.value = ""
    filterDefMin.value = ""
    filterDefMax.value = ""
    filterLevelExact.value = ""
    filterLevelMin.value = ""
    filterLevelMax.value = ""
    filterRankExact.value = ""
    filterRankMin.value = ""
    filterRankMax.value = ""
    filterLinkExact.value = ""
    filterLinkMin.value = ""
    filterLinkMax.value = ""
    filterScaleExact.value = ""
    filterScaleMin.value = ""
    filterScaleMax.value = ""

    document.querySelectorAll('#filterLinkArrows input[type="checkbox"]').forEach((input) => {
      input.checked = false
    })
    filterLinkArrows.classList.add("is-disabled")
  } else {
    filterSubtypes.classList.remove("is-disabled")
    filterLinkArrows.classList.remove("is-disabled")
  }

  if (!showSpellRow) {
    filterSpellType.value = ""
  }

  if (!showTrapRow) {
    filterTrapType.value = ""
  }
}

function getSortValue(row, sortKey) {
  switch (sortKey) {
    case "name":
      return safeText(row.name).toLowerCase()
    case "level":
      return isXyzMonster(row) ? null : toNumber(row.level)
    case "rank":
      return isXyzMonster(row) ? toNumber(row.level) : null
    case "link":
      return toNumber(row.linkval ?? row.linkVal)
    case "scale":
      return toNumber(row.scale)
    case "atk":
      return toNumber(row.atk)
    case "def":
      return toNumber(row.def)
    default:
      return safeText(row.name).toLowerCase()
  }
}

function compareSortValues(aValue, bValue, direction) {
  const aMissing = aValue === null || aValue === undefined || aValue === ""
  const bMissing = bValue === null || bValue === undefined || bValue === ""

  if (aMissing && bMissing) return 0
  if (aMissing) return 1
  if (bMissing) return -1

  if (typeof aValue === "string" || typeof bValue === "string") {
    const result = String(aValue).localeCompare(String(bValue), undefined, { sensitivity: "base" })
    return direction === "asc" ? result : -result
  }

  const result = aValue - bValue
  return direction === "asc" ? result : -result
}

function updateFiltersToggleButton() {
  const expanded = !binderFiltersCollapsed
  toggleFiltersButton.textContent = expanded ? "Hide filters" : "Show filters"
  toggleFiltersButton.title = expanded ? "Hide filters" : "Show filters"
  toggleFiltersButton.setAttribute("aria-expanded", String(expanded))
}

function setBinderFiltersCollapsed(collapsed) {
  binderFiltersCollapsed = collapsed
  binderFiltersPanel.classList.toggle("is-collapsed", collapsed)
  updateFiltersToggleButton()
}

function updateSortDirectionButton() {
  const ascending = binderSortDirection === "asc"
  binderSortDirectionButton.innerHTML = ascending ? "&uarr;" : "&darr;"
  binderSortDirectionButton.title = ascending ? "Ascending" : "Descending"
  binderSortDirectionButton.setAttribute("aria-label", ascending ? "Sorting ascending" : "Sorting descending")
}

function applyBinderFilters(rows) {
  const searchTerms = parseMultiSearchTerms(binderSearch.value)
  const selectedType = safeText(filterType.value)
  const selectedAttribute = safeText(filterAttribute.value).toUpperCase()
  const selectedRace = safeText(filterRace.value)
  const selectedSpellType = safeText(filterSpellType.value)
  const selectedTrapType = safeText(filterTrapType.value)
  const selectedSubtypes = getSelectedSubtypeValues()

  const atkExact = toNumber(filterAtkExact.value)
  const minAtk = toNumber(filterAtkMin.value)
  const maxAtk = toNumber(filterAtkMax.value)
  const defExact = toNumber(filterDefExact.value)
  const minDef = toNumber(filterDefMin.value)
  const maxDef = toNumber(filterDefMax.value)
  const levelExact = toNumber(filterLevelExact.value)
  const minLevel = toNumber(filterLevelMin.value)
  const maxLevel = toNumber(filterLevelMax.value)
  const rankExact = toNumber(filterRankExact.value)
  const minRank = toNumber(filterRankMin.value)
  const maxRank = toNumber(filterRankMax.value)
  const linkExact = toNumber(filterLinkExact.value)
  const minLink = toNumber(filterLinkMin.value)
  const maxLink = toNumber(filterLinkMax.value)
  const scaleExact = toNumber(filterScaleExact.value)
  const minScale = toNumber(filterScaleMin.value)
  const maxScale = toNumber(filterScaleMax.value)
  const selectedLinkArrows = getSelectedLinkArrowValues()

  const useMonsterFilters = isMonsterFilterMode()
  const useSpellFilters = isSpellFilterMode()
  const useTrapFilters = isTrapFilterMode()

  const filtered = rows.filter((row) => {
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
    ].map(safeText).join(" ").toLowerCase()

    const rowAttribute = safeText(row.attribute).toUpperCase()
    const rowType = safeText(row.type)
    const rowRace = safeText(row.race)

    const rawLevel = toNumber(row.level)
    const rowAtk = toNumber(row.atk)
    const rowDef = toNumber(row.def)
    const rowLevel = isXyzMonster(row) ? null : rawLevel
    const rowRank = isXyzMonster(row) ? rawLevel : null
    const rowLink = isLinkMonster(row) ? toNumber(row.linkval ?? row.linkVal) : null
    const rowScale = toNumber(row.scale)
    const rowLinkArrows = getRowLinkArrows(row)

    if (searchTerms.length > 0) {
      const matchesAnySearchTerm = searchTerms.some((term) => searchable.includes(term))
      if (!matchesAnySearchTerm) return false
    }

    if (selectedType && getHighLevelType(row) !== selectedType) return false

    if (useSpellFilters && selectedSpellType) {
      if (getHighLevelType(row) !== "Spell" || rowRace !== selectedSpellType) return false
    }

    if (useTrapFilters && selectedTrapType) {
      if (getHighLevelType(row) !== "Trap" || rowRace !== selectedTrapType) return false
    }

    if (useMonsterFilters && selectedAttribute && rowAttribute !== selectedAttribute) return false
    if (useMonsterFilters && selectedRace && rowRace !== selectedRace) return false

    if (useMonsterFilters && selectedSubtypes.length > 0) {
      const matchesAllSelectedSubtypes = selectedSubtypes.every((subtype) =>
        rowType.toLowerCase().includes(subtype.toLowerCase())
      )
      if (!matchesAllSelectedSubtypes) return false
    }

    if (useMonsterFilters && atkExact !== null && (rowAtk === null || rowAtk !== atkExact)) return false
    if (useMonsterFilters && minAtk !== null && (rowAtk === null || rowAtk < minAtk)) return false
    if (useMonsterFilters && maxAtk !== null && (rowAtk === null || rowAtk > maxAtk)) return false

    if (useMonsterFilters && defExact !== null && (rowDef === null || rowDef !== defExact)) return false
    if (useMonsterFilters && minDef !== null && (rowDef === null || rowDef < minDef)) return false
    if (useMonsterFilters && maxDef !== null && (rowDef === null || rowDef > maxDef)) return false

    if (useMonsterFilters && levelExact !== null && (rowLevel === null || rowLevel !== levelExact)) return false
    if (useMonsterFilters && minLevel !== null && (rowLevel === null || rowLevel < minLevel)) return false
    if (useMonsterFilters && maxLevel !== null && (rowLevel === null || rowLevel > maxLevel)) return false

    if (useMonsterFilters && rankExact !== null && (rowRank === null || rowRank !== rankExact)) return false
    if (useMonsterFilters && minRank !== null && (rowRank === null || rowRank < minRank)) return false
    if (useMonsterFilters && maxRank !== null && (rowRank === null || rowRank > maxRank)) return false

    if (useMonsterFilters && linkExact !== null && (rowLink === null || rowLink !== linkExact)) return false
    if (useMonsterFilters && minLink !== null && (rowLink === null || rowLink < minLink)) return false
    if (useMonsterFilters && maxLink !== null && (rowLink === null || rowLink > maxLink)) return false

    if (useMonsterFilters && scaleExact !== null && (rowScale === null || rowScale !== scaleExact)) return false
    if (useMonsterFilters && minScale !== null && (rowScale === null || rowScale < minScale)) return false
    if (useMonsterFilters && maxScale !== null && (rowScale === null || rowScale > maxScale)) return false

    if (useMonsterFilters && selectedLinkArrows.length > 0) {
      if (!isLinkMonster(row)) return false
      const matchesAllSelectedArrows = selectedLinkArrows.every((arrow) => rowLinkArrows.includes(arrow))
      if (!matchesAllSelectedArrows) return false
    }

    return true
  })

  filtered.sort((a, b) => {
    const result = compareSortValues(
      getSortValue(a, binderSort.value),
      getSortValue(b, binderSort.value),
      binderSortDirection
    )

    if (result !== 0) return result

    return safeText(a.name).localeCompare(safeText(b.name), undefined, {
      sensitivity: "base"
    })
  })

  return filtered
}

function isExtraDeckCard(row) {
  const type = safeText(row?.type).toLowerCase()
  return type.includes("fusion") || type.includes("synchro") || type.includes("xyz") || type.includes("link")
}

function defaultDeckSectionForRow(row) {
  return isExtraDeckCard(row) ? "extra" : "main"
}

function canCardGoToSection(row, section) {
  if (!row) return false
  if (section === "extra") return isExtraDeckCard(row)
  if (section === "main") return !isExtraDeckCard(row)
  return false
}

function resolveTargetSection(row, requestedTarget = "") {
  if (requestedTarget === "main" || requestedTarget === "extra") {
    return requestedTarget
  }

  return defaultDeckSectionForRow(row)
}

function getUsedCount(cardKey) {
  return deckState.main.filter((value) => value === cardKey).length
    + deckState.extra.filter((value) => value === cardKey).length
}

function getOwnedCount(cardKey) {
  return toNumber(poolByKey.get(cardKey)?.quantity) || 0
}

function getRemainingCount(cardKey) {
  return Math.max(getDeckCopyLimit(cardKey) - getUsedCount(cardKey), 0)
}

function getAddBlockedReason(cardKey, requestedTarget = "") {
  const row = poolByKey.get(cardKey)
  if (!row) return "Card not found in binder"
  if (!normalizeCardId(cardKey)) return "Missing numeric card id"

  const section = resolveTargetSection(row, requestedTarget)
  if (!canCardGoToSection(row, section)) {
    if (section === "extra") return "This card cannot go to Extra"
    if (section === "main") return "This card belongs in Extra"
    return "This card cannot go there"
  }

  if (deckState[section].length >= DECK_LIMITS[section]) return `${section[0].toUpperCase()}${section.slice(1)} deck is full`

  const ownedCount = getOwnedCount(cardKey)
  const banlistLimit = getBanlistLimit(cardKey)
  const totalUsed = getUsedCount(cardKey)

  if (banlistLimit <= 0) {
    return `${safeText(row.name) || "This card"} is forbidden in ${formatBanlistLabel(activeBanlistFile)}`
  }

  if (totalUsed >= getDeckCopyLimit(cardKey)) {
    if (banlistLimit < Math.min(MAX_COPIES_PER_DECK, ownedCount)) {
      return `Limited to ${banlistLimit} cop${banlistLimit === 1 ? "y" : "ies"} in ${formatBanlistLabel(activeBanlistFile)}`
    }

    if (ownedCount < MAX_COPIES_PER_DECK) {
      return "No copies left"
    }

    return `Max ${MAX_COPIES_PER_DECK} copies per deck`
  }

  return ""
}

function saveDeckState() {
  const key = getStorageKey()
  if (!key) return

  try {
    localStorage.setItem(key, JSON.stringify(deckState))
  } catch {
  }
}

function sanitizeDeckState(candidate) {
  const next = {
    main: [],
    extra: []
  }

  const remainingByKey = new Map(
    poolRows.map((row) => [row._deckKey, getGeneralDeckCopyLimit(row._deckKey)])
  )

  for (const section of ["main", "extra"]) {
    const values = Array.isArray(candidate?.[section]) ? candidate[section] : []

    for (const rawKey of values) {
      const cardKey = normalizeCardId(rawKey)
      const row = poolByKey.get(cardKey)
      if (!row) continue
      if (!canCardGoToSection(row, section)) continue
      if ((remainingByKey.get(cardKey) || 0) <= 0) continue
      if (next[section].length >= DECK_LIMITS[section]) continue

      next[section].push(cardKey)
      remainingByKey.set(cardKey, (remainingByKey.get(cardKey) || 0) - 1)
    }
  }

  deckState = next
}

function loadStoredDeckState() {
  const key = getStorageKey()
  if (!key) {
    deckState = { main: [], extra: [] }
    return
  }

  try {
    const raw = localStorage.getItem(key)
    if (!raw) {
      deckState = { main: [], extra: [] }
      return
    }

    const parsed = JSON.parse(raw)
    sanitizeDeckState(parsed)
  } catch {
    deckState = { main: [], extra: [] }
  }
}

function buildPoolRows(rows) {
  const byKey = new Map()

  for (const rawRow of rows || []) {
    const cardKey = normalizeCardId(
      rawRow?.cardid ?? rawRow?.cardId ?? rawRow?.id ?? rawRow?.passcode ?? rawRow?.image_id ?? rawRow?.imageId
    )

    if (!cardKey) continue

    const quantity = toNumber(rawRow?.quantity) || 1
    const setCode = safeText(rawRow?.set_code)

    if (!byKey.has(cardKey)) {
      byKey.set(cardKey, {
        ...rawRow,
        _deckKey: cardKey,
        quantity,
        _setCodes: setCode ? new Set([setCode]) : new Set(),
        _duplicateRows: 1
      })
      continue
    }

    const existing = byKey.get(cardKey)
    existing.quantity = (toNumber(existing.quantity) || 0) + quantity
    existing._duplicateRows += 1
    if (setCode) existing._setCodes.add(setCode)
  }

  poolRows = Array.from(byKey.values()).map((row) => {
    const setCodes = Array.from(row._setCodes || [])
    const primarySetCode = setCodes[0] || safeText(row.set_code)

    return {
      ...row,
      set_code: primarySetCode,
      _setCodes: setCodes
    }
  })

  poolByKey = new Map(poolRows.map((row) => [row._deckKey, row]))
}

async function loadPlayerContext() {
  if (!currentPlayer) {
    binderRows = []
    currentBinderRows = []
    poolRows = []
    poolByKey = new Map()
    deckState = { main: [], extra: [] }
    resetPreview()
    renderAll()
    return
  }

  setStatus(`Loading ${getPlayerLabel(currentPlayer)} binder...`)
  binderStatus.textContent = "Loading your binder..."
  binderGrid.innerHTML = ""

  const [binderResp] = await Promise.all([
    fetch(`/api/deckbuilder/binder?player=${encodeURIComponent(currentPlayer)}`, {
      cache: "no-store",
      credentials: "same-origin"
    }),
    loadArtworkManifest().catch(() => ({})),
    loadArtworkPrefsForPlayer(currentPlayer).catch(() => {
      artworkPrefs = {}
      artworkPrefsPlayer = currentPlayer
      return {}
    }),
    loadBanlistData(deckBanlist.value || activeBanlistFile).catch(() => new Map())
  ])

  if (binderResp.status === 401) {
    currentUser = null
    renderAuth()
    buildTabs()
    renderAccessState()
    setStatus("Log in with Discord to use the deck builder.")
    resetPreview()
    return
  }

  const data = await binderResp.json().catch(() => ({}))

  if (!binderResp.ok) {
    throw new Error(data?.error || "Failed to load binder.")
  }

  binderRows = Array.isArray(data?.binder) ? data.binder : []
  currentPlayer = safeText(data?.player) || currentPlayer
  buildTabs()
  buildPoolRows(binderRows)
  currentBinderRows = poolRows.slice()
  loadStoredDeckState()

  if (!previewCardKey || !poolByKey.has(previewCardKey)) {
    resetPreview()
  }

  setStatus(`Loaded ${getPlayerLabel(currentPlayer)} binder • ${formatBanlistLabel(activeBanlistFile)}.`)
  renderAll()
}

function addCardToSection(cardKey, requestedTarget = "") {
  const row = poolByKey.get(cardKey)
  const blockReason = getAddBlockedReason(cardKey, requestedTarget)
  if (blockReason) {
    setStatus(blockReason)
    return false
  }

  const section = resolveTargetSection(row, requestedTarget)
  deckState[section].push(cardKey)
  saveDeckState()
  renderAll()
  setStatus(`Added ${safeText(row?.name) || "card"} to ${section === "extra" ? "Extra" : "Main"}.`)
  return true
}

function removeOneCardFromSection(section, cardKey) {
  const index = deckState[section].indexOf(cardKey)
  if (index === -1) return
  deckState[section].splice(index, 1)
  saveDeckState()
  renderAll()
}

function removeAllCardCopiesFromSection(section, cardKey) {
  deckState[section] = deckState[section].filter((value) => value !== cardKey)
  saveDeckState()
  renderAll()
}

function clearDeckState() {
  deckState = { main: [], extra: [] }
  saveDeckState()
  renderAll()
}

function renderPool() {
  const filtered = applyBinderFilters(currentBinderRows)
  const totalCopies = filtered.reduce((sum, row) => sum + (toNumber(row.quantity) || 1), 0)

  binderStatus.textContent = `Showing ${totalCopies} copies across ${filtered.length} unique cards`
  binderGrid.innerHTML = ""

  if (previewCardKey && !poolByKey.has(previewCardKey)) {
    resetPreview()
  }

  if (!filtered.length) {
    binderGrid.innerHTML = '<p class="muted">No cards matched your filters.</p>'
    return
  }

  filtered.forEach((row) => {
    const cardKey = row._deckKey
    const previewImageUrl = getBinderPreviewImage(row)
    const usedCount = getUsedCount(cardKey)
    const remainingCount = getRemainingCount(cardKey)

    const card = document.createElement("article")
    card.className = `binder-card deckbuilder-pool-card${cardKey === previewCardKey ? " is-previewed" : ""}`
    card.tabIndex = 0
    card.setAttribute("role", "button")
    card.setAttribute("aria-label", `${safeText(row.name) || "Card"}. Left click to preview, right click to add.`)
    card.title = "Left click to preview. Right click to add."

    card.innerHTML = `
      <div class="binder-image-wrap">
        ${previewImageUrl
          ? `<img src="${previewImageUrl}" alt="${safeText(row.name)}" class="binder-image" loading="lazy" />`
          : '<div class="binder-no-image">No Image</div>'}
        <span class="binder-qty">x${safeText(row.quantity) || "1"}</span>
        ${usedCount > 0 ? `<span class="deckbuilder-used-pill">Used ${usedCount}</span>` : ""}
      </div>
      <div class="deckbuilder-card-copy">
        <div class="deckbuilder-card-title" title="${safeText(row.name)}">${safeText(row.name) || "Unknown Card"}</div>
        <div class="deckbuilder-card-subtitle">${remainingCount} left to add • ${getCopyLimitLabel(cardKey)}</div>
      </div>
    `

    card.addEventListener("click", () => {
      showPreviewForRow(row)
      renderPool()
    })

    card.addEventListener("contextmenu", (event) => {
      event.preventDefault()
      addCardToSection(cardKey)
    })

    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault()
        showPreviewForRow(row)
        renderPool()
      }

      if (event.key === " ") {
        event.preventDefault()
        addCardToSection(cardKey)
      }
    })

    binderGrid.appendChild(card)
  })
}

function collapseSection(section) {
  const counts = new Map()

  for (const cardKey of deckState[section]) {
    counts.set(cardKey, (counts.get(cardKey) || 0) + 1)
  }

  return Array.from(counts.entries())
    .map(([cardKey, count]) => ({
      cardKey,
      count,
      row: poolByKey.get(cardKey)
    }))
    .filter((item) => item.row)
    .sort((a, b) => safeText(a.row.name).localeCompare(safeText(b.row.name), undefined, { sensitivity: "base" }))
}

function renderSection(section, container, labelElement) {
  const items = collapseSection(section)
  const totalCount = deckState[section].length
  const sectionName = section[0].toUpperCase() + section.slice(1)

  labelElement.textContent = `${totalCount} card${totalCount === 1 ? "" : "s"}`
  container.innerHTML = ""

  if (!items.length) {
    container.innerHTML = `<div class="deckbuilder-section-empty">No cards in ${sectionName.toLowerCase()} yet.</div>`
    return
  }

  items.forEach(({ cardKey, count, row }) => {
    const previewImageUrl = getBinderPreviewImage(row)
    const canAddMore = !getAddBlockedReason(cardKey, section)
    const item = document.createElement("div")
    item.className = "deckbuilder-section-item"

    item.innerHTML = `
      <button type="button" class="deckbuilder-section-preview" data-action="preview">
        ${previewImageUrl
          ? `<img src="${previewImageUrl}" alt="${safeText(row.name)}" class="deckbuilder-section-thumb" loading="lazy" />`
          : '<span class="deckbuilder-section-thumb deckbuilder-section-thumb-empty">No image</span>'}
      </button>
      <div class="deckbuilder-section-copy">
        <div class="deckbuilder-section-title" title="${safeText(row.name)}">${safeText(row.name) || "Unknown Card"}</div>
        <div class="deckbuilder-section-subtitle">Owned x${safeText(row.quantity) || "1"} • ${getCopyLimitLabel(cardKey)}</div>
      </div>
      <div class="deckbuilder-section-controls">
        <button type="button" class="deckbuilder-control-button" data-action="minus">-</button>
        <span class="deckbuilder-section-count">${count}</span>
        <button type="button" class="deckbuilder-control-button" data-action="plus" ${canAddMore ? "" : "disabled"}>+</button>
      </div>
    `

    item.querySelector('[data-action="preview"]').addEventListener("click", () => {
      showPreviewForRow(row)
      renderPool()
    })

    item.querySelector('[data-action="minus"]').addEventListener("click", () => {
      removeOneCardFromSection(section, cardKey)
    })

    item.querySelector('[data-action="plus"]').addEventListener("click", () => {
      addCardToSection(cardKey, section)
    })

    container.appendChild(item)
  })
}

function getCardsOverCurrentCopyLimit() {
  return poolRows.filter((row) => getUsedCount(row._deckKey) > getDeckCopyLimit(row._deckKey))
}

function renderSummary() {
  const mainTotal = deckState.main.length
  const extraTotal = deckState.extra.length
  const totalUsed = mainTotal + extraTotal

  const warnings = []
  if (mainTotal < 40) warnings.push("Main is under 40")
  if (mainTotal > 60) warnings.push("Main is over 60")
  if (extraTotal > 15) warnings.push("Extra is over 15")

  const overLimitCards = getCardsOverCurrentCopyLimit()
  if (overLimitCards.length) {
    warnings.push(`${overLimitCards.length} card${overLimitCards.length === 1 ? " is" : "s are"} over ${formatBanlistLabel(activeBanlistFile)} limits`)
  }

  if (!totalUsed) {
    exportHint.textContent = `Your draft is empty • ${formatBanlistLabel(activeBanlistFile)}`
  } else if (warnings.length) {
    exportHint.textContent = warnings.join(" | ")
  } else {
    exportHint.textContent = `Ready to export ${getPlayerLabel(currentPlayer)}.ydk • ${formatBanlistLabel(activeBanlistFile)}`
  }
}

function buildYdkText() {
  const mainIds = deckState.main.map(formatYdkCardId).filter(Boolean)
  const extraIds = deckState.extra.map(formatYdkCardId).filter(Boolean)

  return [
    `#created by ${getPlayerLabel(currentPlayer) || "Prog with the Bois"}`,
    "#main",
    ...mainIds,
    "#extra",
    ...extraIds,
    "!side",
    ""
  ].join("\n")
}

function exportDeck() {
  const ydk = buildYdkText()
  const safeName = safeText(currentPlayer || "deck")
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "deck"

  const blob = new Blob([ydk], { type: "text/plain;charset=utf-8" })
  const href = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = href
  anchor.download = `${safeName}.ydk`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(href)
  setStatus(`Exported ${safeName}.ydk`)
}

function renderAll() {
  refreshPreviewPanel()
  renderSummary()
  renderPool()
  renderSection("main", mainList, mainSectionLabel)
  renderSection("extra", extraList, extraSectionLabel)
}

binderSearch.addEventListener("input", () => renderPool())
filterType.addEventListener("change", () => {
  syncFilterVisibility()
  renderPool()
})
filterAttribute.addEventListener("change", () => renderPool())
filterRace.addEventListener("change", () => renderPool())
filterSpellType.addEventListener("change", () => renderPool())
filterTrapType.addEventListener("change", () => renderPool())
filterSubtypes.addEventListener("change", (event) => {
  if (event.target.matches('input[type="checkbox"]')) renderPool()
})
filterAtkExact.addEventListener("input", () => renderPool())
filterAtkMin.addEventListener("input", () => renderPool())
filterAtkMax.addEventListener("input", () => renderPool())
filterDefExact.addEventListener("input", () => renderPool())
filterDefMin.addEventListener("input", () => renderPool())
filterDefMax.addEventListener("input", () => renderPool())
filterLevelExact.addEventListener("input", () => renderPool())
filterLevelMin.addEventListener("input", () => renderPool())
filterLevelMax.addEventListener("input", () => renderPool())
filterRankExact.addEventListener("input", () => renderPool())
filterRankMin.addEventListener("input", () => renderPool())
filterRankMax.addEventListener("input", () => renderPool())
filterLinkExact.addEventListener("input", () => renderPool())
filterLinkMin.addEventListener("input", () => renderPool())
filterLinkMax.addEventListener("input", () => renderPool())
filterScaleExact.addEventListener("input", () => renderPool())
filterScaleMin.addEventListener("input", () => renderPool())
filterScaleMax.addEventListener("input", () => renderPool())
filterLinkArrows.addEventListener("change", (event) => {
  if (event.target.matches('input[type="checkbox"]')) renderPool()
})

binderSort.addEventListener("change", () => renderPool())
binderSortDirectionButton.addEventListener("click", () => {
  binderSortDirection = binderSortDirection === "asc" ? "desc" : "asc"
  updateSortDirectionButton()
  renderPool()
})
toggleFiltersButton.addEventListener("click", () => {
  setBinderFiltersCollapsed(!binderFiltersCollapsed)
})

deckBanlist.addEventListener("change", async () => {
  await loadBanlistData(deckBanlist.value)
  renderAll()
  setStatus(`Using ${formatBanlistLabel(activeBanlistFile)} banlist.`)
})

logoutButton.addEventListener("click", logout)

clearDeckButton.addEventListener("click", () => {
  const totalCards = deckState.main.length + deckState.extra.length
  if (!totalCards) return
  if (window.confirm("Clear the whole draft?")) {
    clearDeckState()
    setStatus("Cleared current draft.")
  }
})

exportButton.addEventListener("click", () => {
  exportDeck()
})

async function init() {
  try {
    resetPreview()
    await loadMe()
    renderAuth()
    buildTabs()
    renderAccessState()
    syncFilterVisibility()
    updateSortDirectionButton()
    setBinderFiltersCollapsed(binderFiltersCollapsed)
    await loadBanlistManifest()
    await loadBanlistData(deckBanlist.value || activeBanlistFile)

    if (currentPlayer) {
      await loadPlayerContext()
    } else if (isLoggedIn()) {
      setStatus("Logged in, but no binder is assigned to this Discord account.")
      renderAll()
    } else {
      setStatus(`Log in with Discord to build a deck from your binder • ${formatBanlistLabel(activeBanlistFile)}.`)
      renderAll()
    }
  } catch (error) {
    console.error(error)
    setStatus(error?.message || "Failed to load deck builder.")
  }
}

init()
