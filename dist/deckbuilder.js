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
let banlistManifestLoaded = false
let banlistTextCache = new Map()
let deckUsageByKey = new Map()
let currentPoolRenderToken = 0
const POOL_RENDER_CHUNK_SIZE = 36
const POOL_PAGE_SIZE = 20
let currentPoolPage = 1
let currentFilteredPoolRows = []
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
const previewTags = document.getElementById("previewTags")
const previewStatsSection = document.getElementById("previewStatsSection")
const previewStats = document.getElementById("previewStats")
const previewTextSection = document.getElementById("previewTextSection")
const previewDescription = document.getElementById("previewDescription")

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
const binderPager = document.getElementById("binderPager")
const binderPrevPage = document.getElementById("binderPrevPage")
const binderPageInfo = document.getElementById("binderPageInfo")
const binderNextPage = document.getElementById("binderNextPage")

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

function debounce(fn, delay = 140) {
  let timer = null

  return (...args) => {
    window.clearTimeout(timer)
    timer = window.setTimeout(() => fn(...args), delay)
  }
}

function scheduleChunk(callback) {
  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(() => callback(), { timeout: 120 })
    return
  }

  window.setTimeout(callback, 16)
}

function displayValue(value, fallback = "—") {
  if (value === null || value === undefined) return fallback
  const text = String(value).trim()
  return text ? text : fallback
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
  if (banlistManifestLoaded) return

  try {
    const res = await fetch(BANLIST_MANIFEST_PATH, { cache: "force-cache" })
    if (!res.ok) throw new Error("Failed to load banlist manifest")

    const manifest = await res.json()
    const files = Array.isArray(manifest.files) ? manifest.files : []
    const defaultFile = safeText(manifest.default) || FALLBACK_BANLIST_FILE

    setBanlistOptions(files, defaultFile)
  } catch {
    setBanlistOptions([FALLBACK_BANLIST_FILE], FALLBACK_BANLIST_FILE)
  } finally {
    banlistManifestLoaded = true
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

    const match = line.match(/^(\d+)\s+(\d+)\b/)
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

  if (banlistTextCache.has(selectedFile)) {
    banlistLimitById = parseBanlistConfig(banlistTextCache.get(selectedFile))
    refreshBanlistStateForPoolRows()
    return
  }

  try {
    const res = await fetch(`${BANLISTS_BASE_PATH}/${encodeURIComponent(selectedFile)}`, {
      cache: "force-cache"
    })

    if (!res.ok) throw new Error("Failed to load banlist")

    const text = await res.text()
    banlistTextCache.set(selectedFile, text)
    banlistLimitById = parseBanlistConfig(text)
  } catch {
    banlistLimitById = new Map()
  }

  refreshBanlistStateForPoolRows()
}

function getStorageKey() {
  return currentPlayer ? `${STORAGE_PREFIX}${currentPlayer}` : ""
}

function getBanlistStatusForRow(row) {
  const possibleIds = [
    row?.cardid,
    row?.cardId,
    row?.id,
    row?.passcode,
    row?._deckKey
  ]

  for (const value of possibleIds) {
    const normalized = normalizeCardId(value)
    if (normalized && banlistLimitById.has(normalized)) {
      const limit = Number(banlistLimitById.get(normalized))
      if (limit === 0 || limit === 1 || limit === 2) return limit
    }
  }

  return null
}

function getBanlistIconForRow(row) {
  const status = row?._banlistStatus ?? getBanlistStatusForRow(row)

  if (status === 0) return "images/banlist/banned.png"
  if (status === 1) return "images/banlist/limited1.png"
  if (status === 2) return "images/banlist/limited2.png"

  return ""
}

function getBanlistLabelForRow(row) {
  const status = row?._banlistStatus ?? getBanlistStatusForRow(row)

  if (status === 0) return "Forbidden"
  if (status === 1) return "Limited"
  if (status === 2) return "Semi-Limited"

  return ""
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
  const banlistName = formatBanlistLabel(activeBanlistFile)

  if (banlistLimit === 0) {
    return `Forbidden in ${banlistName}`
  }

  if (banlistLimit === 1 || banlistLimit === 2) {
    return `Limited ${banlistLimit} in ${banlistName}`
  }

  if (ownedCount >= MAX_COPIES_PER_DECK) {
    return `Max x${MAX_COPIES_PER_DECK}`
  }

  return `Owned x${ownedCount}`
}

function rebuildDeckUsageIndex() {
  const next = new Map()

  for (const section of ["main", "extra"]) {
    for (const cardKey of deckState[section] || []) {
      next.set(cardKey, (next.get(cardKey) || 0) + 1)
    }
  }

  deckUsageByKey = next
}

function refreshBanlistStateForPoolRows() {
  for (const row of poolRows) {
    row._banlistStatus = getBanlistStatusForRow(row)
    row._banlistIcon = getBanlistIconForRow(row)
    row._banlistLabel = getBanlistLabelForRow(row)
    row._deckCopyLimit = getDeckCopyLimit(row._deckKey)
  }
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

function syncPreviewSelection() {
  binderGrid.querySelectorAll(".deckbuilder-pool-card.is-previewed").forEach((card) => {
    card.classList.remove("is-previewed")
  })

  if (!previewCardKey) return

  const activeCard = binderGrid.querySelector(`[data-card-key="${previewCardKey}"]`)
  if (activeCard) activeCard.classList.add("is-previewed")
}

function resetPreviewCollections() {
  previewTags.innerHTML = ""
  previewTags.hidden = true
  previewStats.innerHTML = ""
  previewStatsSection.hidden = true
  previewDescription.textContent = ""
  previewTextSection.hidden = true
}

function getPreviewBadgeValues(row) {
  const values = []
  const highLevelType = safeText(row?._highLevelType || getHighLevelType(row))
  const attribute = safeText(row?._rowAttributeUpper || row?.attribute).toUpperCase()
  const race = safeText(row?._rowRace || row?.race)
  const sectionLabel = defaultDeckSectionForRow(row) === "extra" ? "Extra Deck" : "Main Deck"
  const banlistLabel = getBanlistLabelForRow(row)

  if (highLevelType) values.push(highLevelType)
  if (attribute) values.push(attribute)
  if (race) values.push(race)
  values.push(sectionLabel)
  if (banlistLabel) values.push(banlistLabel)

  return values
}

function getPreviewInfoItems(row) {
  const items = []
  const highLevelType = safeText(row?._highLevelType || getHighLevelType(row))
  const typeText = safeText(row?._rowType || row?.type)
  const raceText = safeText(row?._rowRace || row?.race)
  const attributeText = safeText(row?._rowAttributeUpper || row?.attribute).toUpperCase()
  const levelValue = row?._levelNum ?? toNumber(row?.level)
  const rankValue = row?._rankNum ?? toNumber(row?.rank ?? row?.level)
  const linkValue = row?._linkNum ?? toNumber(row?.linkval ?? row?.linkVal)
  const scaleValue = row?._scaleNum ?? toNumber(row?.scale)
  const linkArrows = Array.isArray(row?._linkArrows) ? row._linkArrows : getRowLinkArrows(row)

  items.push({ label: "Card Type", value: typeText || highLevelType || "—" })

  if (attributeText) {
    items.push({ label: "Attribute", value: attributeText })
  }

  if (raceText) {
    items.push({ label: highLevelType === "Monster" ? "Monster Type" : "Property", value: raceText })
  }

  if (linkValue !== null) {
    items.push({ label: "Link", value: displayValue(linkValue) })
  } else if (rankValue !== null && isXyzMonster(row)) {
    items.push({ label: "Rank", value: displayValue(rankValue) })
  } else if (levelValue !== null) {
    items.push({ label: "Level", value: displayValue(levelValue) })
  }

  if (highLevelType === "Monster") {
    items.push({ label: "ATK", value: displayValue(row?.atk) })

    if (!isLinkMonster(row)) {
      items.push({ label: "DEF", value: displayValue(row?.def) })
    }
  }

  if (scaleValue !== null) {
    items.push({ label: "Scale", value: displayValue(scaleValue) })
  }

  if (linkArrows.length) {
    items.push({ label: "Arrows", value: linkArrows.join(", ") })
  }

  if (safeText(row?.archetype)) {
    items.push({ label: "Archetype", value: safeText(row.archetype) })
  }

  items.push({ label: "Owned", value: `x${safeText(row?.quantity) || "1"}` })
  items.push({ label: "Deck Limit", value: getCopyLimitLabel(previewCardKey) })

  return items.filter((item) => safeText(item.value))
}

function renderPreviewBadges() {
  previewTags.innerHTML = ""
  previewTags.hidden = true
}

function renderPreviewInfo(row) {
  const items = getPreviewInfoItems(row)
  previewStats.innerHTML = ""

  if (!items.length) {
    previewStatsSection.hidden = true
  } else {
    const fragment = document.createDocumentFragment()

    items.forEach(({ label, value }) => {
      const stat = document.createElement("div")
      stat.className = "deckbuilder-preview-stat"

      const term = document.createElement("span")
      term.className = "deckbuilder-preview-stat-label"
      term.textContent = label

      const detail = document.createElement("strong")
      detail.className = "deckbuilder-preview-stat-value"
      detail.textContent = value

      stat.append(term, detail)
      fragment.appendChild(stat)
    })

    previewStats.appendChild(fragment)
    previewStatsSection.hidden = false
  }

  const description = safeText(row?.desc)

  if (description) {
    previewDescription.textContent = description
  } else {
    previewDescription.textContent = "Description not available yet. Regenerate the binder data once to include full card text in this preview."
  }

  previewTextSection.hidden = false
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
  resetPreviewCollections()
  syncPreviewSelection()
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

  const imageUrl = row._previewImageLarge || getBinderModalImage(row)
  previewTitle.textContent = safeText(row.name) || "Unknown Card"
  previewSubtitle.textContent = getCopyLimitLabel(previewCardKey)
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

  renderPreviewBadges(row)
  renderPreviewInfo(row)
  syncPreviewSelection()
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
  rebuildDeckUsageIndex()
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
    cache: "force-cache"
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
      return row?._sortName ?? safeText(row?.name).toLowerCase()
    case "level":
      return row?._levelNum ?? (isXyzMonster(row) ? null : toNumber(row?.level))
    case "rank":
      return row?._rankNum ?? (isXyzMonster(row) ? toNumber(row?.rank ?? row?.level) : null)
    case "link":
      return row?._linkNum ?? toNumber(row?.linkval ?? row?.linkVal)
    case "scale":
      return row?._scaleNum ?? toNumber(row?.scale)
    case "atk":
      return row?._atkNum ?? toNumber(row?.atk)
    case "def":
      return row?._defNum ?? toNumber(row?.def)
    default:
      return row?._sortName ?? safeText(row?.name).toLowerCase()
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
  const selectedSubtypes = getSelectedSubtypeValues().map((value) => value.toLowerCase())

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
    const searchable = row._searchText || ""
    const rowAttribute = row._rowAttributeUpper || safeText(row.attribute).toUpperCase()
    const rowType = row._rowType || safeText(row.type)
    const rowRace = row._rowRace || safeText(row.race)
    const rowHighLevelType = row._highLevelType || getHighLevelType(row)
    const rowAtk = row._atkNum ?? toNumber(row.atk)
    const rowDef = row._defNum ?? toNumber(row.def)
    const rowLevel = row._levelNum ?? (isXyzMonster(row) ? null : toNumber(row.level))
    const rowRank = row._rankNum ?? (isXyzMonster(row) ? toNumber(row.rank ?? row.level) : null)
    const rowLink = row._linkNum ?? (isLinkMonster(row) ? toNumber(row.linkval ?? row.linkVal) : null)
    const rowScale = row._scaleNum ?? toNumber(row.scale)
    const rowLinkArrows = row._linkArrows || getRowLinkArrows(row)

    if (searchTerms.length > 0) {
      const matchesAnySearchTerm = searchTerms.some((term) => searchable.includes(term))
      if (!matchesAnySearchTerm) return false
    }

    if (selectedType && rowHighLevelType !== selectedType) return false

    if (useSpellFilters && selectedSpellType) {
      if (rowHighLevelType !== "Spell" || rowRace !== selectedSpellType) return false
    }

    if (useTrapFilters && selectedTrapType) {
      if (rowHighLevelType !== "Trap" || rowRace !== selectedTrapType) return false
    }

    if (useMonsterFilters && selectedAttribute && rowAttribute !== selectedAttribute) return false
    if (useMonsterFilters && selectedRace && rowRace !== selectedRace) return false

    if (useMonsterFilters && selectedSubtypes.length > 0) {
      const loweredType = rowType.toLowerCase()
      const matchesAllSelectedSubtypes = selectedSubtypes.every((subtype) => loweredType.includes(subtype))
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
  return deckUsageByKey.get(cardKey) || 0
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

    return `Max x${MAX_COPIES_PER_DECK} copies per deck`
  }

  return ""
}

function saveDeckState() {
  rebuildDeckUsageIndex()

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
  rebuildDeckUsageIndex()
}

function loadStoredDeckState() {
  const key = getStorageKey()
  if (!key) {
    deckState = { main: [], extra: [] }
    rebuildDeckUsageIndex()
    return
  }

  try {
    const raw = localStorage.getItem(key)
    if (!raw) {
      deckState = { main: [], extra: [] }
      rebuildDeckUsageIndex()
      return
    }

    const parsed = JSON.parse(raw)
    sanitizeDeckState(parsed)
  } catch {
    deckState = { main: [], extra: [] }
    rebuildDeckUsageIndex()
  }
}

function decoratePoolRow(row) {
  const levelValue = toNumber(row.level)
  const rankValue = toNumber(row.rank)
  const isXyz = isXyzMonster(row)
  const isLink = isLinkMonster(row)
  const previewImageSmall = getBinderPreviewImage(row)
  const previewImageLarge = getBinderModalImage(row)
  const rowType = safeText(row.type)
  const rowRace = safeText(row.race)
  const rowAttributeUpper = safeText(row.attribute).toUpperCase()

  return {
    ...row,
    quantity: Math.max(1, toNumber(row.quantity) || 1),
    _highLevelType: getHighLevelType(row),
    _rowType: rowType,
    _rowTypeLower: rowType.toLowerCase(),
    _rowRace: rowRace,
    _rowAttributeUpper: rowAttributeUpper,
    _atkNum: toNumber(row.atk),
    _defNum: toNumber(row.def),
    _levelNum: isXyz ? null : levelValue,
    _rankNum: isXyz ? (rankValue ?? levelValue) : rankValue,
    _linkNum: isLink ? toNumber(row.linkval ?? row.linkVal) : null,
    _scaleNum: toNumber(row.scale),
    _linkArrows: getRowLinkArrows(row),
    _sortName: safeText(row.name).toLowerCase(),
    _searchText: [
      row.name,
      row.type,
      row.race,
      row.attribute,
      row.archetype,
      row.desc
    ].map(safeText).join(" ").toLowerCase(),
    _previewImageSmall: previewImageSmall,
    _previewImageLarge: previewImageLarge
  }
}

function buildPoolRows(rows) {
  const byKey = new Map()

  for (const rawRow of rows || []) {
    const cardKey = normalizeCardId(
      rawRow?.cardid ?? rawRow?.cardId ?? rawRow?.id ?? rawRow?.passcode ?? rawRow?.image_id ?? rawRow?.imageId
    )

    if (!cardKey) continue

    const quantity = Math.max(1, toNumber(rawRow?.quantity) || 1)
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
    if (!safeText(existing.desc) && safeText(rawRow?.desc)) existing.desc = safeText(rawRow.desc)
    if (!safeText(existing.image) && safeText(rawRow?.image)) existing.image = safeText(rawRow.image)
  }

  poolRows = Array.from(byKey.values()).map((row) => {
    const setCodes = Array.from(row._setCodes || [])
    const primarySetCode = setCodes[0] || safeText(row.set_code)

    return decoratePoolRow({
      ...row,
      set_code: primarySetCode,
      _setCodes: setCodes
    })
  })

  poolByKey = new Map(poolRows.map((row) => [row._deckKey, row]))
  refreshBanlistStateForPoolRows()
}

async function loadPlayerContext() {
  if (!currentPlayer) {
    binderRows = []
    currentBinderRows = []
    poolRows = []
    poolByKey = new Map()
    deckState = { main: [], extra: [] }
    rebuildDeckUsageIndex()
    resetPreview()
    currentPoolPage = 1
    currentFilteredPoolRows = []
    renderAll()
    return
  }

  setStatus(`Loading ${getPlayerLabel(currentPlayer)} binder...`)
  binderStatus.textContent = "Loading your binder..."
  binderGrid.innerHTML = ""

  const [binderResp] = await Promise.all([
    fetch(`/api/deckbuilder/binder?player=${encodeURIComponent(currentPlayer)}`, {
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
    deckState = { main: [], extra: [] }
    rebuildDeckUsageIndex()
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
  currentBinderRows = poolRows
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

function buildPoolCard(row) {
  const cardKey = row._deckKey
  const previewImageUrl = row._previewImageSmall || getBinderPreviewImage(row)
  const usedCount = getUsedCount(cardKey)
  const banlistIcon = row._banlistIcon || getBanlistIconForRow(row)
  const banlistLabel = row._banlistLabel || getBanlistLabelForRow(row)
  const atLimit = !!getAddBlockedReason(cardKey)
  const card = document.createElement("button")
  card.type = "button"
  card.className = `binder-card deckbuilder-pool-card${previewCardKey === cardKey ? " is-previewed" : ""}${atLimit ? " is-at-limit" : ""}`
  card.dataset.cardKey = cardKey
  card.setAttribute("aria-label", `${safeText(row.name) || "Unknown Card"}. Left click to preview, right click to add.`)

  card.innerHTML = `
    <div class="binder-image-shell">
      ${previewImageUrl
        ? `<img src="${previewImageUrl}" alt="${safeText(row.name)}" class="binder-image" loading="lazy" decoding="async" />`
        : '<div class="binder-no-image">No Image</div>'}
      ${banlistIcon
        ? `<span class="binder-banlist-badge"><img src="${banlistIcon}" alt="${banlistLabel || "Banlist status"}" class="binder-banlist-icon" loading="lazy" decoding="async" /></span>`
        : ""}
      <span class="binder-qty">x${safeText(row.quantity) || "1"}</span>
      ${usedCount > 0 ? `<span class="deckbuilder-used-pill">Used ${usedCount}</span>` : ""}
    </div>
    <div class="deckbuilder-card-copy">
      <div class="deckbuilder-card-title" title="${safeText(row.name)}">${safeText(row.name) || "Unknown Card"}</div>
    </div>
  `

  return card
}

function renderPoolChunk(rows, startIndex, token) {
  if (token !== currentPoolRenderToken) return

  const endIndex = Math.min(startIndex + POOL_RENDER_CHUNK_SIZE, rows.length)
  const fragment = document.createDocumentFragment()

  for (let index = startIndex; index < endIndex; index += 1) {
    fragment.appendChild(buildPoolCard(rows[index]))
  }

  binderGrid.appendChild(fragment)
  syncPreviewSelection()

  if (endIndex < rows.length) {
    scheduleChunk(() => renderPoolChunk(rows, endIndex, token))
  }
}

function getPoolPageCount(rows = currentFilteredPoolRows) {
  return Math.max(1, Math.ceil((rows?.length || 0) / POOL_PAGE_SIZE))
}

function goToPoolPage(nextPage) {
  const pageCount = getPoolPageCount()
  currentPoolPage = Math.min(Math.max(1, nextPage), pageCount)
  renderPool()
}

function renderPoolPager(rows) {
  if (!rows.length) {
    binderPager.hidden = true
    return
  }

  const pageCount = getPoolPageCount(rows)
  const startItem = (currentPoolPage - 1) * POOL_PAGE_SIZE + 1
  const endItem = Math.min(currentPoolPage * POOL_PAGE_SIZE, rows.length)

  binderPager.hidden = false
  binderPrevPage.disabled = currentPoolPage <= 1
  binderNextPage.disabled = currentPoolPage >= pageCount
  binderPageInfo.textContent = `Page ${currentPoolPage} of ${pageCount} • ${startItem}-${endItem} of ${rows.length}`
}

function renderPoolFromFirstPage() {
  currentPoolPage = 1
  renderPool()
}

function renderPool() {
  const filtered = applyBinderFilters(currentBinderRows)
  currentFilteredPoolRows = filtered

  const totalCopies = filtered.reduce((sum, row) => sum + (toNumber(row.quantity) || 1), 0)
  const pageCount = getPoolPageCount(filtered)

  currentPoolPage = Math.min(currentPoolPage, pageCount)
  binderGrid.innerHTML = ""

  if (!filtered.length) {
    binderPager.hidden = true
    binderStatus.textContent = "No cards matched the current filters."
    binderGrid.innerHTML = '<div class="binder-empty">No cards matched the current filters.</div>'

    if (!poolByKey.has(previewCardKey)) {
      resetPreview()
    }
    return
  }

  const startIndex = (currentPoolPage - 1) * POOL_PAGE_SIZE
  const pageRows = filtered.slice(startIndex, startIndex + POOL_PAGE_SIZE)
  const startDisplay = startIndex + 1
  const endDisplay = startIndex + pageRows.length

  binderStatus.textContent = ""
  const fragment = document.createDocumentFragment()
  pageRows.forEach((row) => fragment.appendChild(buildPoolCard(row)))
  binderGrid.appendChild(fragment)

  syncPreviewSelection()
  renderPoolPager(filtered)
}

binderGrid.addEventListener("click", (event) => {
  const card = event.target.closest(".deckbuilder-pool-card")
  if (!card || !binderGrid.contains(card)) return

  const row = poolByKey.get(card.dataset.cardKey || "")
  if (!row) return

  showPreviewForRow(row)
})

binderGrid.addEventListener("contextmenu", (event) => {
  const card = event.target.closest(".deckbuilder-pool-card")
  if (!card || !binderGrid.contains(card)) return

  event.preventDefault()
  addCardToSection(card.dataset.cardKey || "")
})

binderGrid.addEventListener("keydown", (event) => {
  const card = event.target.closest(".deckbuilder-pool-card")
  if (!card || !binderGrid.contains(card)) return

  if (event.key === "Enter") {
    event.preventDefault()
    const row = poolByKey.get(card.dataset.cardKey || "")
    if (row) showPreviewForRow(row)
  }

  if (event.key === " ") {
    event.preventDefault()
    addCardToSection(card.dataset.cardKey || "")
  }
})

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
    const banlistIcon = getBanlistIconForRow(row)
    const banlistLabel = getBanlistLabelForRow(row)
    const canAddMore = !getAddBlockedReason(cardKey, section)
    const item = document.createElement("div")
    item.className = "deckbuilder-section-item"

    item.innerHTML = `
      <button type="button" class="deckbuilder-section-preview" data-action="preview">
        ${previewImageUrl
          ? `<img src="${previewImageUrl}" alt="${safeText(row.name)}" class="deckbuilder-section-thumb" loading="lazy" decoding="async" />`
          : '<span class="deckbuilder-section-thumb deckbuilder-section-thumb-empty">No image</span>'}
        ${banlistIcon
          ? `<span class="binder-banlist-badge"><img src="${banlistIcon}" alt="${banlistLabel || "Banlist status"}" class="binder-banlist-icon" loading="lazy" decoding="async" /></span>`
          : ""}
      </button>
      <div class="deckbuilder-section-copy">
        <div class="deckbuilder-section-title" title="${safeText(row.name)}">${safeText(row.name) || "Unknown Card"}</div>
        <div class="deckbuilder-section-subtitle">${getCopyLimitLabel(cardKey)}</div>
      </div>
      <div class="deckbuilder-section-controls">
        <button type="button" class="deckbuilder-control-button" data-action="minus">-</button>
        <span class="deckbuilder-section-count">${count}</span>
        <button type="button" class="deckbuilder-control-button" data-action="plus" ${canAddMore ? "" : "disabled"}>+</button>
      </div>
    `

    item.querySelector('[data-action="preview"]').addEventListener("click", () => {
      showPreviewForRow(row)
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

const debouncedPoolRender = debounce(() => renderPoolFromFirstPage(), 140)

binderSearch.addEventListener("input", debouncedPoolRender)

filterType.addEventListener("change", () => {
  syncFilterVisibility()
  renderPoolFromFirstPage()
})

filterAttribute.addEventListener("change", () => renderPoolFromFirstPage())
filterRace.addEventListener("change", () => renderPoolFromFirstPage())
filterSpellType.addEventListener("change", () => renderPoolFromFirstPage())
filterTrapType.addEventListener("change", () => renderPoolFromFirstPage())

filterSubtypes.addEventListener("change", (event) => {
  if (event.target.matches('input[type="checkbox"]')) renderPoolFromFirstPage()
})

filterAtkExact.addEventListener("input", debouncedPoolRender)
filterAtkMin.addEventListener("input", debouncedPoolRender)
filterAtkMax.addEventListener("input", debouncedPoolRender)
filterDefExact.addEventListener("input", debouncedPoolRender)
filterDefMin.addEventListener("input", debouncedPoolRender)
filterDefMax.addEventListener("input", debouncedPoolRender)

filterLevelExact.addEventListener("input", debouncedPoolRender)
filterLevelMin.addEventListener("input", debouncedPoolRender)
filterLevelMax.addEventListener("input", debouncedPoolRender)

filterRankExact.addEventListener("input", debouncedPoolRender)
filterRankMin.addEventListener("input", debouncedPoolRender)
filterRankMax.addEventListener("input", debouncedPoolRender)

filterLinkExact.addEventListener("input", debouncedPoolRender)
filterLinkMin.addEventListener("input", debouncedPoolRender)
filterLinkMax.addEventListener("input", debouncedPoolRender)

filterScaleExact.addEventListener("input", debouncedPoolRender)
filterScaleMin.addEventListener("input", debouncedPoolRender)
filterScaleMax.addEventListener("input", debouncedPoolRender)

filterLinkArrows.addEventListener("change", (event) => {
  if (event.target.matches('input[type="checkbox"]')) renderPoolFromFirstPage()
})

binderSort.addEventListener("change", () => renderPoolFromFirstPage())

binderSortDirectionButton.addEventListener("click", () => {
  binderSortDirection = binderSortDirection === "asc" ? "desc" : "asc"
  updateSortDirectionButton()
  renderPoolFromFirstPage()
})

toggleFiltersButton.addEventListener("click", () => {
  setBinderFiltersCollapsed(!binderFiltersCollapsed)
})

binderPrevPage.addEventListener("click", () => {
  goToPoolPage(currentPoolPage - 1)
})

binderNextPage.addEventListener("click", () => {
  goToPoolPage(currentPoolPage + 1)
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
