# token-launch-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/jearokx/token-launch-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/jearokx/token-launch-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar: it ranks 198 pre-token protocols from a sealed DefiLlama snapshot (all 40 watchlist protocols plus 158 early finds) by an implied token value learned from the snapshot itself — each category's mcap/TVL median among protocols whose token already trades, adjusted for 7-day TVL growth, for how long the protocol has run with no token, and for chain breadth. Protocols whose token already trades (416 of them) are set aside, never ranked, and wrapped or staked products of traded tokens are excluded from the early board. Every row carries a concrete farm plan with capital, gas cost and weekly time, and the static dashboard is sortable and filterable, with a per-protocol detail view that shows the exact model breakdown behind its value.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <path-to-snapshot.json>
```

Node 22.18 or later, standard library only, no network. This writes `out/board.json`, `out/data.js`, `out/dashboard/`, `out/screenshots/` and `out/dossier.json`. Open `out/dashboard/index.html` in a browser to use the radar; `#watch=1` starts filtered to the watchlist and `#detail=<slug>` opens one protocol directly.

---

<sub>Entered on [make.fun](https://make.fun/?ref=d5a50dzy&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
