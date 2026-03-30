#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BANLIST_DIR = ROOT / "dist" / "data" / "Banlists"
MANIFEST_PATH = BANLIST_DIR / "banlists.json"

DEFAULT_BANLIST = "Pharaoh's Servant.conf"


def main() -> int:
    BANLIST_DIR.mkdir(parents=True, exist_ok=True)

    files = sorted(
        path.name
        for path in BANLIST_DIR.glob("*.conf")
        if path.is_file()
    )

    default_file = (
        DEFAULT_BANLIST
        if DEFAULT_BANLIST in files
        else (files[0] if files else "")
    )

    payload = {
        "default": default_file,
        "files": files,
    }

    MANIFEST_PATH.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

    print(f"Wrote {MANIFEST_PATH} with {len(files)} banlists")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())