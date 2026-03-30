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

      const commandName = body.data?.name;
        const options = body.data?.options ?? [];

        if (commandName === "deck") {
        const player = options.find(o => o.name === "player")?.value;
        const week = options.find(o => o.name === "week")?.value;

        // Replace this with one real public deck image URL from your site
        const TEST_DECK_IMAGE_URL = "https://asapaskaprog.asapaska3.workers.dev/images/test-deck.png";

        return Response.json({
            type: 4,
            data: {
            embeds: [
                {
                title: `Deck - ${player} - Week ${week}`,
                color: 0xF1C40F,
                image: {
                    url: TEST_DECK_IMAGE_URL
                }
                }
            ]
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