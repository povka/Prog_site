#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import urllib.request
from collections import Counter
from pathlib import PurePosixPath

BASE_REF = sys.argv[1] if len(sys.argv) > 1 else "HEAD~1"
HEAD_REF = sys.argv[2] if len(sys.argv) > 2 else "HEAD"

DISCORD_BOT_TOKEN = os.environ["DISCORD_BOT_TOKEN"]
DISCORD_CHANNEL_ID = os.environ["DISCORD_CHANNEL_ID"]

API_BASE = "https://discord.com/api/v10"


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
            # Skip aggregate file so changes are not announced twice.
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


DISCORD_ESCAPE_RE = re.compile(r"([\\*_`~|>])")


def esc(text: str) -> str:
    return DISCORD_ESCAPE_RE.sub(r"\\\1", text)


def owner_name_from_path(path: str) -> str:
    return PurePosixPath(path).stem


def make_block(owner: str, removed: list[tuple[str, int]], added: list[tuple[str, int]]) -> str:
    lines = [f"**{esc(owner)}**"]

    if removed:
        lines.append("Removed:")
        for name, qty in removed:
            lines.append(f"- {qty}x {esc(name)}")

    if added:
        if removed:
            lines.append("")
        lines.append("Added:")
        for name, qty in added:
            lines.append(f"- {qty}x {esc(name)}")

    return "\n".join(lines)


def chunk_messages(blocks: list[str], prefix: str, limit: int = 1900) -> list[str]:
    messages: list[str] = []
    current = prefix

    for block in blocks:
        separator = "" if current == prefix else "\n\n"
        candidate = current + separator + block

        if len(candidate) <= limit:
            current = candidate
        else:
            if current.strip():
                messages.append(current)
            current = prefix + block if prefix else block
            prefix = ""

    if current.strip():
        messages.append(current)

    return messages


def post_to_discord(content: str) -> None:
    payload = json.dumps({"content": content}).encode("utf-8")

    req = urllib.request.Request(
        f"{API_BASE}/channels/{DISCORD_CHANNEL_ID}/messages",
        data=payload,
        headers={
            "Authorization": f"Bot {DISCORD_BOT_TOKEN}",
            "Content-Type": "application/json",
            "User-Agent": "thicc-magician-girl-binder-notifier/1.0",
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

    blocks: list[str] = []

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
            blocks.append(make_block(owner, removed, added))

    if not blocks:
        print("No card-level binder deltas found.")
        return 0

    commit_url = None
    repo = os.getenv("GITHUB_REPOSITORY")
    sha = os.getenv("GITHUB_SHA")
    server = os.getenv("GITHUB_SERVER_URL", "https://github.com")
    if repo and sha:
        commit_url = f"{server}/{repo}/commit/{sha}"

    prefix = "**Thicc Magician Girl detected binder changes**"
    if commit_url:
        prefix += f"\n{commit_url}\n\n"
    else:
        prefix += "\n\n"

    for message in chunk_messages(blocks, prefix):
        post_to_discord(message)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())