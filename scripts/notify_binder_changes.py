#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import subprocess
import sys
import urllib.error
import urllib.request
from collections import Counter
from pathlib import PurePosixPath

BASE_REF = sys.argv[1] if len(sys.argv) > 1 else "HEAD~1"
HEAD_REF = sys.argv[2] if len(sys.argv) > 2 else "HEAD"

DISCORD_BOT_TOKEN = os.environ["DISCORD_BOT_TOKEN"]
DISCORD_CHANNEL_ID = os.environ["DISCORD_CHANNEL_ID"]

API_BASE = "https://discord.com/api/v10"
EMBED_COLOR = 0xF1C40F

# Discord hard limits are a bit higher, but we stay under them on purpose.
FIELD_VALUE_SOFT_LIMIT = 1000
EMBED_TEXT_SOFT_LIMIT = 5500
MAX_FIELDS_PER_EMBED = 24


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


def safe_line(qty: int, name: str) -> str:
    line = f"• {qty}x {name}"
    if len(line) <= FIELD_VALUE_SOFT_LIMIT:
        return line

    # Extremely defensive; card names should not realistically hit this.
    keep = max(1, FIELD_VALUE_SOFT_LIMIT - len(f"• {qty}x …"))
    return f"• {qty}x {name[:keep]}…"


def chunk_lines(items: list[tuple[str, int]]) -> list[str]:
    if not items:
        return []

    chunks: list[str] = []
    current = ""

    for name, qty in items:
        line = safe_line(qty, name)

        if not current:
            current = line
            continue

        candidate = current + "\n" + line
        if len(candidate) <= FIELD_VALUE_SOFT_LIMIT:
            current = candidate
        else:
            chunks.append(current)
            current = line

    if current:
        chunks.append(current)

    return chunks


def build_fields(removed: list[tuple[str, int]], added: list[tuple[str, int]]) -> list[dict]:
    fields: list[dict] = []

    removed_chunks = chunk_lines(removed)
    added_chunks = chunk_lines(added)

    for i, chunk in enumerate(removed_chunks):
        fields.append({
            "name": "Removed" if i == 0 else "Removed (cont.)",
            "value": chunk,
            "inline": False,
        })

    for i, chunk in enumerate(added_chunks):
        fields.append({
            "name": "Added" if i == 0 else "Added (cont.)",
            "value": chunk,
            "inline": False,
        })

    return fields


def embed_text_size(embed: dict) -> int:
    total = 0
    total += len(embed.get("title", ""))
    total += len(embed.get("description", ""))
    if "footer" in embed:
        total += len(embed["footer"].get("text", ""))
    if "author" in embed:
        total += len(embed["author"].get("name", ""))
    for field in embed.get("fields", []):
        total += len(field.get("name", ""))
        total += len(field.get("value", ""))
    return total


def make_embeds_for_owner(owner: str, removed: list[tuple[str, int]], added: list[tuple[str, int]]) -> list[dict]:
    all_fields = build_fields(removed, added)
    if not all_fields:
        return []

    embeds: list[dict] = []
    current_fields: list[dict] = []

    def new_embed(fields: list[dict], index: int) -> dict:
        title = owner if index == 0 else f"{owner} (cont. {index + 1})"
        return {
            "title": title,
            "color": EMBED_COLOR,
            "fields": fields,
        }

    embed_index = 0

    for field in all_fields:
        candidate_fields = current_fields + [field]
        candidate_embed = new_embed(candidate_fields, embed_index)

        too_many_fields = len(candidate_fields) > MAX_FIELDS_PER_EMBED
        too_much_text = embed_text_size(candidate_embed) > EMBED_TEXT_SOFT_LIMIT

        if current_fields and (too_many_fields or too_much_text):
            embeds.append(new_embed(current_fields, embed_index))
            embed_index += 1
            current_fields = [field]
        else:
            current_fields = candidate_fields

    if current_fields:
        embeds.append(new_embed(current_fields, embed_index))

    return embeds


def post_embed_to_discord(embed: dict) -> None:
    payload = json.dumps({"embeds": [embed]}).encode("utf-8")

    req = urllib.request.Request(
        f"{API_BASE}/channels/{DISCORD_CHANNEL_ID}/messages",
        data=payload,
        headers={
            "Authorization": f"Bot {DISCORD_BOT_TOKEN}",
            "Content-Type": "application/json",
            "User-Agent": "thicc-magician-girl-binder-notifier/3.0",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req) as resp:
            print(f"Discord response: {resp.status}")
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        print(f"Discord HTTP error {e.code}: {body}")
        raise


def main() -> int:
    files = changed_json_files(BASE_REF, HEAD_REF)
    if not files:
        print("No changed binder JSON files found.")
        return 0

    embeds_to_send: list[dict] = []

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
            embeds_to_send.extend(make_embeds_for_owner(owner, removed, added))

    if not embeds_to_send:
        print("No card-level binder deltas found.")
        return 0

    for embed in embeds_to_send:
        post_embed_to_discord(embed)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())