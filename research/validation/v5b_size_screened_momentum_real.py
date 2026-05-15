"""Strategy B (fixed): Size-screened momentum using REAL market cap as size filter."""
import json, math, random, time, os
from pathlib import Path
from datetime import datetime
from bisect import bisect_right

HERE = Path(__file__).parent
RESEARCH = HERE.parent
CACHE_DIR = RESEARCH / ".cache"
PIT_DIR = RESEARCH / "historical-constituents"

MEMBERSHIP = json.loads((PIT_DIR / "pit_membership_full.json").read_text(encoding="utf-8"))
CACHE = json.loads((CACHE_DIR / "pit_price_cache.json").read_text(encoding="utf-8"))
PRICES = CACHE["series"]
STATUS = json.loads((CACHE_DIR / "pit_ticker_status.json").read_text(encoding="utf-8"))
MKT_CAPS = json.loads((CACHE_DIR / "marketcaps.json").read_text(encoding="utf-8"))
USABLE = {t for t, info in STATUS.items() if info["status"] in ("ok", "partial")}

ALL_DATES = sorted({d for d, _ in PRICES["SPY"]})
date_to_idx = {d: i for i, d in enumerate(ALL_DATES)}
TODAY_IDX = len(ALL_DATES) - 1

PX = {}
for orig in USABLE:
    ysym = STATUS[orig]["yahoo_sym"]
    if ysym not in PRICES: continue
    px_by_idx = {date_to_idx[d]: p for d, p in PRICES[ysym] if d in date_to_idx}
    if px_by_idx: PX[orig] = px_by_idx
PX_SORTED_IDX = {t: sorted(d.keys()) for t, d in PX.items()}

def price_at(t, idx, max_stale=10):
    if t not in PX_SORTED_IDX: return None
    si = PX_SORTED_IDX[t]
    pos = bisect_right(si, idx) - 1
    if pos < 0: return None
    found = si[pos]
    if idx - found > max_stale: return None
    return PX[t][found]

TODAY_PRICE = {}
for orig in USABLE:
    p = price_at(orig, TODAY_IDX)
    if p is not None and p > 0:
        TODAY_PRICE[orig] = p

def cap_proxy(t, idx):
    ysym = STATUS[t]["yahoo_sym"]
    today_cap = (MKT_CAPS.get(ysym, {}).get("cap") or 0)
    if today_cap == 0: return 0
    p_today = TODAY_PRICE.get(t)
    p_at = price_at(t, idx)
    if not p_today or not p_at: return 0
    return today_cap * (p_at / p_today)

SORTED_MEMBERSHIP_DATES = sorted(MEMBERSHIP.keys())
def universe_at(date_str):
    pos = bisect_right(SORTED_MEMBERSHIP_DATES, date_str) - 1
    if pos < 0: return set()
    return set(MEMBERSHIP[SORTED_MEMBERSHIP_DATES[pos]]) & USABLE

SIZE_PCTILE = 0.30

def build_strategy(n, lookback, rebal_days, select_random=False, seed=None):
    rng = random.Random(seed) if select_random and seed is not None else None
    hold = {}; last_pv = 100.0; out = []
    for i in range(len(ALL_DATES)):
        d = ALL_DATES[i]
        if hold:
            pv = sum(sh * (price_at(t, i) or 0) for t, sh in hold.items())
            if pv > 0: last_pv = pv
        if i % rebal_days == 0:
            pit = universe_at(d)
            # Step 1: REAL cap filter — top 30% by today_cap × price_ratio
            with_cap = [(t, cap_proxy(t, i)) for t in pit]
            with_cap = [(t, c) for t, c in with_cap if c > 0]
            if len(with_cap) < n:
                out.append((d, last_pv)); continue
            with_cap.sort(key=lambda x: -x[1])
            k_size = max(n, int(len(with_cap) * SIZE_PCTILE))
            size_pool = [t for t, _ in with_cap[:k_size]]
            # Step 2: momentum on filtered pool
            elig = []
            for t in size_pool:
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
        b = out[0][1]
        out = [(d, v / b * 100) for d, v in out]
    return out

def stats(pts):
    if len(pts) < 2: return (0, 0, 0, 0, 0)
    f, l = pts[0][1], pts[-1][1]
    yrs = (datetime.fromisoformat(pts[-1][0]) - datetime.fromisoformat(pts[0][0])).days / 365.25
    cagr = (l/f)**(1/yrs) - 1 if yrs > 0 and f > 0 and l > 0 else 0
    rets = [math.log(pts[i][1]/pts[i-1][1]) for i in range(1, len(pts)) if pts[i-1][1] > 0 and pts[i][1] > 0]
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

spy_pts = [(d, p) for d, p in PRICES["SPY"] if d in date_to_idx]
b = spy_pts[0][1]
spy_rebased = [(d, v/b*100) for d, v in spy_pts]

print("=" * 80)
print(f"STRATEGY B (FIXED): Size-screened momentum (real cap top {int(SIZE_PCTILE*100)}%, then momentum Top N)")
print("=" * 80)

t0 = time.time()
canonical = build_strategy(3, 252, 21)
c_stats = stats(canonical)
print(f"\nCanonical (Top 3, 12M, mthly): CAGR {c_stats[0]*100:.1f}% | Sharpe {c_stats[3]:.2f} | MaxDD {c_stats[2]*100:.1f}% ({time.time()-t0:.1f}s)")

print("\nSanity — Top 3 momentum within cap-filtered pool at selected dates:")
for sample_d in ["2008-01-02", "2015-01-02", "2020-01-02", "2025-01-02"]:
    if sample_d not in date_to_idx: continue
    idx = date_to_idx[sample_d]
    pit = universe_at(sample_d)
    with_cap = [(t, cap_proxy(t, idx)) for t in pit]
    with_cap = [(t, c) for t, c in with_cap if c > 0]
    with_cap.sort(key=lambda x: -x[1])
    k = max(3, int(len(with_cap) * SIZE_PCTILE))
    size_pool = [t for t, _ in with_cap[:k]]
    elig = []
    for t in size_pool:
        px = price_at(t, idx)
        p_old = price_at(t, idx - 252)
        if px is None or p_old is None or p_old <= 0: continue
        elig.append((t, px/p_old - 1))
    elig.sort(key=lambda x: -x[1])
    print(f"  {sample_d}: pool_size={len(size_pool)}  top3={', '.join(f'{t}({m*100:.0f}%)' for t,m in elig[:3])}")

windows = [("2000-01-01","2005-12-31","2000-2005"),("2006-01-01","2010-12-31","2006-2010"),
           ("2011-01-01","2015-12-31","2011-2015"),("2016-01-01","2020-12-31","2016-2020"),
           ("2021-01-01","2026-12-31","2021-2026")]
def stats_window(pts, s, e):
    win = [p for p in pts if s <= p[0] <= e]
    return stats(win) if len(win) >= 100 else None

print("\nWalk-Forward:")
wf_wins = 0; wf_results = []
for s, e, lab in windows:
    s_stats = stats_window(canonical, s, e)
    spy_st = stats_window(spy_rebased, s, e)
    if s_stats and spy_st:
        spread = (s_stats[0] - spy_st[0]) * 100
        if s_stats[0] > 0 and spread > 0: wf_wins += 1
        wf_results.append({"window":lab,"strat":s_stats[0],"spy":spy_st[0],"spread":spread})
        print(f"  {lab:<12} Strat {s_stats[0]*100:>6.1f}% | SPY {spy_st[0]*100:>5.1f}% | Spread {spread:>+6.1f}% | DD {s_stats[2]*100:>5.1f}%")

is_st = stats_window(canonical, "2000-01-01", "2015-12-31")
oos_st = stats_window(canonical, "2016-01-01", "2026-12-31")
spy_is = stats_window(spy_rebased, "2000-01-01", "2015-12-31")
spy_oos = stats_window(spy_rebased, "2016-01-01", "2026-12-31")
if is_st and oos_st and spy_is and spy_oos:
    print(f"\n  IS  Strat {is_st[0]*100:>5.1f}% vs SPY {spy_is[0]*100:>5.1f}% (spread {(is_st[0]-spy_is[0])*100:+.1f}%)")
    print(f"  OOS Strat {oos_st[0]*100:>5.1f}% vs SPY {spy_oos[0]*100:>5.1f}% (spread {(oos_st[0]-spy_oos[0])*100:+.1f}%)")
gate3 = (wf_wins == 5) and is_st and is_st[0] > 0 and oos_st and oos_st[0] > 0

print("\nBonferroni — 6 variants × 1000 perms:")
BONF = [(1, 252, 21, "N=1, 12M, mthly"),(3, 252, 21, "N=3, 12M, mthly"),(5, 252, 21, "N=5, 12M, mthly"),
        (3, 126, 21, "N=3, 6M,  mthly"),(3, 252, 5,  "N=3, 12M, wkly"),(3, 252, 63, "N=3, 12M, qtrly")]
PERMS = int(os.environ.get("V5B_PERMS", "1000"))
K = len(BONF); ALPHA = 0.05/K
bonf_results = []
total_t0 = time.time()
for vi, (n, lb, rb, label) in enumerate(BONF):
    t0 = time.time()
    actual = build_strategy(n, lb, rb)
    a_cagr = stats(actual)[0]
    perms = [stats(build_strategy(n, lb, rb, select_random=True, seed=140000+vi*PERMS+s))[0] for s in range(PERMS)]
    perms.sort()
    n_beat = sum(1 for c in perms if c >= a_cagr)
    p_val = (n_beat + 1) / (PERMS + 1)
    survives = p_val < ALPHA
    print(f"  {label:<18} actual={a_cagr*100:>5.1f}% rand_med={perms[PERMS//2]*100:>5.1f}% p={p_val:.4f} {'YES' if survives else 'no':<3} ({time.time()-t0:.0f}s)")
    bonf_results.append({"label":label,"actual":a_cagr,"median":perms[PERMS//2],"p":p_val,"survives":survives})
bonf_wins = sum(1 for r in bonf_results if r["survives"])
gate2 = bonf_wins == K
print(f"\n  Bonferroni: {bonf_wins}/{K} pass — runtime {(time.time()-total_t0)/60:.1f} min")

gate1_p = bonf_results[1]["p"]
gate1 = gate1_p < 0.05

print(f"\nBootstrap CI (1000 sims):")
canonical_rets = [math.log(canonical[i][1]/canonical[i-1][1]) for i in range(1, len(canonical))
                  if canonical[i-1][1] > 0 and canonical[i][1] > 0]
N_RETS = len(canonical_rets); BLOCK = 21; SIMS = 1000
boot_cagrs = []
random.seed(99999)
for _ in range(SIMS):
    sr = []
    while len(sr) < N_RETS:
        s = random.randint(0, N_RETS - BLOCK)
        sr.extend(canonical_rets[s:s+BLOCK])
    sr = sr[:N_RETS]
    pv = 100.0
    for r in sr: pv *= math.exp(r)
    yrs = N_RETS/252
    boot_cagrs.append((pv/100)**(1/yrs) - 1 if yrs > 0 else 0)
boot_cagrs.sort()
ci_lower = boot_cagrs[int(SIMS*0.025)]
ci_upper = boot_cagrs[int(SIMS*0.975)]
gate4 = ci_lower > 0
print(f"  95% CI: [{ci_lower*100:+.1f}%, {ci_upper*100:+.1f}%]")

print("\n" + "=" * 80)
print("STRATEGY B (FIXED) FINAL SCORECARD")
print("=" * 80)
print(f"  Headline:  CAGR {c_stats[0]*100:.1f}%  Sharpe {c_stats[3]:.2f}  MaxDD {c_stats[2]*100:.1f}%")
print(f"  Gate 1 MCPT:         {'PASS' if gate1 else 'FAIL'}  (p={gate1_p:.4f})")
print(f"  Gate 2 Bonferroni:   {'PASS' if gate2 else 'PARTIAL'}  ({bonf_wins}/{K})")
print(f"  Gate 3 Walk-Forward: {'PASS' if gate3 else 'FAIL'}  ({wf_wins}/5)")
print(f"  Gate 4 Bootstrap CI: {'PASS' if gate4 else 'FAIL'}  ([{ci_lower*100:+.1f}%, {ci_upper*100:+.1f}%])")
print(f"  {sum([gate1,gate2,gate3,gate4])}/4 gates passed")

out = {
    "strategy": "B_real_size_screened_momentum_pit",
    "size_pctile": SIZE_PCTILE,
    "headline": {"cagr": c_stats[0], "sharpe": c_stats[3], "maxdd": c_stats[2], "years": c_stats[4]},
    "gate1": {"pass": gate1, "p": gate1_p},
    "gate2": {"pass": gate2, "n_pass": bonf_wins, "variants": bonf_results},
    "gate3": {"pass": gate3, "wins": wf_wins, "windows": wf_results},
    "gate4": {"pass": gate4, "ci_lower": ci_lower, "ci_upper": ci_upper},
}
(HERE / "v5b_results.json").write_text(json.dumps(out, indent=2), encoding="utf-8")
print(f"\nResults -> {HERE / 'v5b_results.json'}")
