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

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/discord/interactions") {
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

      // Discord endpoint handshake
      if (body.type === 1) {
        return Response.json({ type: 1 });
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

        const commandName = body.data?.name;
        const options = body.data?.options ?? [];

        if (commandName === "deck") {
        const playerInput = options.find(o => o.name === "player")?.value;
        const weekInput = options.find(o => o.name === "week")?.value;

        const player = String(playerInput || "").trim().toLowerCase();
        const week = String(weekInput || "").trim();

        const [indexResp, statsResp] = await Promise.all([
            env.ASSETS.fetch(new Request(new URL("/data/deck-index.json", url.origin).toString())),
            env.ASSETS.fetch(new Request(new URL("/data/generated/deck-stats.json", url.origin).toString()))
        ]);

        if (!indexResp.ok) {
            return Response.json({
            type: 4,
            data: { content: "Deck index file is missing." }
            });
        }

        if (!statsResp.ok) {
            return Response.json({
            type: 4,
            data: { content: "Deck stats file is missing." }
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
                    const label = copies === undefined || copies === null
                    ? archetypeName
                    : `${archetypeName} · ${copies}`;

                    return {
                    type: 2,
                    style: 5,
                    label: truncateLabel(label, 80),
                    url: new URL(
                        `/archetype.html?name=${encodeURIComponent(archetypeName)}`,
                        url.origin
                    ).toString()
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

        return Response.json({
        type: 4,
        data: {
            content: "Unknown command."
        }
        });
    }

    return env.ASSETS.fetch(request);
  }
};