"""Fetch raw (non-split-adjusted) close prices for cap proxy fix.

Uses yfinance.history(auto_adjust=False) which returns raw close.
This fixes the v4b/v5b cap proxy bug where reverse-split stocks (AIG, C)
had their historical caps overestimated 4-25x.
"""
import json, time
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime

import yfinance as yf

HERE = Path(__file__).parent
RESEARCH = HERE.parent
CACHE_DIR = RESEARCH / ".cache"

STATUS = json.loads((CACHE_DIR / "pit_ticker_status.json").read_text(encoding="utf-8"))
USABLE_SYMS = sorted({STATUS[t]["yahoo_sym"] for t in STATUS
                     if STATUS[t]["status"] in ("ok", "partial")})
print(f"Fetching raw close for {len(USABLE_SYMS)} symbols ...")

def fetch_one(sym):
    try:
        # auto_adjust=False -> Close column is raw (not split-adjusted)
        df = yf.Ticker(sym).history(start="1995-01-01", end="2026-05-16",
                                     auto_adjust=False, actions=False)
        if df.empty: return sym, None, "empty"
        out = []
        for idx, row in df.iterrows():
            c = row.get("Close")
            if c is None or c != c: continue  # NaN check
            out.append([idx.strftime("%Y-%m-%d"), round(float(c), 4)])
        return sym, out, "ok"
    except Exception as e:
        return sym, None, f"error_{type(e).__name__}"

results = {}; done = 0; ok = 0
t_start = time.time()
with ThreadPoolExecutor(max_workers=15) as ex:
    futures = {ex.submit(fetch_one, s): s for s in USABLE_SYMS}
    for fut in as_completed(futures):
        sym, series, status = fut.result()
        done += 1
        if series:
            results[sym] = series; ok += 1
        if done % 50 == 0:
            elapsed = time.time() - t_start
            print(f"  {done}/{len(USABLE_SYMS)}  ok={ok}  ({elapsed:.0f}s)")

print(f"\nDone in {(time.time()-t_start)/60:.1f} min  ok={ok}/{len(USABLE_SYMS)}")

out_file = CACHE_DIR / "pit_raw_prices.json"
out_file.write_text(json.dumps({
    "series": results,
    "fetched_at": datetime.now().isoformat(),
    "note": "Raw (non-split-adjusted) close — for cap proxy reverse-engineering",
}), encoding="utf-8")
print(f"Saved -> {out_file}  ({out_file.stat().st_size//1024//1024} MB)")

# Sanity check on AIG (the smoking gun)
if "AIG" in results:
    s = dict(results["AIG"])
    print(f"\nAIG raw close sanity check:")
    print(f"  2001-01-02: {s.get('2001-01-02')}")
    print(f"  2008-01-02: {s.get('2008-01-02')}")
    print(f"  2009-06-30: {s.get('2009-06-30')}  (last day pre 1:20 reverse split)")
    print(f"  2009-07-01: {s.get('2009-07-01')}  (post-split)")
    print(f"  2026-05-15: {s.get('2026-05-15')}")
