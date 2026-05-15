"""Fetch today's market cap + shares for every PIT ticker.
For tickers Yahoo no longer covers, cap stays 0 (will be excluded from cap-rank).
"""
import json, time
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

import yfinance as yf

HERE = Path(__file__).parent
RESEARCH = HERE.parent
CACHE_DIR = RESEARCH / ".cache"

STATUS = json.loads((CACHE_DIR / "pit_ticker_status.json").read_text(encoding="utf-8"))
all_yahoo_syms = sorted({info["yahoo_sym"] for info in STATUS.values()})
print(f"Fetching marketCap for {len(all_yahoo_syms)} unique symbols ...")

def fetch_one(sym):
    try:
        info = yf.Ticker(sym).info
        cap = info.get('marketCap') or 0
        shares = info.get('sharesOutstanding') or 0
        return sym, cap, shares
    except Exception:
        return sym, 0, 0

results = {}
done = 0; got_cap = 0
t_start = time.time()
with ThreadPoolExecutor(max_workers=15) as ex:
    futures = {ex.submit(fetch_one, s): s for s in all_yahoo_syms}
    for fut in as_completed(futures):
        sym, cap, shares = fut.result()
        results[sym] = {"cap": cap, "shares": shares}
        done += 1
        if cap > 0: got_cap += 1
        if done % 100 == 0:
            elapsed = time.time() - t_start
            print(f"  {done}/{len(all_yahoo_syms)}  got_cap={got_cap}  ({elapsed:.0f}s)")

print(f"\nDone in {(time.time()-t_start)/60:.1f} min")
print(f"  Got marketCap for {got_cap}/{len(all_yahoo_syms)} symbols")

out = CACHE_DIR / "marketcaps.json"
out.write_text(json.dumps(results, indent=2), encoding="utf-8")
print(f"Saved -> {out} ({out.stat().st_size//1024} KB)")

# Sample
print("\nTop 10 by marketCap:")
sorted_caps = sorted(results.items(), key=lambda x: -x[1]["cap"])[:10]
for s, info in sorted_caps:
    print(f"  {s:8s}  ${info['cap']/1e9:>8.1f}B  shares={info['shares']/1e6:.0f}M")
