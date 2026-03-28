import csv
import json
import os
from pathlib import Path
from urllib.request import urlopen, Request
from urllib.error import HTTPError, URLError

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "data" / "raw"
GENERATED_DIR = ROOT / "dist" / "data" / "generated"
GENERATED_DIR.mkdir(parents=True, exist_ok=True)

YGOPRODECK_API_URL = "https://db.ygoprodeck.com/api/v7/cardinfo.php"
YGOPROG_BINDER_API = "https://api.ygoprog.com/api/binder/{binder_id}"
USER_AGENT = "Mozilla/5.0"

# You can mix CSV and API sources here.
# type="csv"  -> value is a filename inside data/raw
# type="api"  -> value is a YGO Prog binder ID
PLAYER_SOURCES = {
    "asapaska": {
        "type": "api",
        "binder_id": "69b6c1c3c8cc2ae73f725812",
        "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2OWIxNmI0M2RkZWVkZjk0ZGVkMmU5YTEiLCJ1c2VybmFtZSI6ImFzYXBhc2thIiwiaWF0IjoxNzc0Njg3MTcwLCJleHAiOjE3NzQ3NzM1NzB9.8HFUvPG9QE7DHy7he2aWfInS3rigv8E1-7ZK7xxPdlA",
    },
    "retroid99": {
        "type": "api",
        "binder_id": "69b6cb6cc8cc2ae73f726070",
        "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2OWI2YzliOTNkNjhkYjdlNjg4YWZkMTIiLCJ1c2VybmFtZSI6InJldHJvaWQ5OSIsImlhdCI6MTc3NDczOTIzOSwiZXhwIjoxNzc0ODI1NjM5fQ.NYW5rluufLXIhRi32D1WlDNxPV6KGRTELSXht2DDLEI",
    },
    # "mhkaixer": {
        # "type": "api",
        # "binder_id": "PASTE_MHKAIXER_BINDER_ID_HERE",
        # "token": "PASTE_FRESH_MHKAIXER_TOKEN_HERE",
    # },
    # "shiruba": {
        # "type": "api",
        # "binder_id": "PASTE_SHIRUBA_BINDER_ID_HERE",
        # "token": "PASTE_FRESH_SHIRUBA_TOKEN_HERE",
    # },
}

CARD_INDEX_PATH = GENERATED_DIR / "card-index.json"


def safe_int(value, default=None):
    try:
        return int(str(value).strip())
    except Exception:
        return default


def load_full_card_database():
    req = Request(YGOPRODECK_API_URL, headers={"User-Agent": USER_AGENT})
    with urlopen(req, timeout=180) as resp:
        payload = json.load(resp)
    return payload["data"]


def build_card_index(cards):
    index = {}
    for card in cards:
        card_id = card.get("id")
        if not isinstance(card_id, int):
            continue

        card_sets = card.get("card_sets", []) or []
        card_images = card.get("card_images", []) or []
        first_image = card_images[0] if card_images else {}

        index[str(card_id)] = {
            "cardid": card_id,
            "name": card.get("name"),
            "type": card.get("type"),
            "frameType": card.get("frameType"),
            "desc": card.get("desc"),
            "race": card.get("race"),
            "attribute": card.get("attribute"),
            "archetype": card.get("archetype"),
            "level": card.get("level"),
            "rank": card.get("rank"),
            "atk": card.get("atk"),
            "def": card.get("def"),
            "linkval": card.get("linkval"),
            "linkmarkers": card.get("linkmarkers"),
            "scale": card.get("scale"),
            "sets": card_sets,
            "image_id": first_image.get("id", card_id),
            "image": f"images/cards/{first_image.get('id', card_id)}.jpg",
        }
    return index


def load_or_build_card_index():
    if CARD_INDEX_PATH.exists():
        print("Loading cached card index...")
        return json.loads(CARD_INDEX_PATH.read_text(encoding="utf-8"))

    print("Fetching full card database...")
    cards = load_full_card_database()
    card_index = build_card_index(cards)

    CARD_INDEX_PATH.write_text(
        json.dumps(card_index, indent=2, ensure_ascii=False),
        encoding="utf-8"
    )
    return card_index


def build_output_row(
    owner,
    cardid,
    fallback_name,
    quantity,
    set_code,
    set_name,
    rarity,
    condition,
    edition,
    card_index
):
    cardid_str = str(cardid).strip() if cardid is not None else ""
    meta = card_index.get(cardid_str)

    if not meta:
        numeric_cardid = safe_int(cardid_str, None)
        return {
            "owner": owner,
            "cardid": numeric_cardid,
            "name": (fallback_name or "").strip(),
            "quantity": safe_int(quantity, 1),
            "set_code": (set_code or "").strip(),
            "set_name": (set_name or "").strip(),
            "rarity": (rarity or "").strip(),
            "condition": (condition or "").strip(),
            "edition": (edition or "").strip(),
            "type": None,
            "frameType": None,
            "race": None,
            "attribute": None,
            "level": None,
            "rank": None,
            "atk": None,
            "def": None,
            "linkval": None,
            "linkmarkers": None,
            "scale": None,
            "archetype": None,
            "image_id": numeric_cardid,
            "image": f"images/cards/{numeric_cardid}.jpg" if numeric_cardid else None,
        }

    return {
        "owner": owner,
        "cardid": meta["cardid"],
        "name": (fallback_name or "").strip() or meta["name"],
        "quantity": safe_int(quantity, 1),
        "set_code": (set_code or "").strip(),
        "set_name": (set_name or "").strip(),
        "rarity": (rarity or "").strip(),
        "condition": (condition or "").strip(),
        "edition": (edition or "").strip(),
        "type": meta["type"],
        "frameType": meta["frameType"],
        "race": meta["race"],
        "attribute": meta["attribute"],
        "level": meta["level"],
        "rank": meta["rank"],
        "atk": meta["atk"],
        "def": meta["def"],
        "linkval": meta["linkval"],
        "linkmarkers": meta["linkmarkers"],
        "scale": meta["scale"],
        "archetype": meta["archetype"],
        "image_id": meta["image_id"],
        "image": meta["image"],
    }


def normalize_csv_row(owner, row, card_index):
    return build_output_row(
        owner=owner,
        cardid=row.get("cardid", ""),
        fallback_name=row.get("cardname", ""),
        quantity=row.get("cardq", "1"),
        set_code=row.get("cardcode", ""),
        set_name=row.get("cardset", ""),
        rarity=row.get("cardrarity", ""),
        condition=row.get("cardcondition", ""),
        edition=row.get("card_edition", ""),
        card_index=card_index,
    )


def normalize_api_row(owner, row, card_index):
    # YGO Prog binder API does not currently provide condition/edition.
    # Leave them blank unless you want to force defaults.
    return build_output_row(
        owner=owner,
        cardid=row.get("cardId", ""),
        fallback_name=row.get("name", ""),
        quantity=row.get("count", 1),
        set_code=row.get("code", ""),
        set_name=row.get("set", ""),
        rarity=row.get("rarity", ""),
        condition="",
        edition="",
        card_index=card_index,
    )


def fetch_remote_binder_cards(binder_id, token):
    url = YGOPROG_BINDER_API.format(binder_id=binder_id)
    headers = {
        "User-Agent": USER_AGENT,
        "Accept": "application/json",
        "Authorization": f"Bearer {token}",
    }
    req = Request(url, headers=headers)

    try:
        with urlopen(req, timeout=180) as resp:
            payload = json.load(resp)
    except HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {e.code} while fetching binder {binder_id}: {body}") from e
    except URLError as e:
        raise RuntimeError(f"Network error while fetching binder {binder_id}: {e}") from e

    cards = payload.get("cards")
    if not isinstance(cards, list):
        raise RuntimeError(f"Binder {binder_id} response did not contain a cards list.")

    return cards


def build_player_binder_from_csv(owner, filename, card_index):
    path = RAW_DIR / filename
    rows = []

    with path.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            rows.append(normalize_csv_row(owner, row, card_index))

    return rows


def build_player_binder_from_api(owner, binder_id, card_index, token):
    raw_cards = fetch_remote_binder_cards(binder_id, token)
    return [normalize_api_row(owner, row, card_index) for row in raw_cards]


def main():
    card_index = load_or_build_card_index()
    all_binders = {}

    for owner, source in PLAYER_SOURCES.items():
        source_type = source["type"]

        if source_type != "api":
            raise RuntimeError(f"Only api sources are enabled now. Bad source for {owner}: {source_type}")

        binder_id = source["binder_id"]
        token = source["token"].strip()

        if not token:
            raise RuntimeError(f"Missing token for {owner}")

        binder = build_player_binder_from_api(owner, binder_id, card_index, token)
        all_binders[owner] = binder

        (GENERATED_DIR / f"{owner}.json").write_text(
            json.dumps(binder, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8"
        )
        print(f"Wrote {owner}.json with {len(binder)} entries")

    (GENERATED_DIR / "all-binders.json").write_text(
        json.dumps(all_binders, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8"
    )

    print("Done.")


if __name__ == "__main__":
    main()