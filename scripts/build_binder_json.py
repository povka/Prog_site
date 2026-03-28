import csv
import json
from pathlib import Path
from urllib.request import urlopen, Request

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "data" / "raw"
GENERATED_DIR = ROOT / "dist" / "data" / "generated"
GENERATED_DIR.mkdir(parents=True, exist_ok=True)

API_URL = "https://db.ygoprodeck.com/api/v7/cardinfo.php"
USER_AGENT = "Mozilla/5.0"

PLAYER_FILES = {
    "asapaska": "asapaska.csv",
    "retroid99": "retroid99.csv",
    "mhkaixer": "mhkaixer.csv",
    "shiruba": "shiruba.csv",
}

def load_full_card_database():
    req = Request(API_URL, headers={"User-Agent": USER_AGENT})
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

def safe_int(value, default=None):
    try:
        return int(str(value).strip())
    except Exception:
        return default

def normalize_csv_row(owner, row, card_index):
    cardid = str(row.get("cardid", "")).strip()
    meta = card_index.get(cardid)

    if not meta:
        return {
            "owner": owner,
            "cardid": safe_int(cardid, None),
            "name": row.get("cardname", "").strip(),
            "quantity": safe_int(row.get("cardq", "1"), 1),
            "set_code": row.get("cardcode", "").strip(),
            "set_name": row.get("cardset", "").strip(),
            "rarity": row.get("cardrarity", "").strip(),
            "condition": row.get("cardcondition", "").strip(),
            "edition": row.get("card_edition", "").strip(),
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
            "image_id": safe_int(cardid, None),
            "image": f"images/cards/{cardid}.jpg" if cardid else None,
        }

    return {
        "owner": owner,
        "cardid": meta["cardid"],
        "name": row.get("cardname", "").strip() or meta["name"],
        "quantity": safe_int(row.get("cardq", "1"), 1),
        "set_code": row.get("cardcode", "").strip(),
        "set_name": row.get("cardset", "").strip(),
        "rarity": row.get("cardrarity", "").strip(),
        "condition": row.get("cardcondition", "").strip(),
        "edition": row.get("card_edition", "").strip(),
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

def build_player_binder(owner, filename, card_index):
    path = RAW_DIR / filename
    rows = []

    with path.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            rows.append(normalize_csv_row(owner, row, card_index))

    return rows

def main():
    print("Fetching full card database...")
    cards = load_full_card_database()
    card_index = build_card_index(cards)

    (GENERATED_DIR / "card-index.json").write_text(
        json.dumps(card_index, indent=2, ensure_ascii=False),
        encoding="utf-8"
    )

    all_binders = {}

    for owner, filename in PLAYER_FILES.items():
        binder = build_player_binder(owner, filename, card_index)
        all_binders[owner] = binder

        (GENERATED_DIR / f"{owner}.json").write_text(
            json.dumps(binder, indent=2, ensure_ascii=False),
            encoding="utf-8"
        )
        print(f"Wrote {owner}.json with {len(binder)} entries")

    (GENERATED_DIR / "all-binders.json").write_text(
        json.dumps(all_binders, indent=2, ensure_ascii=False),
        encoding="utf-8"
    )

    print("Done.")

if __name__ == "__main__":
    main()