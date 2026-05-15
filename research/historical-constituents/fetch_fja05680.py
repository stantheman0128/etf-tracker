"""Fetch point-in-time S&P 500 constituents from fja05680/sp500 GitHub repo.

Output:
- pit_constituents.csv  -> date, tickers (comma-separated)
- pit_universe.json     -> {date: [tickers]} for fast lookup
- all_tickers.json      -> sorted unique tickers ever in SP500 (PIT)
"""

import urllib.request, csv, json, io
from pathlib import Path
from datetime import datetime

HERE = Path(__file__).parent
OUT_CSV = HERE / "pit_constituents.csv"
OUT_JSON = HERE / "pit_universe.json"
OUT_TICKERS = HERE / "all_tickers.json"

# Main file: ~7.8 MB, contains every-day SP500 membership from 1996 onward
URL = "https://raw.githubusercontent.com/fja05680/sp500/master/S%26P%20500%20Historical%20Components%20%26%20Changes.csv"

print(f"Fetching from: {URL}")
req = urllib.request.Request(URL, headers={"User-Agent": "Mozilla/5.0"})
with urllib.request.urlopen(req, timeout=60) as r:
    text = r.read().decode("utf-8")

OUT_CSV.write_text(text, encoding="utf-8")
print(f"Saved -> {OUT_CSV}  ({len(text)//1024} KB)")

# Parse
reader = csv.reader(io.StringIO(text))
header = next(reader)
print(f"Header: {header}")

universe = {}
all_tickers = set()
for row in reader:
    if len(row) < 2: continue
    date_str, tickers_str = row[0], row[1]
    tickers = [t.strip() for t in tickers_str.split(",") if t.strip()]
    universe[date_str] = tickers
    all_tickers.update(tickers)

print(f"\nTotal snapshot dates: {len(universe)}")
dates = sorted(universe.keys())
print(f"Date range: {dates[0]} -> {dates[-1]}")
print(f"First snapshot: {len(universe[dates[0]])} stocks")
print(f"Last snapshot:  {len(universe[dates[-1]])} stocks")
print(f"Total unique tickers ever in SP500: {len(all_tickers)}")

# Write outputs
OUT_JSON.write_text(json.dumps(universe, ensure_ascii=False), encoding="utf-8")
print(f"Saved -> {OUT_JSON}  ({OUT_JSON.stat().st_size//1024} KB)")

OUT_TICKERS.write_text(json.dumps(sorted(all_tickers)), encoding="utf-8")
print(f"Saved -> {OUT_TICKERS}  ({OUT_TICKERS.stat().st_size//1024} KB)")

# Sanity check: which old tickers are NOT in today's SP500?
today_tickers = set(universe[dates[-1]])
ever_but_not_today = sorted(all_tickers - today_tickers)
print(f"\nGhost tickers (ever in SP500, not today): {len(ever_but_not_today)}")
print(f"Sample of first 20 ghosts: {ever_but_not_today[:20]}")
