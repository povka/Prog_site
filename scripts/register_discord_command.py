import json
import os
import urllib.request
import urllib.error

APPLICATION_ID = os.environ["DISCORD_APPLICATION_ID"]
GUILD_ID = os.environ["DISCORD_GUILD_ID"]
BOT_TOKEN = os.environ["DISCORD_BOT_TOKEN"]

url = f"https://discord.com/api/v10/applications/{APPLICATION_ID}/guilds/{GUILD_ID}/commands"

commands = [
    {
        "name": "deck",
        "description": "Show a deck image",
        "type": 1,
        "options": [
            {
                "name": "player",
                "description": "Player name",
                "type": 3,
                "required": True,
                "autocomplete": True
            },
            {
                "name": "set",
                "description": "Set name",
                "type": 3,
                "required": True,
                "autocomplete": True
            }
        ]
    },
    {
        "name": "card",
        "description": "Show a card image and binder quantities",
        "type": 1,
        "options": [
            {
                "name": "name",
                "description": "Exact card name",
                "type": 3,
                "required": True,
                "autocomplete": True
            }
        ]
    }
]

data = json.dumps(commands).encode("utf-8")

req = urllib.request.Request(
    url,
    data=data,
    headers={
        "Authorization": f"Bot {BOT_TOKEN}",
        "Content-Type": "application/json",
        "User-Agent": "ThiccMagicianGirl/1.0"
    },
    method="PUT"
)

try:
    with urllib.request.urlopen(req) as resp:
        print(resp.status)
        print(resp.read().decode("utf-8"))
except urllib.error.HTTPError as e:
    print("HTTP status:", e.code)
    print(e.read().decode("utf-8", errors="replace"))
    raise