"""Quick canonical-only comparison of multiple ranking methods on PIT SP500.

Skips Bonferroni / Bootstrap to be fast — just headline CAGR/Sharpe/MaxDD + walk-forward.
Output: side-by-side comparison table.
"""
import json, math, time
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

TODAY_PRICE = {orig: price_at(orig, TODAY_IDX) for orig in USABLE}
TODAY_PRICE = {k: v for k, v in TODAY_PRICE.items() if v and v > 0}

def cap_proxy(t, idx):
    today_cap = (MKT_CAPS.get(STATUS[t]["yahoo_sym"], {}).get("cap") or 0)
    if today_cap == 0: return 0
    p_today = TODAY_PRICE.get(t); p_at = price_at(t, idx)
    return today_cap * (p_at / p_today) if p_today and p_at else 0

def returns_window(t, idx, window):
    """List of daily log returns for ticker t over window ending at idx."""
    rets = []; prev = None
    for j in range(idx - window, idx):
        if j < 0: continue
        p = price_at(t, j)
        if p is None or p <= 0: prev = None; continue
        if prev and prev > 0: rets.append(math.log(p / prev))
        prev = p
    return rets

def momentum_12m(t, idx):
    px = price_at(t, idx); p_old = price_at(t, idx - 252)
    return (px / p_old - 1) if px and p_old and p_old > 0 else None

def volatility_63d(t, idx):
    rets = returns_window(t, idx, 63)
    if len(rets) < 30: return None
    mean = sum(rets)/len(rets)
    var = sum((r-mean)**2 for r in rets)/(len(rets)-1)
    return math.sqrt(var * 252) if var > 0 else None

def sharpe_252d(t, idx):
    rets = returns_window(t, idx, 252)
    if len(rets) < 100: return None
    mean = sum(rets)/len(rets); var = sum((r-mean)**2 for r in rets)/(len(rets)-1)
    vol = math.sqrt(var * 252) if var > 0 else 0
    return (mean*252 - 0.04)/vol if vol > 0 else None

def high52w_distance(t, idx):
    """Negative of distance to 52w high (close to 0 = near high). Want closest = pick largest negative."""
    px = price_at(t, idx)
    if px is None: return None
    high = 0
    for j in range(idx - 252, idx):
        if j < 0: continue
        p = price_at(t, j)
        if p and p > high: high = p
    return px / high if high > 0 else None  # close to 1 = near high

SORTED_MEMBERSHIP_DATES = sorted(MEMBERSHIP.keys())
def universe_at(date_str):
    pos = bisect_right(SORTED_MEMBERSHIP_DATES, date_str) - 1
    if pos < 0: return set()
    return set(MEMBERSHIP[SORTED_MEMBERSHIP_DATES[pos]]) & USABLE

# ─── Generic strategy builder ───────────────────────────────────────────
def build_strategy(n, rebal_days, ranking_fn, want_max=True, pre_filter=None):
    """Generic builder.
    ranking_fn(t, idx) -> float (None = skip).
    pre_filter(t, idx) -> bool (True to include in eligibility, before ranking).
    """
    hold = {}; last_pv = 100.0; out = []
    for i in range(len(ALL_DATES)):
        d = ALL_DATES[i]
        if hold:
            pv = sum(sh * (price_at(t, i) or 0) for t, sh in hold.items())
            if pv > 0: last_pv = pv
        if i % rebal_days == 0:
            pit = universe_at(d)
            elig = []
            for t in pit:
                if pre_filter and not pre_filter(t, i): continue
                rank_val = ranking_fn(t, i)
                if rank_val is None: continue
                px = price_at(t, i)
                if px is None or px <= 0: continue
                elig.append((t, rank_val, px))
            if not elig:
                out.append((d, last_pv)); continue
            elig.sort(key=lambda x: -x[1] if want_max else x[1])
            picked = elig[:n]
            hold = {t: (last_pv / len(picked)) / px for t, _, px in picked}
            out.append((d, last_pv))
        else:
            out.append((d, last_pv))
    if out and out[0][1] != 100:
        b = out[0][1]
        out = [(d, v/b*100) for d, v in out]
    return out

def stats(pts):
    if len(pts) < 2: return (0, 0, 0, 0)
    f, l = pts[0][1], pts[-1][1]
    yrs = (datetime.fromisoformat(pts[-1][0]) - datetime.fromisoformat(pts[0][0])).days / 365.25
    cagr = (l/f)**(1/yrs) - 1 if yrs > 0 and f > 0 and l > 0 else 0
    rets = [math.log(pts[i][1]/pts[i-1][1]) for i in range(1, len(pts)) if pts[i-1][1] > 0 and pts[i][1] > 0]
    if not rets: return (cagr, 0, 0, 0)
    mean = sum(rets)/len(rets); var = sum((r-mean)**2 for r in rets)/(len(rets)-1)
    vol = math.sqrt(var*252)
    sharpe = (mean*252 - 0.04)/vol if vol > 0 else 0
    peak, mdd = pts[0][1], 0
    for _, v in pts:
        if v > peak: peak = v
        dd = v/peak - 1
        if dd < mdd: mdd = dd
    return (cagr, vol, mdd, sharpe)

# ─── Build size-screened pre-filter (reusable) ──────────────────────────
def is_top_30_pct_cap(t, idx):
    """True if t is in top 30% by cap at idx. Cached per-idx for efficiency."""
    pit = universe_at(ALL_DATES[idx])
    with_cap = [(s, cap_proxy(s, idx)) for s in pit]
    with_cap = [(s, c) for s, c in with_cap if c > 0]
    if not with_cap: return False
    with_cap.sort(key=lambda x: -x[1])
    k = max(3, int(len(with_cap) * 0.30))
    return t in {s for s, _ in with_cap[:k]}

# Cache for size filter (huge speedup)
_size_cache = {}
def is_top_30_pct_cap_cached(t, idx):
    if idx not in _size_cache:
        pit = universe_at(ALL_DATES[idx])
        with_cap = [(s, cap_proxy(s, idx)) for s in pit]
        with_cap = [(s, c) for s, c in with_cap if c > 0]
        with_cap.sort(key=lambda x: -x[1])
        k = max(3, int(len(with_cap) * 0.30))
        _size_cache[idx] = {s for s, _ in with_cap[:k]}
    return t in _size_cache[idx]

# ─── SPY benchmark ──────────────────────────────────────────────────────
spy_pts = [(d, p) for d, p in PRICES["SPY"] if d in date_to_idx]
b = spy_pts[0][1]
spy_rebased = [(d, v/b*100) for d, v in spy_pts]

# ─── Run all strategies (canonical: N=3, monthly) ───────────────────────
STRATEGIES = [
    ("v3   pure momentum 12M",       lambda t,i: momentum_12m(t,i),    True,  None),
    ("v5b  size30% + momentum 12M",  lambda t,i: momentum_12m(t,i),    True,  is_top_30_pct_cap_cached),
    ("X    pure low-vol 63d",        lambda t,i: -1*(volatility_63d(t,i) or 999), True, None),
    ("Y    size30% + low-vol 63d",   lambda t,i: -1*(volatility_63d(t,i) or 999), True, is_top_30_pct_cap_cached),
    ("Z    pure Sharpe 252d",        lambda t,i: sharpe_252d(t,i),     True,  None),
    ("W    size30% + Sharpe 252d",   lambda t,i: sharpe_252d(t,i),     True,  is_top_30_pct_cap_cached),
    ("V    size30% + 52w high prox", lambda t,i: high52w_distance(t,i), True, is_top_30_pct_cap_cached),
]

print("=" * 95)
print(f"{'Strategy':<35} {'CAGR':>8} {'Sharpe':>8} {'MaxDD':>8} {'IS':>7} {'OOS':>7} {'WF wins':>8}")
print("=" * 95)
spy_st = stats(spy_rebased)
print(f"{'SPY (benchmark)':<35} {spy_st[0]*100:>7.1f}% {spy_st[3]:>8.2f} {spy_st[2]*100:>7.1f}% {'':>7} {'':>7} {'':>8}")

windows = [("2000-01-01","2005-12-31"),("2006-01-01","2010-12-31"),("2011-01-01","2015-12-31"),
           ("2016-01-01","2020-12-31"),("2021-01-01","2026-12-31")]

def stats_window(pts, s, e):
    win = [p for p in pts if s <= p[0] <= e]
    return stats(win) if len(win) >= 100 else None

for name, fn, want_max, pre in STRATEGIES:
    t0 = time.time()
    canonical = build_strategy(3, 21, fn, want_max, pre)
    cs = stats(canonical)
    is_st_ = stats_window(canonical, "2000-01-01", "2015-12-31")
    oos_st_ = stats_window(canonical, "2016-01-01", "2026-12-31")
    wins = 0
    for s, e in windows:
        sw = stats_window(canonical, s, e)
        spw = stats_window(spy_rebased, s, e)
        if sw and spw and sw[0] > 0 and sw[0] > spw[0]: wins += 1
    is_str = f"{is_st_[0]*100:>6.1f}%" if is_st_ else "  --"
    oos_str = f"{oos_st_[0]*100:>6.1f}%" if oos_st_ else "  --"
    print(f"{name:<35} {cs[0]*100:>7.1f}% {cs[3]:>8.2f} {cs[2]*100:>7.1f}% {is_str:>7} {oos_str:>7} {wins:>4}/5  ({time.time()-t0:.0f}s)")

print("=" * 95)
print(f"Universe: 694 PIT stocks (1999-2026)")
print(f"All N=3, monthly rebalance. NO Bonferroni — canonical + walk-forward only.")
