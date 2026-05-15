"""Fetch Yahoo Finance price history for every ticker ever in SP500 (1996-current).

Strategy:
1. Start from existing fixed-universe cache (506 today's-SP500 tickers)
2. Add missing ghost tickers (~700+)
3. For tickers with suffix `XXX-YYMM` (fja05680 disambiguation): strip suffix, fetch base
4. Classify each ticker into:
   - 'ok': Yahoo returned data covering the in-SP500 period
   - 'partial': Yahoo returned data but doesn't cover full in-SP500 window
   - 'no_data': Yahoo 404 / empty / unusable
5. Write everything to pit_price_cache.json + classification report

Output:
- pit_price_cache.json    -> {ticker_resolved: [(date, price)]}
- pit_ticker_status.json  -> {original_ticker: {resolved, status, first_date, last_date, in_sp500_first, in_sp500_last}}
"""

import json, re, time, urllib.request, urllib.error
from pathlib import Path
from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor, as_completed

HERE = Path(__file__).parent
RESEARCH = HERE.parent
CACHE_DIR = RESEARCH / ".cache"
CACHE_DIR.mkdir(exist_ok=True)

# Source
TICKERS_JSON = RESEARCH / "historical-constituents" / "all_tickers_full.json"
TICKER_DATES = RESEARCH / "historical-constituents" / "pit_ticker_dates.json"

# Reuse existing fixed-universe cache (saves ~1 hour of fetching)
EXISTING_CACHE = Path(r"C:\Users\stans\OneDrive - gapps.ntnu.edu.tw\桌面\index-compare\sp500_cache.json")

# Output
OUT_CACHE = CACHE_DIR / "pit_price_cache.json"
OUT_STATUS = CACHE_DIR / "pit_ticker_status.json"
OUT_LOG = CACHE_DIR / "pit_fetch.log"

START = int(datetime(1995, 1, 1, tzinfo=timezone.utc).timestamp())
END = int(datetime.now(tz=timezone.utc).timestamp())

# ───────────────────────────────────────────────────────────
# Parse fja05680 ticker into (base, suffix_date)
# ───────────────────────────────────────────────────────────
SUFFIX_RE = re.compile(r'^([A-Z][A-Z0-9.-]*?)-(\d{6})$')

def parse_ticker(t):
    """Return (base, last_in_sp500_yyyy_mm) — suffix is YYMM format."""
    m = SUFFIX_RE.match(t)
    if m:
        base = m.group(1)
        yymm = m.group(2)
        # YYMM: e.g. 199702 -> 1997-02
        year = int(yymm[:4]) if int(yymm[:2]) > 50 or int(yymm[:2]) < 30 else None
        if year is None: return t, None
        return base, f"{yymm[:4]}-{yymm[4:6]}"
    return t, None

def yahoo_sym(base):
    """Convert SP500 ticker convention to Yahoo (BRK.B -> BRK-B etc.)."""
    return base.replace(".", "-")

# ───────────────────────────────────────────────────────────
# Yahoo fetch (one ticker)
# ───────────────────────────────────────────────────────────
def fetch_one(sym):
    url = (f"https://query1.finance.yahoo.com/v8/finance/chart/{sym}"
           f"?period1={START}&period2={END}&interval=1d")
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            p = json.loads(r.read().decode("utf-8"))
        result = p["chart"]["result"]
        if not result: return sym, None, "empty_result"
        result = result[0]
        ts = result.get("timestamp", [])
        cls = result.get("indicators", {}).get("quote", [{}])[0].get("close", [])
        if not ts or not cls: return sym, None, "no_data"
        out = []
        for t, c in zip(ts, cls):
            if c is None: continue
            iso = datetime.fromtimestamp(t, tz=timezone.utc).strftime("%Y-%m-%d")
            out.append([iso, round(float(c), 4)])
        return sym, out if out else None, "ok" if out else "empty"
    except urllib.error.HTTPError as e:
        return sym, None, f"http_{e.code}"
    except Exception as e:
        return sym, None, f"error_{type(e).__name__}"

# ───────────────────────────────────────────────────────────
# Load existing cache
# ───────────────────────────────────────────────────────────
print("Loading existing fixed-universe cache ...")
if EXISTING_CACHE.exists():
    existing = json.loads(EXISTING_CACHE.read_text(encoding="utf-8"))
    existing_series = existing["series"]
    print(f"  Existing cache: {len(existing_series)} tickers (will reuse)")
else:
    existing_series = {}
    print("  No existing cache — will fetch from scratch")

# ───────────────────────────────────────────────────────────
# Plan fetches
# ───────────────────────────────────────────────────────────
all_tickers = json.loads(TICKERS_JSON.read_text(encoding="utf-8"))
ticker_dates = json.loads(TICKER_DATES.read_text(encoding="utf-8"))
print(f"\nTotal PIT tickers to resolve: {len(all_tickers)}")

# Group: original_ticker -> resolved (yahoo_sym)
resolution = {}
unique_yahoo_syms = set()
for t in all_tickers:
    base, _ = parse_ticker(t)
    ysym = yahoo_sym(base)
    resolution[t] = ysym
    unique_yahoo_syms.add(ysym)

print(f"Unique Yahoo symbols (after stripping suffixes): {len(unique_yahoo_syms)}")

# What's missing?
already_have = {s for s in unique_yahoo_syms if s in existing_series}
need_fetch = sorted(unique_yahoo_syms - already_have)
print(f"Already in cache:  {len(already_have)}")
print(f"Need to fetch:     {len(need_fetch)}")

# ───────────────────────────────────────────────────────────
# Fetch missing in parallel batches
# ───────────────────────────────────────────────────────────
results = dict(existing_series)  # start from existing
fetch_status = {}  # yahoo_sym -> "ok" / "no_data" / etc.

if need_fetch:
    print(f"\nFetching {len(need_fetch)} tickers in parallel (15 concurrent) ...")
    log_lines = []
    t_start = time.time()
    BATCH = 15
    done = 0; ok = 0
    for i in range(0, len(need_fetch), BATCH):
        batch = need_fetch[i:i+BATCH]
        with ThreadPoolExecutor(max_workers=BATCH) as ex:
            futures = {ex.submit(fetch_one, s): s for s in batch}
            for fut in as_completed(futures):
                sym, series, status = fut.result()
                done += 1
                fetch_status[sym] = status
                if series:
                    results[sym] = series
                    ok += 1
                else:
                    log_lines.append(f"FAIL {sym:12s} {status}")
        elapsed = time.time() - t_start
        rate = done / elapsed if elapsed > 0 else 0
        eta = (len(need_fetch) - done) / rate if rate > 0 else 0
        print(f"  {done}/{len(need_fetch)}  ok={ok}  fail={done-ok}  "
              f"rate={rate:.1f}/s  eta={eta:.0f}s")

    OUT_LOG.write_text("\n".join(log_lines), encoding="utf-8")
    print(f"\nLog -> {OUT_LOG}  ({len(log_lines)} failures)")

# Mark existing as ok in status too
for s in already_have:
    fetch_status[s] = "ok"

# ───────────────────────────────────────────────────────────
# Classify each PIT ticker
# ───────────────────────────────────────────────────────────
print(f"\nClassifying {len(all_tickers)} PIT tickers ...")
status_report = {}
class_counts = {"ok": 0, "partial": 0, "no_data": 0, "no_overlap": 0}

for orig in all_tickers:
    ysym = resolution[orig]
    info = ticker_dates[orig]
    first_in = info["first_in"]
    last_in = info["last_in"]

    if ysym not in results:
        status = "no_data"
        first_date = None
        last_date = None
    else:
        series = results[ysym]
        first_date = series[0][0]
        last_date = series[-1][0]
        # Does Yahoo coverage overlap with in-SP500 window?
        if last_date < first_in or first_date > last_in:
            status = "no_overlap"
        elif first_date <= first_in and last_date >= last_in:
            status = "ok"
        else:
            status = "partial"

    class_counts[status] += 1
    status_report[orig] = {
        "yahoo_sym": ysym,
        "status": status,
        "in_sp500_first": first_in,
        "in_sp500_last": last_in,
        "yahoo_first": first_date,
        "yahoo_last": last_date,
    }

OUT_STATUS.write_text(json.dumps(status_report, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"Saved status -> {OUT_STATUS}")

# ───────────────────────────────────────────────────────────
# Save consolidated cache
# ───────────────────────────────────────────────────────────
OUT_CACHE.write_text(json.dumps({
    "series": results,
    "fetched_at": datetime.now(tz=timezone.utc).isoformat(),
    "n_tickers": len(results),
}), encoding="utf-8")
print(f"Saved cache  -> {OUT_CACHE}  ({OUT_CACHE.stat().st_size//1024//1024} MB, {len(results)} tickers)")

# ───────────────────────────────────────────────────────────
# Summary
# ───────────────────────────────────────────────────────────
print(f"\n=== PIT classification summary ===")
print(f"  ok          : {class_counts['ok']:>5} ({class_counts['ok']*100/len(all_tickers):.1f}%)  Full Yahoo coverage of in-SP500 window")
print(f"  partial     : {class_counts['partial']:>5} ({class_counts['partial']*100/len(all_tickers):.1f}%)  Yahoo has data, but window partial")
print(f"  no_overlap  : {class_counts['no_overlap']:>5} ({class_counts['no_overlap']*100/len(all_tickers):.1f}%)  Yahoo data exists but wrong period (ticker reuse)")
print(f"  no_data     : {class_counts['no_data']:>5} ({class_counts['no_data']*100/len(all_tickers):.1f}%)  Yahoo 404 / unusable")
print(f"  ----------- -----")
print(f"  total       : {len(all_tickers)}")
