#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

API_BASE = "https://discord.com/api/v10"
DEFAULT_CHANNEL_ID = "1482834909746954381"
DEFAULT_ROLE_ID = "1484665184441208832"
DEFAULT_TITLE = "New Website Update"
EMBED_COLOR = 0xF1C40F
USER_AGENT = "thicc-magician-girl-website-notifier/2.0"
ROOT = Path(__file__).resolve().parent.parent
DEFAULT_SITE_JSON = ROOT / "dist" / "data" / "site.json"
DEFAULT_DECK_STATS_JSON = ROOT / "dist" / "data" / "generated" / "deck-stats.json"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Post a Discord embed for the newest website week, including the winner "
            "and each player's top archetype."
        )
    )
    parser.add_argument(
        "--title",
        default=DEFAULT_TITLE,
        help=f"Embed title (default: {DEFAULT_TITLE!r}).",
    )
    parser.add_argument(
        "--channel-id",
        default=os.environ.get("DISCORD_CHANNEL_ID", DEFAULT_CHANNEL_ID),
        help=(
            "Target Discord channel ID. Defaults to DISCORD_CHANNEL_ID env var or "
            f"{DEFAULT_CHANNEL_ID}."
        ),
    )
    parser.add_argument(
        "--role-id",
        default=os.environ.get("DISCORD_ROLE_ID", DEFAULT_ROLE_ID).strip(),
        help=(
            "Discord role ID to ping. Defaults to DISCORD_ROLE_ID env var or "
            f"{DEFAULT_ROLE_ID}."
        ),
    )
    parser.add_argument(
        "--site-json",
        default=str(DEFAULT_SITE_JSON),
        help=f"Path to site.json (default: {DEFAULT_SITE_JSON}).",
    )
    parser.add_argument(
        "--deck-stats-json",
        default=str(DEFAULT_DECK_STATS_JSON),
        help=(
            "Path to deck-stats.json (default: "
            f"{DEFAULT_DECK_STATS_JSON})."
        ),
    )
    parser.add_argument(
        "--week",
        default="",
        help=(
            "Optional week override such as 'Week 4' or '4'. "
            "Defaults to the newest week found in site.json."
        ),
    )
    parser.add_argument(
        "--added",
        default="",
        help=(
            "Optional custom Added line. Defaults to '<latest week> Stats and Decklists'."
        ),
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print the payload instead of sending it.",
    )
    return parser.parse_args()


def safe_text(value: object) -> str:
    return str(value).strip() if value is not None else ""


def parse_week_number(value: object) -> int:
    text = safe_text(value)
    if not text:
        return -1

    match = re.search(r"week\D*(\d+)", text, flags=re.IGNORECASE)
    if match:
        return int(match.group(1))

    digits = re.search(r"(\d+)", text)
    if digits:
        return int(digits.group(1))

    return -1


def load_json(path_like: str | Path) -> object:
    path = Path(path_like)
    if not path.exists():
        raise RuntimeError(f"Missing file: {path}")
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"Invalid JSON in {path}: {exc}") from exc


def choose_latest_week(site_data: dict, requested_week: str = "") -> dict:
    weeks = site_data.get("weeks")
    if not isinstance(weeks, list) or not weeks:
        raise RuntimeError("site.json does not contain a non-empty weeks array.")

    if requested_week:
        requested_number = parse_week_number(requested_week)
        requested_text = safe_text(requested_week).casefold()

        for week in weeks:
            week_name = safe_text(week.get("week"))
            if requested_number >= 0 and parse_week_number(week_name) == requested_number:
                return week
            if requested_text and week_name.casefold() == requested_text:
                return week

        raise RuntimeError(f"Could not find requested week: {requested_week!r}")

    ranked_weeks = sorted(
        weeks,
        key=lambda week: (
            parse_week_number(week.get("week")),
            safe_text(week.get("date")),
        ),
    )
    latest = ranked_weeks[-1]
    if parse_week_number(latest.get("week")) < 0:
        raise RuntimeError("Could not determine the newest week from site.json.")
    return latest


def find_deck_entry_for_player(entries: list[dict], week_number: int, player_name: str) -> dict | None:
    player_key = safe_text(player_name).casefold()
    for entry in entries:
        entry_week_number = max(
            parse_week_number(entry.get("weekKey")),
            parse_week_number(entry.get("weekLabel")),
            parse_week_number(entry.get("title")),
        )
        if entry_week_number != week_number:
            continue
        if safe_text(entry.get("player")).casefold() != player_key:
            continue
        return entry
    return None


def build_week_summary(latest_week: dict, deck_stats_data: dict) -> tuple[str, list[str], str, str]:
    week_name = safe_text(latest_week.get("week"))
    if not week_name:
        raise RuntimeError("Latest week is missing its week label.")

    week_number = parse_week_number(week_name)
    if week_number < 0:
        raise RuntimeError(f"Could not parse week number from {week_name!r}.")

    winner = safe_text(latest_week.get("winner")) or "Unknown"
    format_name = safe_text(latest_week.get("format"))
    standings = latest_week.get("standings") if isinstance(latest_week.get("standings"), list) else []

    by_ydk = deck_stats_data.get("byYdk")
    if not isinstance(by_ydk, dict):
        raise RuntimeError("deck-stats.json does not contain a byYdk object.")

    entries = [entry for entry in by_ydk.values() if isinstance(entry, dict)]
    players_in_order: list[str] = []
    seen: set[str] = set()

    for row in standings:
        player_name = safe_text(row.get("player")) if isinstance(row, dict) else ""
        if not player_name:
            continue
        key = player_name.casefold()
        if key in seen:
            continue
        seen.add(key)
        players_in_order.append(player_name)

    extra_entries = [
        entry for entry in entries
        if max(
            parse_week_number(entry.get("weekKey")),
            parse_week_number(entry.get("weekLabel")),
            parse_week_number(entry.get("title")),
        ) == week_number
    ]
    extra_entries.sort(key=lambda entry: safe_text(entry.get("player")).casefold())

    for entry in extra_entries:
        player_name = safe_text(entry.get("player"))
        key = player_name.casefold()
        if not player_name or key in seen:
            continue
        seen.add(key)
        players_in_order.append(player_name)

    if not players_in_order:
        raise RuntimeError(f"No players found for {week_name}.")

    archetype_lines: list[str] = []
    for player_name in players_in_order:
        entry = find_deck_entry_for_player(entries, week_number, player_name)
        archetype = "Unknown"
        if entry and not entry.get("missing"):
            top_archetypes = entry.get("topArchetypes")
            if isinstance(top_archetypes, list) and top_archetypes:
                top_name = safe_text(top_archetypes[0].get("name")) if isinstance(top_archetypes[0], dict) else ""
                if top_name:
                    archetype = top_name
        archetype_lines.append(f"• {player_name}: {archetype}")

    footer = week_name
    if format_name:
        footer = f"{week_name} • {format_name}"

    return week_name, archetype_lines, winner, footer


def get_bot_token() -> str:
    token = os.environ.get("DISCORD_BOT_TOKEN", "").strip()
    if not token:
        raise RuntimeError("Missing DISCORD_BOT_TOKEN environment variable.")
    return token


def discord_request(
    token: str,
    method: str,
    path: str,
    payload: dict | None = None,
) -> dict | list | None:
    headers = {
        "Authorization": f"Bot {token}",
        "User-Agent": USER_AGENT,
    }
    data = None

    if payload is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(payload).encode("utf-8")

    req = urllib.request.Request(
        f"{API_BASE}{path}",
        data=data,
        headers=headers,
        method=method,
    )

    try:
        with urllib.request.urlopen(req) as resp:
            raw = resp.read().decode("utf-8")
            if not raw:
                return None
            return json.loads(raw)
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(
            f"Discord API error {exc.code} for {method} {path}: {body}"
        ) from exc


def build_payload(
    title: str,
    role_id: str,
    added_line: str,
    archetype_lines: list[str],
    winner: str,
    footer_text: str,
) -> dict:
    clean_role_id = safe_text(role_id)
    if not clean_role_id:
        raise RuntimeError("Missing Discord role ID.")

    clean_added_line = safe_text(added_line)
    if not clean_added_line:
        raise RuntimeError("Added line cannot be empty.")

    clean_archetypes = [line for line in archetype_lines if safe_text(line)]
    if not clean_archetypes:
        raise RuntimeError("Archetype section would be empty.")

    description = "\n".join(
        [
            "Added:",
            f"• {clean_added_line}",
            "",
            "Archetypes played",
            *clean_archetypes,
            "",
            f"Winner: {winner}",
        ]
    )

    return {
        "content": f"<@&{clean_role_id}>",
        "allowed_mentions": {
            "roles": [clean_role_id],
            "parse": [],
        },
        "embeds": [
            {
                "title": title,
                "description": description,
                "color": EMBED_COLOR,
                "footer": {
                    "text": footer_text,
                },
            }
        ],
    }


def main() -> int:
    args = parse_args()
    site_data = load_json(args.site_json)
    deck_stats_data = load_json(args.deck_stats_json)

    if not isinstance(site_data, dict):
        raise RuntimeError("site.json root must be a JSON object.")
    if not isinstance(deck_stats_data, dict):
        raise RuntimeError("deck-stats.json root must be a JSON object.")

    latest_week = choose_latest_week(site_data, args.week)
    week_name, archetype_lines, winner, footer_text = build_week_summary(
        latest_week,
        deck_stats_data,
    )

    added_line = safe_text(args.added) or f"{week_name} Stats and Decklists"
    payload = build_payload(
        args.title,
        args.role_id,
        added_line,
        archetype_lines,
        winner,
        footer_text,
    )

    if args.dry_run:
        print(json.dumps(payload, indent=2, ensure_ascii=False))
        return 0

    token = get_bot_token()
    discord_request(
        token,
        "POST",
        f"/channels/{args.channel_id}/messages",
        payload=payload,
    )
    print(
        f"Posted website update for {week_name} to channel {args.channel_id} and pinged role {args.role_id}."
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except RuntimeError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        raise SystemExit(1)
