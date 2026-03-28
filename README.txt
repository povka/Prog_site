# Prog with the Bois

A static Yu-Gi-Oh! progression site for tracking weekly results, browsing decklists, and viewing each player’s binder.

## Current project structure

The python script takes .csv files from /data/raw/ and reconstructs into a json that also has data pulled from ygoprodeck api for card stats

Source images are zipped using WinRAR's split format, other unzipping tools will not work

.
Prog_site/
├── data/
│   └── raw/
│       ├── asapaska.csv
│       ├── retroid99.csv
│       ├── mhkaixer.csv
│       └── shiruba.csv
├── source-images/
│   └── cards/
├── scripts/
│   └── build_binder_json.py
├── dist/
│   ├── index.html
│   ├── style.css
│   ├── data/
│   │   └── generated/
│   └── images/
│       ├── cards/
│       ├── asa.jpg
│       ├── kaixer.jpg
│       ├── retroid.jpg
│       ├── shiruba.jpg
│       ├── week1-asa.jpg
│       └── ...