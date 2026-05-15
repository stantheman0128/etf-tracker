# Strategy Research Workspace

This folder holds the **historical validation evidence** for the strategies running in production at `app/strategies/`. The Python scripts here are not part of the deployed Next.js app — they are reproducible artifacts that prove (or disprove) the alpha claims behind each strategy.

## Layout

```
research/
├── validation/                   # 4-gate quant validation scripts
│   ├── fetch_sp500_cache.py        # Yahoo Finance fetcher for current SP500 constituents
│   ├── v2_sp500_fixed_universe.py  # 4-gate validation on today's SP500 (survivorship-biased)
│   └── v3_sp500_pit.py             # 4-gate validation on point-in-time SP500 (bias-free) — WIP
├── historical-constituents/      # Point-in-time SP500 membership data
│   └── fetch_fja05680.py           # Pull monthly constituent snapshots from fja05680/sp500
├── .cache/                       # gitignored — rebuildable from fetch scripts
└── .gitignore
```

## Four-gate validation standard

Each strategy must pass all four before live trading:

1. **MCPT** — actual CAGR beats 95% of random-selection permutations
2. **Bonferroni** — α / n_variants; min p-value < α_corrected
3. **Walk-Forward** — both in-sample and out-of-sample windows positive
4. **Bootstrap CI** — 95% CI lower bound > 0

And then **forward-forward 30+ live rebalances** before real money.

## Universe definitions

- **Fixed universe** (v2): Today's SP500 + 3 ADRs. Has survivorship bias — companies kicked out of SP500 are absent.
- **Point-in-time universe** (v3): Each rebalance day uses the SP500 membership *at that date*. Includes companies that were later delisted, while Yahoo still has their price history.

## Reproducing

```bash
# Fetch today's SP500 prices (~3 min, writes ~70MB to .cache/)
python research/validation/fetch_sp500_cache.py

# Run fixed-universe validation (~7 min, writes png next to script)
python research/validation/v2_sp500_fixed_universe.py

# Run PIT validation (~10-15 min, requires historical-constituents data)
python research/historical-constituents/fetch_fja05680.py
python research/validation/v3_sp500_pit.py
```

## Results

See `RESULTS.md` (generated after v3 run) for the side-by-side scorecard.
