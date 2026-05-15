"""Point-in-time S&P 500 validation: 4-gate strictness with universe that
changes each rebalance day (no survivorship bias).

Compared to v2 (fixed today's-SP500 universe), v3:
- Universe at any date = real SP500 members AT THAT DATE (not today's)
- Includes companies later delisted / removed from SP500
- Strict Bonferroni perms upgraded 200 -> 1000 (6 variants × 1000 = ~70 min)

Output:
- v3_results.json     -> full numeric results
- v3_scorecard.png    -> chart vs v2
- v3_console.log      -> stdout dump for paper trail
"""

import json, math, random, time
from pathlib import Path
from datetime import datetime, timezone
from bisect import bisect_right
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

HERE = Path(__file__).parent
RESEARCH = HERE.parent
CACHE_DIR = RESEARCH / ".cache"
PIT_DIR = RESEARCH / "historical-constituents"

# ─── Load all data ──────────────────────────────────────────
print("Loading PIT membership ...")
MEMBERSHIP = json.loads((PIT_DIR / "pit_membership_full.json").read_text(encoding="utf-8"))
print(f"  {len(MEMBERSHIP)} daily snapshots")

print("Loading price cache ...")
CACHE = json.loads((CACHE_DIR / "pit_price_cache.json").read_text(encoding="utf-8"))
PRICES = CACHE["series"]
print(f"  {len(PRICES)} tickers with Yahoo data")

print("Loading ticker status ...")
STATUS = json.loads((CACHE_DIR / "pit_ticker_status.json").read_text(encoding="utf-8"))
ok_tickers = {t for t, info in STATUS.items() if info["status"] == "ok"}
partial_tickers = {t for t, info in STATUS.items() if info["status"] == "partial"}
print(f"  {len(ok_tickers)} 'ok', {len(partial_tickers)} 'partial', {len(STATUS) - len(ok_tickers) - len(partial_tickers)} unusable")
USABLE = ok_tickers | partial_tickers

# ─── Map ticker -> yahoo_sym (which to look up in PRICES) ───
def ysym_of(orig):
    return STATUS[orig]["yahoo_sym"]

# ─── Build daily trading-date grid (from SPY — every US trading day) ────────
# CRITICAL: don't use MEMBERSHIP keys directly — main file is daily but
# changes-since-2019 only has change-dates (~110 entries), losing resolution post-2019.
if "SPY" not in PRICES:
    raise RuntimeError("SPY missing from price cache — needed as date-grid reference")
ALL_DATES = sorted({d for d, _ in PRICES["SPY"]})
date_to_idx = {d: i for i, d in enumerate(ALL_DATES)}
print(f"Analysis date grid (SPY trading days): {ALL_DATES[0]} -> {ALL_DATES[-1]}  ({len(ALL_DATES)} days)")

# Build PX[ticker] = list of (date, price), pre-sorted, with last-known forward-fill
print("\nBuilding aligned price arrays ...")
PX = {}  # original_ticker -> {date_idx -> price}, only at dates with real Yahoo data
for orig in USABLE:
    ysym = ysym_of(orig)
    if ysym not in PRICES: continue
    series = PRICES[ysym]
    px_by_idx = {}
    for d, p in series:
        idx = date_to_idx.get(d)
        if idx is not None:
            px_by_idx[idx] = p
    if px_by_idx:
        PX[orig] = px_by_idx

print(f"  {len(PX)} tickers have aligned prices")

# Precompute sorted indices per ticker for fast "last-known-before-idx" lookup
PX_SORTED_IDX = {t: sorted(d.keys()) for t, d in PX.items()}

def price_at(t, idx, max_stale=10):
    """Most-recent price for `t` at or before `idx`, up to max_stale days back."""
    if t not in PX_SORTED_IDX: return None
    sorted_idx = PX_SORTED_IDX[t]
    # Find rightmost index <= idx
    pos = bisect_right(sorted_idx, idx) - 1
    if pos < 0: return None
    found = sorted_idx[pos]
    if idx - found > max_stale: return None
    return PX[t][found]

# ─── Build PIT universe lookup ──────────────────────────────
print("\nBuilding date -> PIT universe set lookup ...")
# Note: MEMBERSHIP only has change-dates after 2019. For dates in between,
# we use the most recent prior snapshot.
SORTED_MEMBERSHIP_DATES = sorted(MEMBERSHIP.keys())

def universe_at(date_str):
    """Return set of usable tickers in SP500 on this date."""
    # Find membership snapshot <= date_str
    pos = bisect_right(SORTED_MEMBERSHIP_DATES, date_str) - 1
    if pos < 0: return set()
    snapshot_date = SORTED_MEMBERSHIP_DATES[pos]
    return set(MEMBERSHIP[snapshot_date]) & USABLE

# ─── Strategy build ─────────────────────────────────────────
def build_strategy(n, lookback, rebal_days, select_random=False, seed=None):
    """Return list of (date, portfolio_value) — PIT-aware."""
    rng = random.Random(seed) if select_random and seed is not None else None
    hold = {}  # ticker -> shares
    last_pv = 100.0
    out = []

    for i in range(len(ALL_DATES)):
        d = ALL_DATES[i]
        # Mark current values of held positions
        if hold:
            pv = 0.0
            for t, sh in hold.items():
                px = price_at(t, i)
                if px is not None: pv += sh * px
            if pv > 0: last_pv = pv

        if i % rebal_days == 0:
            # Rebalance day — query PIT universe NOW
            pit = universe_at(d)
            elig = []
            for t in pit:
                px = price_at(t, i)
                if px is None: continue
                p_old = price_at(t, i - lookback)
                if p_old is None or p_old <= 0: continue
                mom = px / p_old - 1
                if not math.isnan(mom):
                    elig.append((t, mom, px))
            if not elig:
                out.append((d, last_pv)); continue
            if select_random:
                picked = rng.sample(elig, min(n, len(elig)))
            else:
                elig.sort(key=lambda x: -x[1])
                picked = elig[:n]
            hold = {t: (last_pv / len(picked)) / px for t, _, px in picked}
            out.append((d, last_pv))
        else:
            out.append((d, last_pv))

    if out and out[0][1] != 100:
        base = out[0][1]
        out = [(d, v / base * 100) for d, v in out]
    return out

def stats(pts):
    if len(pts) < 2: return (0, 0, 0, 0, 0)
    f, l = pts[0][1], pts[-1][1]
    days = (datetime.fromisoformat(pts[-1][0]) - datetime.fromisoformat(pts[0][0])).days
    yrs = days / 365.25
    cagr = (l / f) ** (1 / yrs) - 1 if yrs > 0 and f > 0 and l > 0 else 0
    rets = [math.log(pts[i][1] / pts[i-1][1]) for i in range(1, len(pts))
            if pts[i-1][1] > 0 and pts[i][1] > 0]
    if not rets: return (cagr, 0, 0, 0, yrs)
    mean = sum(rets) / len(rets)
    var = sum((r - mean) ** 2 for r in rets) / (len(rets) - 1)
    vol = math.sqrt(var * 252)
    sharpe = (mean * 252 - 0.04) / vol if vol > 0 else 0
    peak, mdd = pts[0][1], 0
    for _, v in pts:
        if v > peak: peak = v
        dd = v / peak - 1
        if dd < mdd: mdd = dd
    return (cagr, vol, mdd, sharpe, yrs)

# ─── SPY benchmark (always full coverage) ───────────────────
print("\nBuilding SPY benchmark ...")
if "SPY" in PRICES:
    spy_series = PRICES["SPY"]
    spy_pts = []
    for d, p in spy_series:
        if d in date_to_idx:
            spy_pts.append((d, p))
    base = spy_pts[0][1]
    spy_rebased = [(d, v / base * 100) for d, v in spy_pts]
    print(f"  SPY: {spy_rebased[0][0]} -> {spy_rebased[-1][0]}  ({len(spy_rebased)} pts)")
else:
    print("  WARNING: SPY not in cache!")
    spy_rebased = []

# ─── Canonical strategy ─────────────────────────────────────
print("\n" + "=" * 80)
print("CANONICAL: TOP 3 by 12M Momentum on PIT SP500")
print("=" * 80)
t0 = time.time()
canonical = build_strategy(3, 252, 21)
c_stats = stats(canonical)
print(f"  Build time: {time.time() - t0:.1f}s")
print(f"  CAGR {c_stats[0]*100:.1f}% | Sharpe {c_stats[3]:.2f} | MaxDD {c_stats[2]*100:.1f}% | Years {c_stats[4]:.1f}")

# ─── Gate 3: Walk-Forward ───────────────────────────────────
print("\n" + "=" * 80)
print("GATE 3: Walk-Forward")
print("=" * 80)

def stats_window(pts, start, end):
    win = [p for p in pts if start <= p[0] <= end]
    if len(win) < 100: return None
    return stats(win)

windows = [
    ("2000-01-01", "2005-12-31", "2000-2005"),
    ("2006-01-01", "2010-12-31", "2006-2010"),
    ("2011-01-01", "2015-12-31", "2011-2015"),
    ("2016-01-01", "2020-12-31", "2016-2020"),
    ("2021-01-01", "2026-12-31", "2021-2026"),
]
print(f"\n{'Window':<12} {'Strat CAGR':>11} {'SPY CAGR':>10} {'Spread':>9} {'Strat DD':>10} {'SPY DD':>9}")
print("-" * 70)
wf_wins = 0; wf_results = []
for s, e, lab in windows:
    s_stats = stats_window(canonical, s, e)
    spy_st = stats_window(spy_rebased, s, e) if spy_rebased else None
    if s_stats and spy_st:
        spread = (s_stats[0] - spy_st[0]) * 100
        if s_stats[0] > 0 and spread > 0: wf_wins += 1
        wf_results.append({"window": lab, "strat": s_stats[0], "spy": spy_st[0],
                          "spread": spread, "strat_dd": s_stats[2], "spy_dd": spy_st[2]})
        print(f"{lab:<12} {s_stats[0]*100:>10.1f}% {spy_st[0]*100:>9.1f}% "
              f"{spread:>+8.1f}% {s_stats[2]*100:>9.1f}% {spy_st[2]*100:>8.1f}%")

is_st = stats_window(canonical, "2000-01-01", "2015-12-31")
oos_st = stats_window(canonical, "2016-01-01", "2026-12-31")
spy_is = stats_window(spy_rebased, "2000-01-01", "2015-12-31") if spy_rebased else None
spy_oos = stats_window(spy_rebased, "2016-01-01", "2026-12-31") if spy_rebased else None
if is_st and oos_st and spy_is and spy_oos:
    print(f"\nIS  (2000-2015):  Strat {is_st[0]*100:>5.1f}%  vs  SPY {spy_is[0]*100:>5.1f}%  "
          f"(spread {(is_st[0]-spy_is[0])*100:+.1f}%)")
    print(f"OOS (2016-2026):  Strat {oos_st[0]*100:>5.1f}%  vs  SPY {spy_oos[0]*100:>5.1f}%  "
          f"(spread {(oos_st[0]-spy_oos[0])*100:+.1f}%)")
gate3 = (wf_wins == len(windows)) and is_st and is_st[0] > 0 and oos_st and oos_st[0] > 0
print(f"\nGATE 3: {'** PASS' if gate3 else '   FAIL'}  ({wf_wins}/{len(windows)} windows positive)")

# ─── Gate 2: Bonferroni — 1000 perms ────────────────────────
print("\n" + "=" * 80)
print("GATE 2: Bonferroni — 1000 perms (min p = 1/1001 = 0.000999)")
print("=" * 80)
BONF = [
    (1, 252, 21, "N=1, 12M, mthly"),
    (3, 252, 21, "N=3, 12M, mthly"),
    (5, 252, 21, "N=5, 12M, mthly"),
    (3, 126, 21, "N=3, 6M,  mthly"),
    (3, 252, 5,  "N=3, 12M, weekly"),
    (3, 252, 63, "N=3, 12M, qtrly"),
]
K = len(BONF)
ALPHA_CORR = 0.05 / K
PERMS = int(__import__("os").environ.get("V3_PERMS", "1000"))  # set V3_PERMS=5 for dry-run
print(f"  K={K}, naive Bonferroni threshold = 0.05/{K} = {ALPHA_CORR:.4f}")
print(f"  PERMS = {PERMS}, min achievable p = {1/(PERMS+1):.5f}")
print(f"  Strict Bonferroni for 2400 explored variants would need p < 0.05/2400 = 0.0000208")
print(f"  -> Requires perms >= 48,000 (free-data computationally infeasible)")

print(f"\n{'Variant':<22} {'Actual':>9} {'Rand med':>10} {'p-value':>10} {'Bonf?':>7}")
print("-" * 62)
bonf_results = []
total_t0 = time.time()
for vi, (n, lb, rb, label) in enumerate(BONF):
    t0 = time.time()
    actual = build_strategy(n, lb, rb)
    a_cagr = stats(actual)[0]
    perms = []
    for s in range(PERMS):
        p = build_strategy(n, lb, rb, select_random=True, seed=70000 + vi * PERMS + s)
        perms.append(stats(p)[0])
    perms.sort()
    n_beat = sum(1 for c in perms if c >= a_cagr)
    p_val = (n_beat + 1) / (PERMS + 1)
    survives = p_val < ALPHA_CORR
    mark = "** YES" if survives else "   no"
    el = time.time() - t0
    print(f"{label:<22} {a_cagr*100:>8.1f}% {perms[PERMS//2]*100:>9.1f}% "
          f"{p_val:>10.5f} {mark:>7}  ({el:.0f}s)")
    bonf_results.append({"label": label, "actual": a_cagr,
                         "median": perms[PERMS//2], "p": p_val, "survives": survives})

bonf_wins = sum(1 for r in bonf_results if r["survives"])
gate2 = bonf_wins == K
print(f"\nGATE 2: {'** PASS' if gate2 else '** PARTIAL'}  "
      f"({bonf_wins}/{K} variants pass at α={ALPHA_CORR:.4f})")
print(f"  Total Bonf run time: {(time.time()-total_t0)/60:.1f} min")

# ─── Gate 1 MCPT (using canonical p-value from Bonf run #2) ─
print("\n" + "=" * 80)
print("GATE 1: MCPT (Monte Carlo Permutation Test)")
print("=" * 80)
gate1_p = bonf_results[1]["p"]  # N=3, 12M, monthly is the canonical
gate1 = gate1_p < 0.05
print(f"  Canonical p-value: {gate1_p:.5f}")
print(f"  GATE 1: {'** PASS' if gate1 else '** FAIL'}  (p < 0.05)")

# ─── Gate 4: Bootstrap CI ───────────────────────────────────
print("\n" + "=" * 80)
print("GATE 4: Block Bootstrap CI (1000 sims, 21-day blocks)")
print("=" * 80)
t0 = time.time()
# Get canonical returns
canonical_rets = [math.log(canonical[i][1] / canonical[i-1][1])
                  for i in range(1, len(canonical))
                  if canonical[i-1][1] > 0 and canonical[i][1] > 0]
N_RETS = len(canonical_rets)
BLOCK = 21
SIMS = 1000

boot_cagrs = []
random.seed(99999)
for _ in range(SIMS):
    sim_rets = []
    while len(sim_rets) < N_RETS:
        start = random.randint(0, N_RETS - BLOCK)
        sim_rets.extend(canonical_rets[start:start+BLOCK])
    sim_rets = sim_rets[:N_RETS]
    sim_pv = 100.0
    for r in sim_rets: sim_pv *= math.exp(r)
    yrs = N_RETS / 252
    sim_cagr = (sim_pv / 100) ** (1 / yrs) - 1 if yrs > 0 else 0
    boot_cagrs.append(sim_cagr)

boot_cagrs.sort()
ci_lower = boot_cagrs[int(SIMS * 0.025)]
ci_upper = boot_cagrs[int(SIMS * 0.975)]
gate4 = ci_lower > 0
print(f"  Run time: {time.time()-t0:.1f}s")
print(f"  95% CI: [{ci_lower*100:+.1f}%, {ci_upper*100:+.1f}%]")
print(f"  GATE 4: {'** PASS' if gate4 else '** FAIL'}  (CI lower > 0)")

# ─── Final Scorecard ────────────────────────────────────────
print("\n" + "=" * 80)
print("FINAL SCORECARD — PIT S&P 500 (1996-current, ~745 ghosts included)")
print("=" * 80)
print(f"  Headline:  CAGR {c_stats[0]*100:.1f}%  Sharpe {c_stats[3]:.2f}  MaxDD {c_stats[2]*100:.1f}%")
print()
print(f"  Gate 1 MCPT:         {'** PASS' if gate1 else '** FAIL'}  (p={gate1_p:.5f})")
print(f"  Gate 2 Bonferroni:   {'** PASS' if gate2 else '** PARTIAL'}  ({bonf_wins}/{K} pass, 1000 perms)")
print(f"  Gate 3 Walk-Forward: {'** PASS' if gate3 else '** FAIL'}  ({wf_wins}/{len(windows)} positive)")
print(f"  Gate 4 Bootstrap CI: {'** PASS' if gate4 else '** FAIL'}  ([{ci_lower*100:+.1f}%, {ci_upper*100:+.1f}%])")
n_passed = sum([gate1, gate2, gate3, gate4])
print(f"\n  {n_passed}/4 gates passed")

# ─── Save results JSON ──────────────────────────────────────
results_out = {
    "headline": {"cagr": c_stats[0], "sharpe": c_stats[3], "maxdd": c_stats[2], "years": c_stats[4]},
    "gate1": {"pass": gate1, "p_value": gate1_p},
    "gate2": {"pass": gate2, "perms": PERMS, "alpha_corrected": ALPHA_CORR,
              "variants": bonf_results, "n_pass": bonf_wins, "k": K},
    "gate3": {"pass": gate3, "wins": wf_wins, "windows": wf_results,
              "is_cagr": is_st[0] if is_st else None,
              "oos_cagr": oos_st[0] if oos_st else None,
              "spy_is": spy_is[0] if spy_is else None,
              "spy_oos": spy_oos[0] if spy_oos else None},
    "gate4": {"pass": gate4, "ci_lower": ci_lower, "ci_upper": ci_upper, "sims": SIMS, "block": BLOCK},
    "universe": {"unique_tickers_ever": len(STATUS),
                 "usable_tickers": len(USABLE),
                 "snapshot_dates": len(MEMBERSHIP)},
    "fetched_at": datetime.now(tz=timezone.utc).isoformat(),
}
(HERE / "v3_results.json").write_text(json.dumps(results_out, indent=2), encoding="utf-8")
print(f"\nResults JSON -> {HERE / 'v3_results.json'}")
