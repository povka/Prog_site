function hexToUint8Array(hex) {
  if (!hex || hex.length % 2 !== 0) {
    throw new Error("Invalid hex string");
  }

  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

let cachedDiscordKeyPromise = null;

function getDiscordPublicKey(publicKeyHex) {
  if (!cachedDiscordKeyPromise) {
    cachedDiscordKeyPromise = crypto.subtle.importKey(
      "raw",
      hexToUint8Array(publicKeyHex),
      { name: "Ed25519" },
      false,
      ["verify"]
    );
  }
  return cachedDiscordKeyPromise;
}

async function verifyDiscordRequest(request, publicKeyHex) {
  const signature = request.headers.get("x-signature-ed25519");
  const timestamp = request.headers.get("x-signature-timestamp");

  if (!signature || !timestamp) {
    return { ok: false, bodyText: null };
  }

  const bodyText = await request.text();
  const message = new TextEncoder().encode(timestamp + bodyText);

  const publicKey = await getDiscordPublicKey(publicKeyHex);
  const isValid = await crypto.subtle.verify(
    { name: "Ed25519" },
    publicKey,
    hexToUint8Array(signature),
    message
  );

  return { ok: isValid, bodyText };
}

function safeText(value) {
  return value ? String(value).trim() : "";
}

function normalizeAssetPath(value) {
  return safeText(value)
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/^\/+/, "");
}

function truncateLabel(value, max = 80) {
  const text = safeText(value);
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function buildArchetypeUrl(origin, name) {
  return new URL(
    `/archetype.html?name=${encodeURIComponent(safeText(name))}`,
    origin
  ).toString();
}

function getCommandOption(options, name) {
  return options.find((o) => o.name === name)?.value;
}

function getFocusedOption(options = []) {
  return options.find((o) => o.focused) || null;
}

function normalizeName(value) {
  return safeText(value).toLowerCase();
}

function toNumber(value) {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

function getCardImageUrl(row, origin) {
  const directImage = safeText(row?.image);
  if (directImage) {
    return new URL(directImage, origin).toString();
  }

  const cardId = safeText(row?.cardid || row?.cardId || row?.id || row?.passcode);
  if (cardId) {
    return new URL(`/images/cards/${cardId}.jpg`, origin).toString();
  }

  return "";
}

function sumRowQuantities(rows) {
  return rows.reduce((sum, row) => sum + (toNumber(row?.quantity) ?? 1), 0);
}

function r2ObjectToResponse(object) {
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "public, max-age=31536000, immutable");

  return new Response(object.body, {
    status: 200,
    headers
  });
}

function playerDisplayName(key) {
  const labels = {
    asapaska: "asapaska",
    mhkaixer: "MHKaixer",
    retroid99: "Retroid99",
    shiruba: "ShirubaMaebure"
  };

  return labels[key] || key;
}

function filterAutocompleteChoices(choices, query, max = 25) {
  const q = safeText(query).toLowerCase();

  const filtered = q
    ? choices.filter((choice) => safeText(choice.name).toLowerCase().includes(q))
    : choices;

  return filtered.slice(0, max);
}

function getWeekEntryBySetInput(deckIndex, setInput) {
  const weeks = deckIndex?.weeks || {};
  const normalizedInput = normalizeName(setInput);

  if (!normalizedInput) {
    return { weekKey: null, weekData: null };
  }

  for (const [weekKey, weekData] of Object.entries(weeks)) {
    if (normalizeName(weekData?.setName) === normalizedInput) {
      return { weekKey, weekData };
    }
  }

  if (weeks[setInput]) {
    return { weekKey: setInput, weekData: weeks[setInput] };
  }

  const strippedWeek = normalizedInput.replace(/^week\s+/, "");
  if (weeks[strippedWeek]) {
    return { weekKey: strippedWeek, weekData: weeks[strippedWeek] };
  }

  return { weekKey: null, weekData: null };
}

function buildDeckAutocompleteChoices(deckIndex, options) {
  const focused = getFocusedOption(options);
  if (!focused) return [];

  const weeks = deckIndex?.weeks || {};
  const selectedSet = safeText(getCommandOption(options, "set"));
  const selectedPlayer = safeText(getCommandOption(options, "player")).toLowerCase();
  const focusedValue = focused?.value;

  if (focused.name === "set") {
    const choices = Object.entries(weeks)
      .filter(([, weekData]) => {
        if (!selectedPlayer) return true;
        return !!weekData?.players?.[selectedPlayer];
      })
      .sort((a, b) => Number(b[0]) - Number(a[0]))
      .map(([, weekData]) => {
        const setName = safeText(weekData?.setName) || "Unknown set";
        return {
          name: truncateLabel(setName, 100),
          value: setName
        };
      });

    return filterAutocompleteChoices(choices, focusedValue);
  }

  if (focused.name === "player") {
    let playerKeys = [];

    if (selectedSet) {
      const { weekData } = getWeekEntryBySetInput(deckIndex, selectedSet);
      if (weekData?.players) {
        playerKeys = Object.keys(weekData.players);
      }
    } else {
      const unique = new Set();

      for (const weekData of Object.values(weeks)) {
        for (const key of Object.keys(weekData?.players || {})) {
          unique.add(key);
        }
      }

      playerKeys = [...unique];
    }

    const choices = playerKeys
      .sort((a, b) => playerDisplayName(a).localeCompare(playerDisplayName(b)))
      .map((key) => ({
        name: truncateLabel(playerDisplayName(key), 100),
        value: key
      }));

    return filterAutocompleteChoices(choices, focusedValue);
  }

  return [];
}

function extractCardNames(cardIndex) {
  const names = new Set();

  function addName(value) {
    const text = safeText(value);
    if (text) {
      names.add(text);
    }
  }

  function absorbEntries(entries) {
    if (!Array.isArray(entries)) return;

    for (const entry of entries) {
      if (typeof entry === "string") {
        addName(entry);
        continue;
      }

      if (entry && typeof entry === "object") {
        addName(entry.name);
        addName(entry.cardName);
        addName(entry.label);
        addName(entry.title);
      }
    }
  }

  if (Array.isArray(cardIndex)) {
    absorbEntries(cardIndex);
  } else if (cardIndex && typeof cardIndex === "object") {
    absorbEntries(cardIndex.cards);
    absorbEntries(cardIndex.items);
    absorbEntries(cardIndex.entries);
    absorbEntries(cardIndex.results);

    for (const [key, value] of Object.entries(cardIndex)) {
      if (typeof value === "string") {
        addName(value);
        continue;
      }

      if (value && typeof value === "object") {
        const beforeSize = names.size;

        addName(value.name);
        addName(value.cardName);
        addName(value.label);
        addName(value.title);

        if (names.size === beforeSize && key && isNaN(Number(key))) {
          addName(key);
        }
      }
    }
  }

  return [...names].sort((a, b) => a.localeCompare(b));
}

function buildCardAutocompleteChoices(cardIndex, options) {
  const focused = getFocusedOption(options);
  if (!focused || focused.name !== "name") {
    return [];
  }

  const query = safeText(focused.value).toLowerCase();
  const names = extractCardNames(cardIndex);

  const ranked = names
    .map((name) => {
      const lower = name.toLowerCase();

      let rank = 999;
      if (!query) rank = 0;
      else if (lower === query) rank = 0;
      else if (lower.startsWith(query)) rank = 1;
      else if (lower.includes(query)) rank = 2;

      return { name, rank };
    })
    .filter((row) => row.rank !== 999)
    .sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank;
      return a.name.localeCompare(b.name);
    })
    .slice(0, 25);

  return ranked.map((row) => {
    const value = truncateLabel(row.name, 100);
    return {
      name: value,
      value
    };
  });
}

const PLAYER_KEYS = new Set(["asapaska", "retroid99", "mhkaixer", "shiruba"]);

function jsonResponse(data, init = {}) {
  return new Response(JSON.stringify(data), {
    status: init.status || 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...init.headers
    }
  });
}

async function readPlayerPrefs(env, player) {
  const raw = await env.ARTWORK_PREFS.get(`player:${player}`, "text");

  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function writePlayerPrefs(env, player, prefs) {
  await env.ARTWORK_PREFS.put(`player:${player}`, JSON.stringify(prefs));
}

const DISCORD_AUTH_URL = "https://discord.com/oauth2/authorize";
const DISCORD_TOKEN_URL = "https://discord.com/api/oauth2/token";
const DISCORD_ME_URL = "https://discord.com/api/v10/users/@me";

const OAUTH_STATE_COOKIE = "prog_discord_oauth_state";
const SESSION_COOKIE = "prog_discord_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

const EDITOR_PERMISSIONS = {
  // Replace these with real Discord user IDs
  "276095178698260490": ["asapaska"],
  "235860238379646980": ["retroid99"],
  "210772839165329408": ["mhkaixer"],
  "203214195355811840": ["shiruba"]
};

function parseCookies(request) {
  const cookieHeader = request.headers.get("cookie") || "";
  const out = {};

  for (const part of cookieHeader.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    out[key] = value;
  }

  return out;
}

function serializeCookie(name, value, options = {}) {
  const parts = [`${name}=${value}`];

  if (options.maxAge !== undefined) parts.push(`Max-Age=${options.maxAge}`);
  if (options.path) parts.push(`Path=${options.path}`);
  if (options.httpOnly) parts.push("HttpOnly");
  if (options.secure) parts.push("Secure");
  if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);

  return parts.join("; ");
}

function clearCookie(name) {
  return serializeCookie(name, "", {
    path: "/",
    maxAge: 0,
    httpOnly: true,
    secure: true,
    sameSite: "Lax"
  });
}

function randomString(byteLength = 24) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);

  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function toBase64Url(input) {
  const bytes = input instanceof Uint8Array
    ? input
    : new TextEncoder().encode(String(input));

  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromBase64UrlToString(value) {
  const base64 = value
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    + "=".repeat((4 - (value.length % 4)) % 4);

  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return new TextDecoder().decode(bytes);
}

async function signHmac(message, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(message)
  );

  return toBase64Url(new Uint8Array(signature));
}

async function createSessionValue(session, secret) {
  const payload = toBase64Url(JSON.stringify(session));
  const signature = await signHmac(payload, secret);
  return `${payload}.${signature}`;
}

async function readSession(request, env) {
  const cookies = parseCookies(request);
  const raw = cookies[SESSION_COOKIE] || "";

  if (!raw.includes(".")) return null;

  const [payload, providedSignature] = raw.split(".", 2);
  if (!payload || !providedSignature) return null;

  const expectedSignature = await signHmac(payload, env.SESSION_SECRET);
  if (expectedSignature !== providedSignature) return null;

  let parsed;
  try {
    parsed = JSON.parse(fromBase64UrlToString(payload));
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object") return null;

  const now = Math.floor(Date.now() / 1000);
  if (!parsed.exp || parsed.exp < now) return null;

  return parsed;
}

function getDiscordAvatarUrl(user) {
  const userId = safeText(user?.id);
  const avatar = safeText(user?.avatar);

  if (!userId || !avatar) return "";
  return `https://cdn.discordapp.com/avatars/${userId}/${avatar}.png`;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/images/")) {
      const key = url.pathname.replace(/^\/+/, "");
      const object = await env.SITE_IMAGES.get(key);

      if (object) {
        return r2ObjectToResponse(object);
      }

      return env.ASSETS.fetch(request);
    }

          if (url.pathname === "/api/artwork-prefs" && request.method === "POST") {
      const session = await readSession(request, env);

      if (!session) {
        return jsonResponse({ error: "Unauthorized." }, { status: 401 });
      }

      let body;
      try {
        body = await request.json();
      } catch {
        return jsonResponse({ error: "Invalid JSON body." }, { status: 400 });
      }

      const player = safeText(body?.player).toLowerCase();
      const cardId = safeText(body?.cardId);
      const imageId = safeText(body?.imageId);

      if (!PLAYER_KEYS.has(player)) {
        return jsonResponse({ error: "Invalid player." }, { status: 400 });
      }

      const allowedPlayers = Array.isArray(session.allowedPlayers)
        ? session.allowedPlayers
        : [];

      if (!allowedPlayers.includes(player)) {
        return jsonResponse({ error: "Forbidden." }, { status: 403 });
      }

      if (!cardId) {
        return jsonResponse({ error: "Missing cardId." }, { status: 400 });
      }

      const prefs = await readPlayerPrefs(env, player);

      if (imageId) {
        prefs[cardId] = imageId;
      } else {
        delete prefs[cardId];
      }

      await writePlayerPrefs(env, player, prefs);

      return jsonResponse({
        ok: true,
        player,
        prefs
      });
    }

        if (url.pathname === "/auth/discord/login" && request.method === "GET") {
      const state = randomString(24);
      const redirectUri = new URL("/auth/discord/callback", url.origin).toString();

      const authUrl = new URL(DISCORD_AUTH_URL);
      authUrl.searchParams.set("client_id", env.DISCORD_CLIENT_ID);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("scope", "identify");
      authUrl.searchParams.set("redirect_uri", redirectUri);
      authUrl.searchParams.set("state", state);
      authUrl.searchParams.set("prompt", "consent");

      return new Response(null, {
        status: 302,
        headers: {
          "location": authUrl.toString(),
          "set-cookie": serializeCookie(OAUTH_STATE_COOKIE, state, {
            path: "/",
            maxAge: 600,
            httpOnly: true,
            secure: true,
            sameSite: "Lax"
          })
        }
      });
    }

    if (url.pathname === "/auth/discord/callback" && request.method === "GET") {
      const code = safeText(url.searchParams.get("code"));
      const returnedState = safeText(url.searchParams.get("state"));
      const cookies = parseCookies(request);
      const storedState = safeText(cookies[OAUTH_STATE_COOKIE]);

      if (!code || !returnedState || !storedState || returnedState !== storedState) {
        return new Response("Invalid OAuth state.", { status: 400 });
      }

      const redirectUri = new URL("/auth/discord/callback", url.origin).toString();

      const tokenResp = await fetch(DISCORD_TOKEN_URL, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({
          client_id: env.DISCORD_CLIENT_ID,
          client_secret: env.DISCORD_CLIENT_SECRET,
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri
        }).toString()
      });

      let tokenData = {};
      try {
        tokenData = await tokenResp.json();
      } catch {
        tokenData = {};
      }

      if (!tokenResp.ok || !safeText(tokenData.access_token)) {
        return new Response("Discord token exchange failed.", { status: 400 });
      }

      const meResp = await fetch(DISCORD_ME_URL, {
        headers: {
          authorization: `Bearer ${tokenData.access_token}`
        }
      });

      let me = {};
      try {
        me = await meResp.json();
      } catch {
        me = {};
      }

      if (!meResp.ok || !safeText(me.id)) {
        return new Response("Failed to fetch Discord user.", { status: 400 });
      }

      const discordUserId = safeText(me.id);
      const allowedPlayers = EDITOR_PERMISSIONS[discordUserId] || [];

      const session = {
        discordUserId,
        username: safeText(me.global_name) || safeText(me.username) || "Discord user",
        avatar: safeText(me.avatar),
        allowedPlayers,
        exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE
      };

      const sessionValue = await createSessionValue(session, env.SESSION_SECRET);

      return new Response(null, {
        status: 302,
        headers: {
          "location": "/settings.html",
          "set-cookie": [
            clearCookie(OAUTH_STATE_COOKIE),
            serializeCookie(SESSION_COOKIE, sessionValue, {
              path: "/",
              maxAge: SESSION_MAX_AGE,
              httpOnly: true,
              secure: true,
              sameSite: "Lax"
            })
          ].join(", ")
        }
      });
    }

    if (url.pathname === "/auth/logout" && request.method === "POST") {
      return new Response(null, {
        status: 204,
        headers: {
          "set-cookie": clearCookie(SESSION_COOKIE)
        }
      });
    }

    if (url.pathname === "/api/me" && request.method === "GET") {
      const session = await readSession(request, env);

      if (!session) {
        return jsonResponse({
          loggedIn: false
        });
      }

      return jsonResponse({
        loggedIn: true,
        user: {
          discordUserId: session.discordUserId,
          username: session.username,
          avatarUrl: session.avatar
            ? getDiscordAvatarUrl({
                id: session.discordUserId,
                avatar: session.avatar
              })
            : "",
          allowedPlayers: Array.isArray(session.allowedPlayers)
            ? session.allowedPlayers
            : []
        }
      });
    }

    if (url.pathname !== "/discord/interactions") {
      return env.ASSETS.fetch(request);
    }

    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const verification = await verifyDiscordRequest(
      request,
      env.DISCORD_PUBLIC_KEY
    );

    if (!verification.ok) {
      return new Response("Bad request signature.", { status: 401 });
    }

    let body;
    try {
      body = JSON.parse(verification.bodyText);
    } catch {
      return new Response("Bad Request", { status: 400 });
    }

    // Discord PING
    if (body.type === 1) {
      return Response.json({ type: 1 });
    }

    const commandName = body.data?.name;
    const options = body.data?.options ?? [];

    // Discord autocomplete interaction
    if (body.type === 4) {
      if (commandName === "deck") {
        const indexResp = await env.ASSETS.fetch(
          new Request(new URL("/data/deck-index.json", url.origin).toString())
        );

        if (!indexResp.ok) {
          return Response.json({
            type: 8,
            data: {
              choices: []
            }
          });
        }

        let deckIndex = {};
        try {
          deckIndex = await indexResp.json();
        } catch {
          deckIndex = {};
        }

        return Response.json({
          type: 8,
          data: {
            choices: buildDeckAutocompleteChoices(deckIndex, options)
          }
        });
      }

      if (commandName === "card") {
        const cardIndexResp = await env.ASSETS.fetch(
          new Request(new URL("/data/generated/card-index.json", url.origin).toString())
        );

        if (!cardIndexResp.ok) {
          return Response.json({
            type: 8,
            data: {
              choices: []
            }
          });
        }

        let cardIndex = {};
        try {
          cardIndex = await cardIndexResp.json();
        } catch {
          cardIndex = {};
        }

        return Response.json({
          type: 8,
          data: {
            choices: buildCardAutocompleteChoices(cardIndex, options)
          }
        });
      }
    }

    if (commandName === "deck") {
      const player = safeText(getCommandOption(options, "player")).toLowerCase();
      const setInput = safeText(getCommandOption(options, "set"));

      const [indexResp, statsResp] = await Promise.all([
        env.ASSETS.fetch(
          new Request(new URL("/data/deck-index.json", url.origin).toString())
        ),
        env.ASSETS.fetch(
          new Request(new URL("/data/generated/deck-stats.json", url.origin).toString())
        )
      ]);

      if (!indexResp.ok) {
        return Response.json({
          type: 4,
          data: {
            content: "Deck index file is missing."
          }
        });
      }

      if (!statsResp.ok) {
        return Response.json({
          type: 4,
          data: {
            content: "Deck stats file is missing."
          }
        });
      }

      const deckIndex = await indexResp.json();
      const deckStatsData = await statsResp.json();

      const { weekKey, weekData } = getWeekEntryBySetInput(deckIndex, setInput);
      const playerData = weekData?.players?.[player];

      if (!weekData || !playerData?.image) {
        return Response.json({
          type: 4,
          data: {
            content: `No deck image found for player "${player}" in set "${setInput}".`
          }
        });
      }

      const imageUrl = new URL(playerData.image, url.origin).toString();
      const setName = safeText(weekData.setName) || safeText(setInput) || `Week ${weekKey}`;

      const ydkPath = normalizeAssetPath(playerData.ydk);
      const statsEntry = ydkPath ? deckStatsData?.byYdk?.[ydkPath] : null;
      const topArchetypes = (
        statsEntry?.topArchetypes ||
        statsEntry?.archetypes ||
        []
      ).slice(0, 3);

      const components = topArchetypes.length
        ? [
            {
              type: 1,
              components: topArchetypes.map((row) => {
                const archetypeName = safeText(row?.name) || "Unknown";
                const copies = row?.copies;
                const label =
                  copies === undefined || copies === null
                    ? archetypeName
                    : `${archetypeName} · ${copies}`;

                return {
                  type: 2,
                  style: 5,
                  label: truncateLabel(label, 80),
                  url: buildArchetypeUrl(url.origin, archetypeName)
                };
              })
            }
          ]
        : [];

      return Response.json({
        type: 4,
        data: {
          embeds: [
            {
              title: `Deck - ${playerDisplayName(player)} - ${setName}`,
              description: `Week: **${weekKey}**`,
              color: 0xF1C40F,
              image: {
                url: imageUrl
              }
            }
          ],
          components
        }
      });
    }

    if (commandName === "card") {
      const nameInput = getCommandOption(options, "name");
      const query = safeText(nameInput);
      const queryKey = normalizeName(query);

      if (!queryKey) {
        return Response.json({
          type: 4,
          data: {
            content: "Please provide a card name."
          }
        });
      }

      const players = [
        { key: "asapaska", label: "asapaska", path: "/data/generated/asapaska.json" },
        { key: "retroid99", label: "Retroid99", path: "/data/generated/retroid99.json" },
        { key: "mhkaixer", label: "MHKaixer", path: "/data/generated/mhkaixer.json" },
        { key: "shiruba", label: "ShirubaMaebure", path: "/data/generated/shiruba.json" }
      ];

      const binderResponses = await Promise.all(
        players.map((player) =>
          env.ASSETS.fetch(new Request(new URL(player.path, url.origin).toString()))
        )
      );

      const binderJsons = await Promise.all(
        binderResponses.map(async (resp) => {
          if (!resp.ok) return [];
          try {
            const data = await resp.json();
            return Array.isArray(data) ? data : [];
          } catch {
            return [];
          }
        })
      );

      const perPlayer = players.map((player, index) => {
        const rows = binderJsons[index];

        const matches = rows.filter(
          (row) => normalizeName(row?.name) === queryKey
        );

        const quantity = sumRowQuantities(matches);

        return {
          ...player,
          matches,
          quantity
        };
      });

      const totalCopies = perPlayer.reduce((sum, entry) => sum + entry.quantity, 0);

      const firstMatchedRow =
        perPlayer.flatMap((entry) => entry.matches).find(Boolean) || null;

      if (!firstMatchedRow) {
        return Response.json({
          type: 4,
          data: {
            content: `No exact binder entries found for "${query}".`
          }
        });
      }

      const cardName = safeText(firstMatchedRow.name) || query;
      const imageUrl = getCardImageUrl(firstMatchedRow, url.origin);

      const quantityLines = perPlayer
        .map((entry) => `**${entry.label}:** ${entry.quantity}`)
        .join("\n");

      const embed = {
        title: cardName,
        description: `${quantityLines}\n\n**Total:** ${totalCopies}`,
        color: 0xF1C40F
      };

      if (imageUrl) {
        embed.image = { url: imageUrl };
      }

      return Response.json({
        type: 4,
        data: {
          embeds: [embed]
        }
      });
    }

    return Response.json({
      type: 4,
      data: {
        content: "Unknown command."
      }
    });
  }
};