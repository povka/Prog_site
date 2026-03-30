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

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

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

    if (commandName === "deck") {
      const player = safeText(getCommandOption(options, "player")).toLowerCase();
      const week = String(getCommandOption(options, "week") ?? "").trim();

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

      const weekData = deckIndex?.weeks?.[week];
      const playerData = weekData?.players?.[player];

      if (!weekData || !playerData?.image) {
        return Response.json({
          type: 4,
          data: {
            content: `No deck image found for player "${player}" in week ${week}.`
          }
        });
      }

      const imageUrl = new URL(playerData.image, url.origin).toString();
      const setName = weekData.setName || `Week ${week}`;

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
              title: `Deck - ${player} - Week ${week}`,
              description: `Set: **${setName}**`,
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