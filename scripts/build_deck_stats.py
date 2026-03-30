#!/usr/bin/env python3
from __future__ import annotations

import json
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DECKS_JSON_PATH = ROOT / "dist" / "data" / "decks.json"
CARD_INDEX_PATH = ROOT / "dist" / "data" / "generated" / "card-index.json"
OUTPUT_PATH = ROOT / "dist" / "data" / "generated" / "deck-stats.json"


def safe_text(value) -> str:
    return str(value).strip() if value is not None else ""


def normalize_asset_path(value: str) -> str:
    path = safe_text(value).replace("\\", "/").lstrip("/")
    if path.startswith("./"):
        path = path[2:]
    if path.startswith("dist/"):
        path = path[5:]
    return path


def normalize_card_id(value) -> str:
    digits = "".join(ch for ch in safe_text(value) if ch.isdigit())
    if not digits:
        return ""
    return str(int(digits))


def asset_path_to_file(path: str) -> Path:
    return ROOT / "dist" / normalize_asset_path(path)


def parse_ydk_file(path: Path) -> dict[str, list[str]]:
    sections: dict[str, list[str]] = {
        "main": [],
        "extra": [],
        "side": [],
    }
    current_section = None

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line:
            continue

        lower = line.lower()
        if lower == "#main":
            current_section = "main"
            continue
        if lower == "#extra":
            current_section = "extra"
            continue
        if lower == "!side":
            current_section = "side"
            continue
        if line.startswith("#") or line.startswith("!"):
            continue
        if current_section is None:
            continue

        card_id = normalize_card_id(line)
        if card_id:
            sections[current_section].append(card_id)

    return sections


def sort_deck_archetypes(counter: Counter, unique_cards: dict[str, set[str]]) -> list[dict]:
    names = list(counter.keys())
    names.sort(
        key=lambda name: (
            -counter[name],
            -len(unique_cards.get(name, set())),
            name.lower(),
        )
    )

    return [
        {
            "name": name,
            "copies": counter[name],
            "uniqueCards": len(unique_cards.get(name, set())),
        }
        for name in names
    ]


def sort_player_archetypes(deck_counts: Counter, copy_counts: Counter) -> list[dict]:
    names = list(deck_counts.keys())
    names.sort(
        key=lambda name: (
            -deck_counts[name],
            -copy_counts[name],
            name.lower(),
        )
    )

    return [
        {
            "name": name,
            "decks": deck_counts[name],
            "copies": copy_counts[name],
        }
        for name in names
    ]


def build_deck_stats_entry(deck: dict, week_key: str, week_label: str, card_index: dict[str, dict]) -> dict | None:
    ydk_asset_path = normalize_asset_path(deck.get("ydk"))
    if not ydk_asset_path:
        return None

    ydk_file = asset_path_to_file(ydk_asset_path)
    if not ydk_file.exists():
        return {
            "weekKey": week_key,
            "weekLabel": week_label,
            "player": safe_text(deck.get("player")),
            "title": safe_text(deck.get("title")),
            "ydk": ydk_asset_path,
            "missing": True,
            "mainCount": 0,
            "extraCount": 0,
            "sideCount": 0,
            "resolvedCards": 0,
            "unresolvedCards": 0,
            "topArchetypes": [],
        }

    sections = parse_ydk_file(ydk_file)
    main_extra_ids = sections["main"] + sections["extra"]

    archetype_copies: Counter = Counter()
    archetype_unique_cards: dict[str, set[str]] = defaultdict(set)
    resolved_cards = 0
    unresolved_cards = 0

    for card_id in main_extra_ids:
        meta = card_index.get(card_id)
        if not meta:
            unresolved_cards += 1
            continue

        resolved_cards += 1
        archetype = safe_text(meta.get("archetype"))
        name = safe_text(meta.get("name")) or card_id

        if archetype:
            archetype_copies[archetype] += 1
            archetype_unique_cards[archetype].add(name)

    return {
        "weekKey": week_key,
        "weekLabel": week_label,
        "player": safe_text(deck.get("player")),
        "title": safe_text(deck.get("title")),
        "ydk": ydk_asset_path,
        "missing": False,
        "mainCount": len(sections["main"]),
        "extraCount": len(sections["extra"]),
        "sideCount": len(sections["side"]),
        "resolvedCards": resolved_cards,
        "unresolvedCards": unresolved_cards,
        "topArchetypes": sort_deck_archetypes(archetype_copies, archetype_unique_cards)[:8],
    }


def main() -> int:
    decks_data = json.loads(DECKS_JSON_PATH.read_text(encoding="utf-8"))
    card_index = json.loads(CARD_INDEX_PATH.read_text(encoding="utf-8"))

    by_ydk: dict[str, dict] = {}
    player_deck_counts: Counter = Counter()
    player_archetype_decks: dict[str, Counter] = defaultdict(Counter)
    player_archetype_copies: dict[str, Counter] = defaultdict(Counter)
    player_display_names: dict[str, str] = {}

    for week_key, week in decks_data.items():
        week_label = safe_text(week.get("label")) or week_key

        for deck in week.get("decks", []):
            entry = build_deck_stats_entry(deck, week_key, week_label, card_index)
            if not entry:
                continue

            by_ydk[entry["ydk"]] = entry

            if entry["missing"]:
                continue

            player_key = safe_text(entry["player"]).lower()
            if not player_key:
                continue

            player_display_names[player_key] = safe_text(entry["player"])
            player_deck_counts[player_key] += 1

            archetypes_in_deck = set()
            for archetype_row in entry["topArchetypes"]:
                archetype = archetype_row["name"]
                archetypes_in_deck.add(archetype)
                player_archetype_copies[player_key][archetype] += archetype_row["copies"]

            for archetype in archetypes_in_deck:
                player_archetype_decks[player_key][archetype] += 1

    player_stats: dict[str, dict] = {}
    for player_key, deck_count in player_deck_counts.items():
        player_stats[player_key] = {
            "playerDisplayName": player_display_names.get(player_key, player_key),
            "trackedDeckCount": deck_count,
            "topArchetypes": sort_player_archetypes(
                player_archetype_decks[player_key],
                player_archetype_copies[player_key],
            )[:10],
        }

    payload = {
        "byYdk": by_ydk,
        "playerStats": player_stats,
    }

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

    print(f"Wrote {OUTPUT_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())