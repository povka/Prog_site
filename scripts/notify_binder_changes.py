#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import subprocess
import sys
from collections import Counter
from pathlib import PurePosixPath
import urllib.request


BASE_REF = sys.argv[1] if len(sys.argv) > 1 else "HEAD~1"
HEAD_REF = sys.argv[2] if len(sys.argv) > 2 else "HEAD"

DISCORD_BOT_TOKEN = os.environ["DISCORD_BOT_TOKEN"]
DISCORD_CHANNEL_ID = os.environ["DISCORD_CHANNEL_ID"]

API_BASE = "https://discord.com/api/v10"

# Yellow-ish embed color
EMBED_COLOR = 0xF1C40F


def git(*args: str) -> str:
    return subprocess.check_output(["git", *args], text=True).strip()


def changed_json_files(base_ref: str, head_ref: str) -> list[str]:
    out = git("diff", "--name-only", base_ref, head_ref, "--", "dist/data/generated")
    files: list[str] = []

    for line in out.splitlines():
        path = PurePosixPath(line.strip())
        if path.suffix != ".json":
            continue
        if path.name == "all-binders.json":
            # Skip aggregate file so the same change is not reported twice.
            continue
        files.append(str(path))

    return sorted(set(files))


def read_json_from_git(rev: str, path: str) -> list[dict]:
    try:
        raw = git("show", f"{rev}:{path}")
    except subprocess.CalledProcessError:
        return []

    data = json.loads(raw)
    return data if isinstance(data, list) else []


def to_counter(rows: list[dict]) -> Counter:
    counts: Counter = Counter()

    for row in rows:
        name = str(row.get("name", "")).strip()
        if not name:
            continue

        try:
            qty = int(row.get("quantity", 1) or 1)
        except (TypeError, ValueError):
            qty = 1

        counts[name] += qty

    return counts


def owner_name_from_path(path: str) -> str:
    return PurePosixPath(path).stem


def build_list(items: list[tuple[str, int]]) -> str:
    if not items:
        return "None"

    return "\n".join(f"• {qty}x {name}" for name, qty in items)


def make_embed(owner: str, removed: list[tuple[str, int]], added: list[tuple[str, int]]) -> dict:
    fields = []

    if removed:
        fields.append({
            "name": "Removed",
            "value": build_list(removed),
            "inline": False
        })

    if added:
        fields.append({
            "name": "Added",
            "value": build_list(added),
            "inline": False
        })

    return {
        "title": owner,
        "color": EMBED_COLOR,
        "fields": fields
    }


def chunk_embeds(embeds: list[dict], max_per_message: int = 10) -> list[list[dict]]:
    return [embeds[i:i + max_per_message] for i in range(0, len(embeds), max_per_message)]


def post_embeds_to_discord(embeds: list[dict]) -> None:
    payload = json.dumps({"embeds": embeds}).encode("utf-8")

    req = urllib.request.Request(
        f"{API_BASE}/channels/{DISCORD_CHANNEL_ID}/messages",
        data=payload,
        headers={
            "Authorization": f"Bot {DISCORD_BOT_TOKEN}",
            "Content-Type": "application/json",
            "User-Agent": "thicc-magician-girl-binder-notifier/2.0",
        },
        method="POST",
    )

    with urllib.request.urlopen(req) as resp:
        print(f"Discord response: {resp.status}")


def main() -> int:
    files = changed_json_files(BASE_REF, HEAD_REF)
    if not files:
        print("No changed binder JSON files found.")
        return 0

    embeds: list[dict] = []

    for path in files:
        old_rows = read_json_from_git(BASE_REF, path)
        new_rows = read_json_from_git(HEAD_REF, path)

        old_counts = to_counter(old_rows)
        new_counts = to_counter(new_rows)

        removed: list[tuple[str, int]] = []
        added: list[tuple[str, int]] = []

        for card_name in sorted(set(old_counts) | set(new_counts)):
            delta = new_counts[card_name] - old_counts[card_name]
            if delta < 0:
                removed.append((card_name, -delta))
            elif delta > 0:
                added.append((card_name, delta))

        if removed or added:
            owner = owner_name_from_path(path)
            embeds.append(make_embed(owner, removed, added))

    if not embeds:
        print("No card-level binder deltas found.")
        return 0

    for embed_batch in chunk_embeds(embeds):
        post_embeds_to_discord(embed_batch)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())