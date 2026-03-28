import fs from "node:fs/promises";
import path from "node:path";

const BINDER_ID = "69b6cb6cc8cc2ae73f726070";
const OUTPUT = "dist/data/generated/retroid99.json";
const API_URL = `https://api.ygoprog.com/api/binder/${BINDER_ID}`;
const TOKEN = process.env.YGOPROG_TOKEN;

if (!TOKEN) {
  console.error("Missing YGOPROG_TOKEN");
  process.exit(1);
}

function toSiteRow(card) {
  return {
    cardid: card.cardId,
    name: card.name ?? "",
    set_name: card.set ?? "",
    set_code: card.code ?? "",
    rarity: card.rarity ?? "",
    quantity: card.count ?? 0
  };
}

async function main() {
  const res = await fetch(API_URL, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${TOKEN}`
    }
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Binder fetch failed: ${res.status} ${res.statusText}\n${body}`);
  }

  const json = await res.json();
  const rows = Array.isArray(json.cards) ? json.cards.map(toSiteRow) : [];

  await fs.mkdir(path.dirname(OUTPUT), { recursive: true });

  const next = JSON.stringify(rows, null, 2) + "\n";

  let prev = "";
  try {
    prev = await fs.readFile(OUTPUT, "utf8");
  } catch {}

  if (prev === next) {
    console.log("No binder changes.");
    return;
  }

  await fs.writeFile(OUTPUT, next, "utf8");
  console.log(`Updated ${OUTPUT} with ${rows.length} entries.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});