import json
import sys
import urllib.request
from pathlib import Path

API_URL = "https://db.ygoprodeck.com/api/v7/cardinfo.php"
OUTPUT_PATH = Path("dist/data/generated/alt-artworks.json")

# Change this only if your R2 image paths use a different folder or extension.
IMAGE_PATH_TEMPLATE = "/images/cards/{image_id}.jpg"


def fetch_json(url: str) -> dict:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Prog_site artwork manifest builder"
        }
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        charset = resp.headers.get_content_charset() or "utf-8"
        text = resp.read().decode(charset)
        return json.loads(text)


def safe_str(value) -> str:
    return "" if value is None else str(value).strip()


def build_image_path(image_id: str) -> str:
    return IMAGE_PATH_TEMPLATE.format(image_id=image_id)


def main() -> int:
    print(f"Fetching card data from {API_URL} ...")
    payload = fetch_json(API_URL)
    cards = payload.get("data") or []

    if not isinstance(cards, list):
        print("Unexpected API response shape: 'data' is not a list.", file=sys.stderr)
        return 1

    manifest = {}

    for card in cards:
        card_id = safe_str(card.get("id"))
        card_name = safe_str(card.get("name"))
        card_images = card.get("card_images") or []

        if not card_id or not card_name:
            continue

        options = []
        seen_image_ids = set()

        for image_entry in card_images:
            image_id = safe_str(image_entry.get("id"))
            if not image_id or image_id in seen_image_ids:
                continue

            seen_image_ids.add(image_id)
            options.append({
                "imageId": image_id,
                "image": build_image_path(image_id)
            })

        # Fallback in case card_images is missing or empty for some entry
        if not options:
            options.append({
                "imageId": card_id,
                "image": build_image_path(card_id)
            })

        manifest[card_id] = {
            "name": card_name,
            "defaultImageId": options[0]["imageId"],
            "hasAlternateArt": len(options) > 1,
            "options": options
        }

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT_PATH.open("w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)

    total_cards = len(manifest)
    alt_art_cards = sum(1 for entry in manifest.values() if entry["hasAlternateArt"])

    print(f"Wrote {OUTPUT_PATH}")
    print(f"Total cards: {total_cards}")
    print(f"Cards with alternate artwork: {alt_art_cards}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())