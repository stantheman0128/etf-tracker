"""Merge fja05680 main snapshot (1996-2019) with sp500_changes_since_2019.csv
to produce complete PIT membership 1996-current.

Output:
- pit_membership_full.json   -> {date: [tickers]}  daily PIT membership
- pit_ticker_dates.json      -> {ticker: [(start, end)]}  when each ticker was in SP500
- all_tickers_full.json      -> sorted unique tickers ever in SP500 1996-current
- pit_universe_stats.txt     -> human-readable summary
"""

import json, csv, io
from pathlib import Path
from datetime import datetime, timedelta

HERE = Path(__file__).parent
MAIN_JSON = HERE / "pit_universe.json"
CHANGES_CSV = HERE / "sp500_changes_since_2019.csv"
OUT_FULL = HERE / "pit_membership_full.json"
OUT_DATES = HERE / "pit_ticker_dates.json"
OUT_TICKERS = HERE / "all_tickers_full.json"
OUT_STATS = HERE / "pit_universe_stats.txt"

# Load main snapshot (1996-01-02 .. 2019-01-11)
print("Loading main snapshot ...")
main_universe = json.loads(MAIN_JSON.read_text(encoding="utf-8"))
main_dates = sorted(main_universe.keys())
print(f"  Main file: {main_dates[0]} -> {main_dates[-1]}  ({len(main_dates)} dates)")

# Last-known membership = base for forward construction
base_members = set(main_universe[main_dates[-1]])
print(f"  Base (last main date): {len(base_members)} tickers")

# Load changes
print("\nLoading changes-since-2019 ...")
with CHANGES_CSV.open("r", encoding="utf-8") as f:
    reader = csv.DictReader(f)
    changes = [{"date": r["date"], "add": r["add"], "remove": r["remove"]} for r in reader]
print(f"  Changes file: {len(changes)} entries")
print(f"  Range: {changes[0]['date']} -> {changes[-1]['date']}")

# Build forward snapshots day-by-day from 2019-01-12 to last change date
# Strategy: only insert new entries at change dates; downstream code interpolates
forward_snapshots = {}
members = set(base_members)
for ch in changes:
    date = ch["date"]
    if ch["add"]:
        for t in ch["add"].split(","):
            t = t.strip()
            if t: members.add(t)
    if ch["remove"]:
        for t in ch["remove"].split(","):
            t = t.strip()
            members.discard(t)
    forward_snapshots[date] = sorted(members)

print(f"\n  Built {len(forward_snapshots)} forward snapshots")
print(f"  Final membership (after last change): {len(members)} tickers")

# Merge main + forward
full_universe = dict(main_universe)
for d, members_list in forward_snapshots.items():
    full_universe[d] = members_list

# Build "ticker_dates" map: when each ticker was IN the index
# Two passes:
#   1. From main snapshots: find first/last appearance per ticker
#   2. From changes: adjust adds (start) and removes (end)
all_tickers = set()
for members_list in full_universe.values():
    all_tickers.update(members_list)

ticker_dates = {t: {"first_in": None, "last_in": None} for t in all_tickers}
for d in sorted(full_universe.keys()):
    for t in full_universe[d]:
        if ticker_dates[t]["first_in"] is None:
            ticker_dates[t]["first_in"] = d
        ticker_dates[t]["last_in"] = d

# Mark "currently in" status
final_date = sorted(full_universe.keys())[-1]
current_members = set(full_universe[final_date])
for t in all_tickers:
    ticker_dates[t]["currently_in"] = (t in current_members)

# Save
OUT_FULL.write_text(json.dumps(full_universe, ensure_ascii=False), encoding="utf-8")
print(f"\nSaved -> {OUT_FULL}  ({OUT_FULL.stat().st_size//1024} KB)")

OUT_DATES.write_text(json.dumps(ticker_dates, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"Saved -> {OUT_DATES}  ({OUT_DATES.stat().st_size//1024} KB)")

OUT_TICKERS.write_text(json.dumps(sorted(all_tickers)), encoding="utf-8")
print(f"Saved -> {OUT_TICKERS}  ({OUT_TICKERS.stat().st_size//1024} KB)")

# Stats
ghosts = [t for t in all_tickers if not ticker_dates[t]["currently_in"]]
new_since_2019 = [t for t in all_tickers if ticker_dates[t]["first_in"] >= "2019-01-12" and ticker_dates[t]["currently_in"]]

stats = f"""=== PIT Universe Stats ===
Date range:                {sorted(full_universe.keys())[0]}  ->  {final_date}
Total snapshot dates:      {len(full_universe)}
Total unique tickers:      {len(all_tickers)}
Currently in SP500:        {len(current_members)}
Ghost tickers (delisted):  {len(ghosts)}
New since 2019-01-12:      {len(new_since_2019)}

=== Sample ghost tickers (10) ===
{chr(10).join(f"  {t:20s}  in:{ticker_dates[t]['first_in']}  out:{ticker_dates[t]['last_in']}" for t in sorted(ghosts)[:10])}

=== Sample new-since-2019 tickers (10) ===
{chr(10).join(f"  {t:20s}  added:{ticker_dates[t]['first_in']}" for t in sorted(new_since_2019)[:10])}
"""
OUT_STATS.write_text(stats, encoding="utf-8")
print(stats)
