"""Re-run validation: fix SPY benchmark + bump Bonferroni perms to 200."""

import json, math, random, urllib.request, time
from pathlib import Path
from datetime import datetime, timezone
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

HERE = Path(__file__).parent
CACHE = HERE / "sp500_cache.json"
DATA = json.loads(CACHE.read_text(encoding="utf-8"))

# Fix: SPY is NOT in S&P 500 — fetch it now if missing
if "SPY" not in DATA["series"]:
    print("Fetching SPY (was missing) ...")
    START = int(datetime(1999, 12, 1, tzinfo=timezone.utc).timestamp())
    END = int(datetime.now(tz=timezone.utc).timestamp())
    url = (f"https://query1.finance.yahoo.com/v8/finance/chart/SPY"
           f"?period1={START}&period2={END}&interval=1d")
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30) as r:
        p = json.loads(r.read().decode("utf-8"))
    result = p["chart"]["result"][0]
    ts = result["timestamp"]; cls = result["indicators"]["quote"][0]["close"]
    out = []
    for t, c in zip(ts, cls):
        if c is None: continue
        iso = datetime.fromtimestamp(t, tz=timezone.utc).strftime("%Y-%m-%d")
        out.append([iso, round(float(c), 4)])
    DATA["series"]["SPY"] = out
    CACHE.write_text(json.dumps(DATA))
    print(f"  -> {len(out)} pts saved")

POOL = [t for t in DATA["series"] if t != "SPY"]
print(f"Universe: {len(POOL)} stocks (SPY held separately as benchmark)")

ALL_DATES = sorted(set().union(*[set(dict(DATA["series"][t]).keys()) for t in POOL]))
date_to_idx = {d: i for i, d in enumerate(ALL_DATES)}
print(f"Date range: {ALL_DATES[0]} -> {ALL_DATES[-1]}  ({len(ALL_DATES)} days)")

# Build aligned price arrays
PX_ARRAY = {}
for t in POOL + ["SPY"]:
    arr = [None] * len(ALL_DATES)
    for d, p in DATA["series"][t]:
        idx = date_to_idx.get(d)
        if idx is not None:
            arr[idx] = p
    PX_ARRAY[t] = arr

def price_at(arr, idx):
    if idx < 0: return None
    for i in range(idx, max(0, idx-10), -1):
        v = arr[i]
        if v is not None: return v
    return None

def build_strategy(n, lookback, rebal_days, select_random=False, seed=None):
    rng = random.Random(seed) if select_random and seed is not None else None
    last_px = {t: None for t in POOL}
    hold = {}; last_pv = 100.0; out = []
    for i in range(len(ALL_DATES)):
        for t in POOL:
            v = PX_ARRAY[t][i]
            if v is not None: last_px[t] = v
        if i % rebal_days == 0:
            pv = sum(sh*last_px[t] for t,sh in hold.items() if last_px[t] is not None)
            if pv == 0: pv = 100.0
            elig = []
            for t in POOL:
                px = last_px[t]
                if px is None: continue
                p_old = price_at(PX_ARRAY[t], i - lookback)
                if p_old is None or p_old <= 0: continue
                mom = px/p_old - 1
                if not math.isnan(mom): elig.append((t, mom, px))
            if not elig:
                out.append((ALL_DATES[i], last_pv)); continue
            if select_random:
                picked = rng.sample(elig, min(n, len(elig)))
            else:
                elig.sort(key=lambda x: -x[1])
                picked = elig[:n]
            hold = {t: (pv/len(picked))/px for t,_,px in picked}
            last_pv = pv
            out.append((ALL_DATES[i], pv))
        else:
            pv = sum(sh*last_px[t] for t,sh in hold.items() if last_px[t] is not None)
            if pv > 0: last_pv = pv
            out.append((ALL_DATES[i], last_pv))
    if out and out[0][1] != 100:
        base = out[0][1]; out = [(d, v/base*100) for d,v in out]
    return out

def stats(pts):
    if len(pts) < 2: return (0, 0, 0, 0, 0)
    f, l = pts[0][1], pts[-1][1]
    days = (datetime.fromisoformat(pts[-1][0]) - datetime.fromisoformat(pts[0][0])).days
    yrs = days/365.25
    cagr = (l/f)**(1/yrs) - 1 if yrs > 0 and f > 0 and l > 0 else 0
    rets = [math.log(pts[i][1]/pts[i-1][1]) for i in range(1, len(pts))
            if pts[i-1][1] > 0 and pts[i][1] > 0]
    if not rets: return (cagr, 0, 0, 0, yrs)
    mean = sum(rets)/len(rets); var = sum((r-mean)**2 for r in rets)/(len(rets)-1)
    vol = math.sqrt(var*252)
    sharpe = (mean*252 - 0.04)/vol if vol > 0 else 0
    peak, mdd = pts[0][1], 0
    for _, v in pts:
        if v > peak: peak = v
        dd = v/peak - 1
        if dd < mdd: mdd = dd
    return (cagr, vol, mdd, sharpe, yrs)

# Build correct SPY benchmark (rebased to 100 at first date)
spy_pairs = [(ALL_DATES[i], PX_ARRAY["SPY"][i]) for i in range(len(ALL_DATES))
             if PX_ARRAY["SPY"][i] is not None]
base = spy_pairs[0][1]
spy_rebased = [(d, v/base*100) for d, v in spy_pairs]
print(f"\nSPY rebased: first date {spy_rebased[0][0]} value 100.00")
print(f"             last  date {spy_rebased[-1][0]} value {spy_rebased[-1][1]:.1f}")

# ═══════════════════════════════════════════════════════════════
# Build canonical strategy
# ═══════════════════════════════════════════════════════════════
print("\n" + "="*80)
print("CANONICAL: TOP 3 by 12M Momentum on S&P 500 (505 stocks)")
print("="*80)
t0 = time.time()
canonical = build_strategy(3, 252, 21)
c_stats = stats(canonical)
print(f"  Run time: {time.time()-t0:.1f}s")
print(f"  CAGR {c_stats[0]*100:.1f}% | Sharpe {c_stats[3]:.2f} | MaxDD {c_stats[2]*100:.1f}%")

# ═══════════════════════════════════════════════════════════════
# Gate 3: Walk-Forward with CORRECT SPY
# ═══════════════════════════════════════════════════════════════
print("\n" + "="*80)
print("GATE 3: Walk-Forward (with CORRECT SPY benchmark)")
print("="*80)

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
    spy_st = stats_window(spy_rebased, s, e)
    if s_stats and spy_st:
        spread = (s_stats[0] - spy_st[0]) * 100
        if s_stats[0] > 0 and spread > 0: wf_wins += 1
        wf_results.append({"window": lab, "strat": s_stats[0], "spy": spy_st[0],
                          "spread": spread, "strat_dd": s_stats[2], "spy_dd": spy_st[2]})
        print(f"{lab:<12} {s_stats[0]*100:>10.1f}% {spy_st[0]*100:>9.1f}% "
              f"{spread:>+8.1f}% {s_stats[2]*100:>9.1f}% {spy_st[2]*100:>8.1f}%")

is_st = stats_window(canonical, "2000-01-01", "2015-12-31")
oos_st = stats_window(canonical, "2016-01-01", "2026-12-31")
spy_is = stats_window(spy_rebased, "2000-01-01", "2015-12-31")
spy_oos = stats_window(spy_rebased, "2016-01-01", "2026-12-31")
print(f"\nIS  (2000-2015):  Strat {is_st[0]*100:>5.1f}%  vs  SPY {spy_is[0]*100:>5.1f}%  "
      f"(spread {(is_st[0]-spy_is[0])*100:+.1f}%)")
print(f"OOS (2016-2026):  Strat {oos_st[0]*100:>5.1f}%  vs  SPY {spy_oos[0]*100:>5.1f}%  "
      f"(spread {(oos_st[0]-spy_oos[0])*100:+.1f}%)")
gate3 = (wf_wins == len(windows)) and (is_st[0] > 0) and (oos_st[0] > 0)
print(f"\nGATE 3: {'** PASS' if gate3 else '   FAIL'}  ({wf_wins}/{len(windows)} windows positive)")

# ═══════════════════════════════════════════════════════════════
# Gate 2: Bonferroni — 200 perms (so min p < 0.0083 is achievable)
# ═══════════════════════════════════════════════════════════════
print("\n" + "="*80)
print("GATE 2 (RERUN): Bonferroni — 200 perms (min p = 1/201 = 0.00498)")
print("="*80)
BONF = [
    (1, 252, 21, "N=1, 12M, mthly"),
    (3, 252, 21, "N=3, 12M, mthly"),
    (5, 252, 21, "N=5, 12M, mthly"),
    (3, 126, 21, "N=3, 6M,  mthly"),
    (3, 252, 5,  "N=3, 12M, weekly"),
    (3, 252, 63, "N=3, 12M, qtrly"),
]
K = len(BONF)
ALPHA_CORR = 0.05/K
PERMS = 200
print(f"  K={K}, threshold = 0.05/{K} = {ALPHA_CORR:.4f}, min p = {1/(PERMS+1):.4f}")

print(f"\n{'Variant':<22} {'Actual':>9} {'Rand med':>10} {'p-value':>9} {'Bonf?':>7}")
print("-" * 60)
bonf_results = []
total_t0 = time.time()
for vi, (n, lb, rb, label) in enumerate(BONF):
    t0 = time.time()
    actual = build_strategy(n, lb, rb)
    a_cagr = stats(actual)[0]
    perms = []
    for s in range(PERMS):
        p = build_strategy(n, lb, rb, select_random=True, seed=30000 + vi*PERMS + s)
        perms.append(stats(p)[0])
    perms.sort()
    n_beat = sum(1 for c in perms if c >= a_cagr)
    p_val = (n_beat + 1) / (PERMS + 1)
    survives = p_val < ALPHA_CORR
    mark = "** YES" if survives else "   no"
    el = time.time() - t0
    print(f"{label:<22} {a_cagr*100:>8.1f}% {perms[PERMS//2]*100:>9.1f}% "
          f"{p_val:>9.4f} {mark:>7}  ({el:.0f}s)")
    bonf_results.append({"label": label, "actual": a_cagr,
                         "median": perms[PERMS//2], "p": p_val, "survives": survives})

bonf_wins = sum(1 for r in bonf_results if r["survives"])
gate2 = bonf_wins == K
print(f"\nGATE 2: {'** PASS' if gate2 else '** PARTIAL'}  "
      f"({bonf_wins}/{K} variants pass at α={ALPHA_CORR:.4f})")
print(f"  Total run time: {(time.time()-total_t0)/60:.1f} min")

# ═══════════════════════════════════════════════════════════════
# Final scorecard (Gates 1 + 4 from prior run unchanged: PASS)
# ═══════════════════════════════════════════════════════════════
print("\n" + "="*80)
print("FINAL SCORECARD — S&P 500 (505 stocks) with CORRECTED SPY benchmark")
print("="*80)
print(f"  Headline:    CAGR {c_stats[0]*100:.1f}%  Sharpe {c_stats[3]:.2f}  "
      f"MaxDD {c_stats[2]*100:.1f}%")
print()
print(f"  Gate 1 MCPT:        PASS  (p=0.0099, from prior run with 100 perms)")
print(f"  Gate 2 Bonferroni:  {'** PASS' if gate2 else '** PARTIAL'}  "
      f"({bonf_wins}/{K} pass, 200 perms)")
print(f"  Gate 3 Walk-Forward:{'** PASS' if gate3 else 'FAIL'}  "
      f"({wf_wins}/{len(windows)} + IS/OOS)")
print(f"  Gate 4 Bootstrap:   PASS  (CI lower 24.6%, from prior run)")

n_passed = sum([True, gate2, gate3, True])  # 1 and 4 known PASS
print(f"\n  {n_passed}/4 gates passed")

# ═══════════════════════════════════════════════════════════════
# Chart
# ═══════════════════════════════════════════════════════════════
fig, axes = plt.subplots(1, 2, figsize=(15, 5.5))

# Panel 1: Corrected Walk-Forward
ax = axes[0]
labels = [w["window"] for w in wf_results]
strat_v = [w["strat"]*100 for w in wf_results]
spy_v = [w["spy"]*100 for w in wf_results]
x = np.arange(len(labels)); w_bar = 0.36
b1 = ax.bar(x - w_bar/2, strat_v, w_bar, label="Strategy (SP500)", color="#d33030")
b2 = ax.bar(x + w_bar/2, spy_v, w_bar, label="SPY (corrected)", color="#000")
for b in b1: ax.text(b.get_x()+b.get_width()/2, b.get_height() + (1 if b.get_height()>=0 else -3),
                      f"{b.get_height():.0f}%", ha="center", fontsize=10, fontweight="bold")
for b in b2: ax.text(b.get_x()+b.get_width()/2, b.get_height() + (1 if b.get_height()>=0 else -3),
                      f"{b.get_height():.0f}%", ha="center", fontsize=10)
ax.set_xticks(x); ax.set_xticklabels(labels, fontsize=9)
ax.set_ylabel("CAGR (%)")
ax.set_title(f"Gate 3: Walk-Forward (corrected SPY) — {wf_wins}/{len(windows)} positive",
             fontsize=12, fontweight="bold", loc="left")
ax.grid(alpha=0.3, axis="y"); ax.legend(fontsize=9.5)
ax.axhline(0, color="#333", linewidth=0.8)

# Panel 2: Bonferroni with 200 perms
ax = axes[1]
p_vals = [r["p"] for r in bonf_results]
colors = ["#d33030" if r["survives"] else "#999" for r in bonf_results]
bars = ax.bar(range(K), p_vals, color=colors, alpha=0.85)
ax.axhline(ALPHA_CORR, color="#1a73e8", linestyle="--", linewidth=2,
           label=f"Bonferroni α = 0.05/{K} = {ALPHA_CORR:.4f}")
ax.axhline(1/(PERMS+1), color="#0f9d58", linestyle=":", linewidth=1.5,
           label=f"Min achievable p ({PERMS} perms) = {1/(PERMS+1):.4f}")
for b, p in zip(bars, p_vals):
    ax.text(b.get_x()+b.get_width()/2, p + 0.0003,
             f"{p:.4f}", ha="center", fontsize=9, fontweight="bold")
ax.set_xticks(range(K))
ax.set_xticklabels([r["label"] for r in bonf_results], rotation=30, ha="right", fontsize=8.5)
ax.set_ylabel("p-value")
ax.set_title(f"Gate 2 (200 perms): {bonf_wins}/{K} pass Bonferroni",
             fontsize=12, fontweight="bold", loc="left")
ax.grid(alpha=0.3, axis="y"); ax.legend(fontsize=9)

fig.suptitle("Corrected validation — fixed SPY benchmark + 200-perm Bonferroni",
             fontsize=13, fontweight="bold")
plt.tight_layout(rect=[0, 0, 1, 0.95])
out = HERE / "validation_sp500_v2.png"
plt.savefig(out, dpi=140, bbox_inches="tight", facecolor="white")
print(f"\nChart -> {out}")
