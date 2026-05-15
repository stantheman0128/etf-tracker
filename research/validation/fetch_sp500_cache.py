"""Fetch current S&P 500 constituents + Yahoo Finance historical prices.

Stores into sp500_cache.json for use by validation_sp500.py.
"""

import json, re, time, urllib.request
from datetime import datetime, timezone
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

HERE = Path(__file__).parent
CACHE = HERE / "sp500_cache.json"

START = int(datetime(1999, 12, 1, tzinfo=timezone.utc).timestamp())
END = int(datetime.now(tz=timezone.utc).timestamp())

WIKI_URL = "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies"

def fetch_sp500_tickers():
    """Parse Wikipedia's S&P 500 table for ticker symbols."""
    req = urllib.request.Request(WIKI_URL, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30) as r:
        html = r.read().decode("utf-8")

    # Find the first wikitable (it's the constituent list)
    table_match = re.search(r'<table[^>]*class="wikitable[^"]*"[^>]*>(.+?)</table>', html, re.S)
    if not table_match:
        raise RuntimeError("Could not find S&P 500 table in Wikipedia HTML")
    table_html = table_match.group(1)

    # Each row has the ticker in the first <td>. Yahoo uses dash for class shares (BRK-B not BRK.B).
    tickers = []
    for row in re.finditer(r'<tr>(.+?)</tr>', table_html, re.S):
        first_td = re.search(r'<td[^>]*>(.+?)</td>', row.group(1), re.S)
        if not first_td: continue
        cell_html = first_td.group(1)
        # Ticker is usually inside an <a> tag
        link = re.search(r'<a[^>]*>([^<]+)</a>', cell_html)
        if link:
            t = link.group(1).strip().replace('.', '-')
            if re.match(r'^[A-Z][A-Z0-9-]{0,6}$', t):
                tickers.append(t)
    return tickers

def fetch_one(sym):
    url = (f"https://query1.finance.yahoo.com/v8/finance/chart/{sym}"
           f"?period1={START}&period2={END}&interval=1d")
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            p = json.loads(r.read().decode("utf-8"))
        result = p["chart"]["result"]
        if not result: return sym, None
        result = result[0]
        ts = result.get("timestamp", [])
        cls = result["indicators"]["quote"][0].get("close", [])
        out = []
        for t, c in zip(ts, cls):
            if c is None: continue
            iso = datetime.fromtimestamp(t, tz=timezone.utc).strftime("%Y-%m-%d")
            out.append([iso, round(float(c), 4)])
        return sym, out if out else None
    except Exception as e:
        return sym, None

# ────────────────────────────────────────────────────────
# Run
# ────────────────────────────────────────────────────────
if CACHE.exists():
    DATA = json.loads(CACHE.read_text(encoding="utf-8"))
    print(f"Loading cache: {len(DATA['series'])} tickers already")
else:
    DATA = {"series": {}, "fetched_at": datetime.now(tz=timezone.utc).isoformat()}

print("\nFetching S&P 500 ticker list from Wikipedia ...")
sp500 = fetch_sp500_tickers()
print(f"  Got {len(sp500)} tickers")
print(f"  Sample: {sp500[:10]}")

# Also include the 3 ADRs from previous expansion (not in SP500 but relevant)
ADRS = ["TSM", "ASML", "NVO"]
all_targets = list(dict.fromkeys(sp500 + ADRS))  # preserve order, dedupe
print(f"\nTotal target tickers (SP500 + ADRs): {len(all_targets)}")

to_fetch = [t for t in all_targets if t not in DATA["series"]]
print(f"Already cached: {len(all_targets) - len(to_fetch)}")
print(f"Need to fetch: {len(to_fetch)}")

if to_fetch:
    print(f"\nFetching in parallel (batches of 15) ...")
    done = 0; ok = 0; failed = []
    BATCH = 15
    t_start = time.time()
    for i in range(0, len(to_fetch), BATCH):
        batch = to_fetch[i:i+BATCH]
        with ThreadPoolExecutor(max_workers=BATCH) as ex:
            futures = {ex.submit(fetch_one, t): t for t in batch}
            for fut in as_completed(futures):
                sym, series = fut.result()
                done += 1
                if series:
                    DATA["series"][sym] = series
                    ok += 1
                else:
                    failed.append(sym)
        elapsed = time.time() - t_start
        rate = done / elapsed if elapsed > 0 else 0
        eta = (len(to_fetch) - done) / rate if rate > 0 else 0
        print(f"  {done}/{len(to_fetch)}  ok={ok}  failed={len(failed)}  "
              f"rate={rate:.1f}/s  eta={eta:.0f}s")

    print(f"\nDone. Saving cache ...")
    CACHE.write_text(json.dumps(DATA))
    print(f"  Cache size: {len(DATA['series'])} tickers")
    if failed:
        print(f"\nFailed ({len(failed)}): {failed}")
else:
    print("All tickers already cached.")

# Sample first/last dates
print(f"\nSample of fetched data:")
for sym in list(DATA["series"].keys())[:5]:
    s = DATA["series"][sym]
    print(f"  {sym:6} {len(s):>5} pts  {s[0][0]} -> {s[-1][0]}")
