import json
import os
import re
from pathlib import Path
from urllib.request import urlopen, Request
from urllib.error import HTTPError, URLError

from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError

ROOT = Path(__file__).resolve().parent.parent
GENERATED_DIR = ROOT / "dist" / "data" / "generated"
GENERATED_DIR.mkdir(parents=True, exist_ok=True)

DEBUG_DIR = ROOT / "debug"
DEBUG_DIR.mkdir(parents=True, exist_ok=True)

YGOPRODECK_API_URL = "https://db.ygoprodeck.com/api/v7/cardinfo.php"
YGOPROG_BINDER_API = "https://api.ygoprog.com/api/binder/{binder_id}"
USER_AGENT = "Mozilla/5.0"

CARD_INDEX_PATH = GENERATED_DIR / "card-index.json"

PLAYER_SOURCES = {
    "asapaska": {
        "binder_id": "69b6c1c3c8cc2ae73f725812",
        "user_env": "YGOPROG_USER_ASAPASKA",
        "pass_env": "YGOPROG_PASS_ASAPASKA",
    },
    # "retroid99": {
    #     "binder_id": "69b6cb6cc8cc2ae73f726070",
    #     "user_env": "YGOPROG_USER_RETROID99",
    #     "pass_env": "YGOPROG_PASS_RETROID99",
    # },
    # "mhkaixer": {
    #     "binder_id": "69bdb8134d2bfff886f45ef0",
    #     "user_env": "YGOPROG_USER_MHKAIXER",
    #     "pass_env": "YGOPROG_PASS_MHKAIXER",
    # },
    # "shiruba": {
    #     "binder_id": "69b71f7fc8cc2ae73f72e5c1",
    #     "user_env": "YGOPROG_USER_SHIRUBA",
    #     "pass_env": "YGOPROG_PASS_SHIRUBA",
    # },
}

JWT_RE = re.compile(r"^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$")


def _first_visible_locator(candidates, timeout=2500):
    for locator in candidates:
        try:
            loc = locator.first
            loc.wait_for(state="visible", timeout=timeout)
            return loc
        except Exception:
            pass
    return None


def _find_username_input(page):
    return _first_visible_locator([
        page.locator('#global-modal input[autocomplete="username"]'),
        page.locator('#global-modal input[name*="user" i]'),
        page.locator('#global-modal input[name*="email" i]'),
        page.locator('#global-modal input[type="email"]'),
        page.locator('#global-modal input[type="text"]'),
        page.get_by_label(re.compile(r"email|display name|username", re.I)),
        page.get_by_placeholder(re.compile(r"email|display name|username", re.I)),
        page.locator('input[autocomplete="username"]'),
        page.locator('input[name*="user" i]'),
        page.locator('input[name*="email" i]'),
        page.locator('input[type="email"]'),
        page.locator('input[type="text"]'),
    ])


def _find_password_input(page):
    return _first_visible_locator([
        page.locator('#global-modal input[autocomplete="current-password"]'),
        page.locator('#global-modal input[name*="pass" i]'),
        page.locator('#global-modal input[type="password"]'),
        page.get_by_label(re.compile(r"password", re.I)),
        page.get_by_placeholder(re.compile(r"password", re.I)),
        page.locator('input[autocomplete="current-password"]'),
        page.locator('input[name*="pass" i]'),
        page.locator('input[type="password"]'),
    ])


def _click_login_trigger_if_needed(page):
    trigger = _first_visible_locator([
        page.get_by_role("button", name=re.compile(r"log ?in|sign ?in", re.I)),
        page.get_by_role("link", name=re.compile(r"log ?in|sign ?in", re.I)),
        page.locator('button:has-text("Login")'),
        page.locator('button:has-text("Log In")'),
        page.locator('button:has-text("Sign In")'),
        page.locator('a:has-text("Login")'),
        page.locator('a:has-text("Log In")'),
        page.locator('a:has-text("Sign In")'),
    ], timeout=1500)

    if trigger:
        trigger.click()
        page.wait_for_timeout(1500)
        return True

    return False


def _extract_token_from_storage(page):
    token = page.evaluate(
        """
        () => {
          const jwt = /^[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+$/;
          const stores = [window.localStorage, window.sessionStorage];

          for (const store of stores) {
            for (let i = 0; i < store.length; i++) {
              const key = store.key(i) || "";
              const value = store.getItem(key) || "";

              if (jwt.test(value)) return value;
              if (/token|auth|jwt/i.test(key) && value) return value;
            }
          }

          return "";
        }
        """
    )
    return token.strip()


def _write_login_debug(page, owner):
    png_path = DEBUG_DIR / f"{owner}-login-debug.png"
    html_path = DEBUG_DIR / f"{owner}-login-debug.html"

    try:
        page.screenshot(path=str(png_path), full_page=True)
    except Exception:
        pass

    try:
        html_path.write_text(page.content(), encoding="utf-8")
    except Exception:
        pass


def _open_login_ui(page):
    # Open the account dropdown / launcher in the header.
    launchers = [
        page.locator("#account-nav-dropdown-box .topbar-link"),
        page.locator("#account-nav-dropdown-box"),
        page.get_by_text("Log In", exact=True),
    ]

    opened = False
    for locator in launchers:
        try:
            locator.first.wait_for(state="visible", timeout=4000)
            locator.first.click()
            page.wait_for_timeout(1200)
            opened = True
            break
        except Exception:
            pass

    if not opened:
        return False

    # Some sites inject the actual login form into a global modal only after this click.
    # Try a second explicit click on the visible "Log In" text if needed.
    for locator in [
        page.get_by_text("Log In", exact=True),
        page.locator('#global-modal button'),
        page.locator('#global-modal input'),
    ]:
        try:
            if locator.first.is_visible(timeout=1500):
                return True
        except Exception:
            pass

    try:
        page.get_by_text("Log In", exact=True).first.click(timeout=1500)
        page.wait_for_timeout(1200)
    except Exception:
        pass

    return True


def _locate_login_form(page):
    page.wait_for_timeout(2500)

    username_input = _find_username_input(page)
    password_input = _find_password_input(page)
    if username_input and password_input:
        return username_input, password_input

    _open_login_ui(page)
    page.wait_for_timeout(2000)

    username_input = _find_username_input(page)
    password_input = _find_password_input(page)
    if username_input and password_input:
        return username_input, password_input

    # Fallback: go to home page and try again.
    page.goto("https://www.ygoprog.com/", wait_until="domcontentloaded")
    page.wait_for_timeout(2500)

    _open_login_ui(page)
    page.wait_for_timeout(2000)

    username_input = _find_username_input(page)
    password_input = _find_password_input(page)
    return username_input, password_input


def login_and_get_fresh_token(username, password, owner):
    if not username or not password:
        raise RuntimeError(f"Missing YGO Prog username/password for {owner}")

    captured = {"token": ""}

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()

        def capture_request(request):
            auth = request.headers.get("authorization", "")
            if auth.lower().startswith("bearer "):
                captured["token"] = auth[7:].strip()

        page.on("request", capture_request)

        page.goto("https://www.ygoprog.com/BinderManagement", wait_until="domcontentloaded")

        username_input, password_input = _locate_login_form(page)

        if not username_input or not password_input:
            _write_login_debug(page, owner)
            browser.close()
            raise RuntimeError(
                f"Could not find login fields for {owner}. "
                f"Check debug/{owner}-login-debug.png and debug/{owner}-login-debug.html."
            )

        username_input.fill(username)
        password_input.fill(password)

        submit = _first_visible_locator([
            page.locator('#global-modal button[type="submit"]'),
            page.locator('#global-modal button'),
            page.get_by_role("button", name=re.compile(r"log ?in|sign ?in", re.I)),
            page.locator('button[type="submit"]'),
            page.locator('button:has-text("Login")'),
            page.locator('button:has-text("Log In")'),
            page.locator('button:has-text("Sign In")'),
        ], timeout=2000)

        if submit:
            submit.click()
        else:
            password_input.press("Enter")

        try:
            page.wait_for_load_state("networkidle", timeout=20000)
        except PlaywrightTimeoutError:
            page.wait_for_timeout(5000)

        page.goto("https://www.ygoprog.com/BinderManagement", wait_until="domcontentloaded")
        try:
            page.wait_for_load_state("networkidle", timeout=15000)
        except PlaywrightTimeoutError:
            page.wait_for_timeout(4000)

        if not captured["token"]:
            captured["token"] = _extract_token_from_storage(page)

        if not captured["token"]:
            _write_login_debug(page, owner)

        browser.close()

    token = captured["token"].strip()
    if not token or not JWT_RE.match(token):
        raise RuntimeError(
            f"Could not extract a fresh JWT for {owner}. "
            f"Check debug/{owner}-login-debug artifacts."
        )

    return token


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
        json.dumps(card_index, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8"
    )

    return card_index


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


def build_output_row(owner, api_row, card_index):
    cardid_raw = api_row.get("cardId", "")
    cardid_str = str(cardid_raw).strip()
    meta = card_index.get(cardid_str)

    fallback_name = (api_row.get("name") or "").strip()
    quantity = safe_int(api_row.get("count", 1), 1)
    set_code = (api_row.get("code") or "").strip()
    set_name = (api_row.get("set") or "").strip()
    rarity = (api_row.get("rarity") or "").strip()

    if not meta:
        numeric_cardid = safe_int(cardid_str, None)
        return {
            "owner": owner,
            "cardid": numeric_cardid,
            "name": fallback_name,
            "quantity": quantity,
            "set_code": set_code,
            "set_name": set_name,
            "rarity": rarity,
            "condition": "",
            "edition": "",
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
        "name": fallback_name or meta["name"],
        "quantity": quantity,
        "set_code": set_code,
        "set_name": set_name,
        "rarity": rarity,
        "condition": "",
        "edition": "",
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


def build_player_binder_from_api(owner, binder_id, token, card_index):
    raw_cards = fetch_remote_binder_cards(binder_id, token)
    return [build_output_row(owner, row, card_index) for row in raw_cards]


def main():
    card_index = load_or_build_card_index()
    all_binders = {}

    for owner, source in PLAYER_SOURCES.items():
        username = os.environ.get(source["user_env"], "").strip()
        password = os.environ.get(source["pass_env"], "").strip()

        if not username or not password:
            raise RuntimeError(f"Missing credentials for {owner}")

        print(f"Logging in for {owner}...")
        token = login_and_get_fresh_token(username, password, owner)

        binder = build_player_binder_from_api(
            owner=owner,
            binder_id=source["binder_id"],
            token=token,
            card_index=card_index,
        )

        all_binders[owner] = binder

        out_path = GENERATED_DIR / f"{owner}.json"
        out_path.write_text(
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