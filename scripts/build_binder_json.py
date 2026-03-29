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
    "retroid99": {
        "binder_id": "69b6cb6cc8cc2ae73f726070",
        "user_env": "YGOPROG_USER_RETROID99",
        "pass_env": "YGOPROG_PASS_RETROID99",
    },
    "mhkaixer": {
        "binder_id": "69bdb8134d2bfff886f45ef0",
        "user_env": "YGOPROG_USER_MHKAIXER",
        "pass_env": "YGOPROG_PASS_MHKAIXER",
    },
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


def write_text_if_changed(path: Path, content: str) -> bool:
    existing = None

    if path.exists():
        try:
            existing = path.read_text(encoding="utf-8")
        except Exception:
            existing = None

    if existing == content:
        return False

    path.write_text(content, encoding="utf-8")
    return True

def _find_username_input(page):
    return _first_visible_locator([
        page.locator('#global-modal-content input[autocomplete="username"]'),
        page.locator('#global-modal-content input[type="email"]'),
        page.locator('#global-modal-content input[type="text"]'),
        page.locator('#global-modal-content input[name*="user" i]'),
        page.locator('#global-modal-content input[name*="email" i]'),
    ])


def _find_password_input(page):
    return _first_visible_locator([
        page.locator('#global-modal-content input[autocomplete="current-password"]'),
        page.locator('#global-modal-content input[type="password"]'),
        page.locator('#global-modal-content input[name*="pass" i]'),
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
    launchers = [
        page.locator('u.in-text-link[title="Open login modal"]'),
        page.locator('p.content-box u.in-text-link'),
        page.get_by_text("Log In", exact=True),
        page.locator("#account-nav-dropdown-box .topbar-link"),
    ]

    for locator in launchers:
        try:
            locator.first.wait_for(state="visible", timeout=4000)
            locator.first.click(timeout=3000)
            page.wait_for_timeout(2000)

            # Login modal content should now be injected.
            has_inputs = page.locator('#global-modal-content input').count() > 0
            if has_inputs:
                return True
        except Exception:
            pass

    return False


def _locate_login_form(page):
    page.wait_for_timeout(2500)

    username_input = _find_username_input(page)
    password_input = _find_password_input(page)
    if username_input and password_input:
        return username_input, password_input

    opened = _open_login_ui(page)
    page.wait_for_timeout(2000)

    username_input = _find_username_input(page)
    password_input = _find_password_input(page)
    if username_input and password_input:
        return username_input, password_input

    if not opened:
        try:
            page.goto("https://www.ygoprog.com/BinderManagement", wait_until="domcontentloaded")
            page.wait_for_timeout(2000)
            _open_login_ui(page)
            page.wait_for_timeout(2000)
        except Exception:
            pass

    username_input = _find_username_input(page)
    password_input = _find_password_input(page)
    return username_input, password_input


def login_and_get_fresh_token(username, password, owner):
    if not username or not password:
        raise RuntimeError(f"Missing YGO Prog username/password for {owner}")

    captured = {
        "token": "",
        "requests": [],
        "responses": [],
    }

    def _record_request(request):
        try:
            auth = request.headers.get("authorization", "")
        except Exception:
            auth = ""

        entry = {
            "url": request.url,
            "method": request.method,
            "has_auth": bool(auth),
            "auth_prefix": auth[:20] if auth else "",
        }
        captured["requests"].append(entry)

        if auth.lower().startswith("bearer "):
            token = auth[7:].strip()
            if JWT_RE.match(token):
                captured["token"] = token

    def _record_response(response):
        try:
            url = response.url
            status = response.status
            headers = response.headers
        except Exception:
            return

        content_type = (headers or {}).get("content-type", "")
        entry = {
            "url": url,
            "status": status,
            "content_type": content_type,
        }

        body_preview = ""
        if "application/json" in content_type.lower():
            try:
                data = response.json()
                entry["json_keys"] = list(data.keys()) if isinstance(data, dict) else []
                if isinstance(data, dict):
                    for key in ("token", "accessToken", "jwt", "authToken"):
                        value = data.get(key)
                        if isinstance(value, str) and JWT_RE.match(value.strip()):
                            captured["token"] = value.strip()
                    body_preview = json.dumps(data)[:1000]
            except Exception:
                pass

        if body_preview:
            entry["body_preview"] = body_preview

        captured["responses"].append(entry)

    def _write_auth_debug(page, suffix="final"):
        debug_json = DEBUG_DIR / f"{owner}-auth-debug-{suffix}.json"
        debug_png = DEBUG_DIR / f"{owner}-login-debug-{suffix}.png"
        debug_html = DEBUG_DIR / f"{owner}-login-debug-{suffix}.html"

        client_capture = {}
        try:
            client_capture = page.evaluate(
                """
                () => {
                    const readStore = (store) => {
                        const out = {};
                        for (let i = 0; i < store.length; i++) {
                            const k = store.key(i);
                            out[k] = store.getItem(k);
                        }
                        return out;
                    };

                    return {
                        href: location.href,
                        title: document.title,
                        globalModalHtml: document.querySelector('#global-modal-content')?.innerHTML || '',
                        globalModalText: document.querySelector('#global-modal-content')?.textContent || '',
                        hasGlobalModalInput: !!document.querySelector('#global-modal-content input'),
                        localStorage: readStore(window.localStorage),
                        sessionStorage: readStore(window.sessionStorage),
                        authCapture: window.__authCapture || null,
                    };
                }
                """
            )
        except Exception as e:
            client_capture = {"error": str(e)}

        payload = {
            "captured_token": bool(captured["token"]),
            "requests": captured["requests"][-50:],
            "responses": captured["responses"][-50:],
            "client_capture": client_capture,
        }

        try:
            debug_json.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
        except Exception:
            pass

        try:
            page.screenshot(path=str(debug_png), full_page=True)
        except Exception:
            pass

        try:
            debug_html.write_text(page.content(), encoding="utf-8")
        except Exception:
            pass

    def _extract_client_token(page):
        try:
            result = page.evaluate(
                """
                () => {
                    const jwt = /^[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+$/;

                    const checkStore = (store) => {
                        for (let i = 0; i < store.length; i++) {
                            const key = store.key(i) || "";
                            const value = store.getItem(key) || "";
                            if (jwt.test(value)) return value;
                            if (/token|auth|jwt/i.test(key) && value && jwt.test(value)) return value;
                        }
                        return "";
                    };

                    if (window.__authCapture?.token && jwt.test(window.__authCapture.token)) {
                        return window.__authCapture.token;
                    }

                    const local = checkStore(window.localStorage);
                    if (local) return local;

                    const session = checkStore(window.sessionStorage);
                    if (session) return session;

                    return "";
                }
                """
            )
            return (result or "").strip()
        except Exception:
            return ""

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()

        context.route(
            "**/*",
            lambda route: route.abort()
            if any(
                bad in route.request.url
                for bad in [
                    "googlesyndication.com",
                    "doubleclick.net",
                    "googleadservices.com",
                    "fundingchoicesmessages.google.com",
                ]
            )
            else route.continue_()
        )

        context.add_init_script(
            """
            (() => {
                const jwt = /^[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+$/;
                window.__authCapture = { token: "", requests: [], responses: [] };

                const trySetToken = (value) => {
                    if (typeof value === "string" && jwt.test(value)) {
                        window.__authCapture.token = value;
                    }
                };

                const origFetch = window.fetch;
                window.fetch = async (...args) => {
                    const req = args[1] || {};
                    const headers = req.headers || {};
                    let auth = "";

                    if (headers instanceof Headers) {
                        auth = headers.get("authorization") || "";
                    } else if (typeof headers === "object") {
                        auth = headers.Authorization || headers.authorization || "";
                    }

                    if (typeof auth === "string" && auth.toLowerCase().startsWith("bearer ")) {
                        trySetToken(auth.slice(7).trim());
                    }

                    const res = await origFetch(...args);

                    try {
                        const clone = res.clone();
                        const ct = clone.headers.get("content-type") || "";
                        if (ct.includes("application/json")) {
                            const data = await clone.json();
                            if (data && typeof data === "object") {
                                ["token", "accessToken", "jwt", "authToken"].forEach((k) => {
                                    if (typeof data[k] === "string") trySetToken(data[k]);
                                });
                            }
                        }
                    } catch {}

                    return res;
                };

                const origSetItem = Storage.prototype.setItem;
                Storage.prototype.setItem = function(k, v) {
                    trySetToken(v);
                    return origSetItem.call(this, k, v);
                };

                const origOpen = XMLHttpRequest.prototype.open;
                const origSetHeader = XMLHttpRequest.prototype.setRequestHeader;
                XMLHttpRequest.prototype.open = function(...args) {
                    this.__url = args[1];
                    return origOpen.apply(this, args);
                };
                XMLHttpRequest.prototype.setRequestHeader = function(name, value) {
                    if (String(name).toLowerCase() === "authorization" && String(value).toLowerCase().startsWith("bearer ")) {
                        trySetToken(String(value).slice(7).trim());
                    }
                    return origSetHeader.apply(this, [name, value]);
                };
            })();
            """
        )

        page = context.new_page()
        page.on("request", _record_request)
        page.on("response", _record_response)

        page.goto("https://www.ygoprog.com/BinderManagement", wait_until="domcontentloaded")
        page.wait_for_timeout(3000)

        opened = False

        for locator in [
            page.locator('u.in-text-link[title="Open login modal"]'),
            page.locator('#account-nav-dropdown-box .topbar-link'),
            page.get_by_text("Log In", exact=True),
        ]:
            try:
                locator.first.wait_for(state="visible", timeout=3000)
                locator.first.click(force=True, timeout=3000)
                page.wait_for_timeout(2500)
                opened = True
                break
            except Exception:
                pass

        _write_auth_debug(page, "after-open-attempt")

        username_input = _find_username_input(page)
        password_input = _find_password_input(page)

        if not username_input or not password_input:
            browser.close()
            raise RuntimeError(
                f"Could not find login fields for {owner}. "
                f"Check debug/{owner}-login-debug-after-open-attempt.html and .png."
            )

        username_input.fill(username)
        password_input.fill(password)

        _write_auth_debug(page, "before-submit")

        submitted = False
        try:
            password_input.press("Enter")
            submitted = True
        except Exception:
            pass

        if not submitted:
            submit = _first_visible_locator([
                page.get_by_role("button", name=re.compile(r"^log ?in$|^sign ?in$", re.I)),
                page.locator('#global-modal-content button[type="submit"]'),
                page.locator('#global-modal-content .black-button:not(.white-button)'),
            ], timeout=3000)

            if not submit:
                _write_auth_debug(page, "no-submit-button")
                browser.close()
                raise RuntimeError(f"Could not find login submit button for {owner}")

            submit.click(force=True, timeout=3000)

        for _ in range(30):
            if captured["token"]:
                break

            token = _extract_client_token(page)
            if token and JWT_RE.match(token):
                captured["token"] = token
                break

            page.wait_for_timeout(500)

        if not captured["token"]:
            _write_auth_debug(page, "after-submit-no-token")
            browser.close()
            raise RuntimeError(
                f"Could not extract a fresh JWT for {owner}. "
                f"Check debug/{owner}-auth-debug-after-submit-no-token.json and matching html/png."
            )

        token = captured["token"].strip()

        page.goto("https://www.ygoprog.com/BinderManagement", wait_until="domcontentloaded")
        page.wait_for_timeout(2000)

        browser.close()

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
        content = json.dumps(binder, indent=2, ensure_ascii=False) + "\n"

        if write_text_if_changed(out_path, content):
            print(f"Updated {owner}.json with {len(binder)} entries")
        else:
            print(f"No change for {owner}.json")

    all_binders_path = GENERATED_DIR / "all-binders.json"
    all_binders_content = json.dumps(all_binders, indent=2, ensure_ascii=False) + "\n"

    if write_text_if_changed(all_binders_path, all_binders_content):
        print("Updated all-binders.json")
    else:
        print("No change for all-binders.json")

    print("Done.")


if __name__ == "__main__":
    main()