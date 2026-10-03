# Architecture

## 1. Overview

Analyza is a read-only system. Everything it shows is derived from public chain data and a small set of public market endpoints.

```
Robinhood Chain RPC ──┐
DefiLlama (chain TVL) ─┼──> feed layer ──> store ──> UI
DexScreener (pairs) ───┘
```

## 2. Chain

- Network: Robinhood Chain, chain id `4663`
- RPC: `https://rpc.mainnet.chain.robinhood.com`
- Calls used today: `eth_blockNumber`, `eth_gasPrice` (batched in one request)

## 3. Site

A static front end with no server component.

- **Feed layer** (`src/live/feeds.js`): one polling loop per source, with timeouts, backoff on failure, and an explicit `connecting | live | offline` status.
- **Store**: a small publish/subscribe object. Components subscribe; only the feed layer fetches.
- **UI**: skeleton while loading, count-up on first view, short tween and flash on later changes.
- **Register** (`src/data/registry.js`): every external fact (contract, X, GitHub, launch date) is one record with a state of `stated`, `absent` or `unconfirmed`. Links are derived from the stored URL and never emitted for unstated records.
- **Design tokens**: every color literal lives in one generated file, sampled from the brand assets.

## 4. Holder engine (planned)

| Stage | Input | Output |
| --- | --- | --- |
| Gather | Transfer logs for a token | Ordered transfer list |
| Rebuild | Transfer list | Per-address cost, proceeds, balance |
| Link | Addresses plus other tokens' logs | Cross-token history per address |
| Rank | Rebuilt books plus history | Return bands, track-record grade |
| Filter | All of the above | Exclusion counts with reasons |

Design rules:

- Derive from logs, never from a third party's holder list.
- Every aggregate carries its sample size.
- Excluded addresses are counted and labeled.
- No wallet connection, no signing, no keys.

## 5. Testing approach

- Synthetic fixtures only; no test depends on a live endpoint.
- Timers run on a scaled clock so timing behavior is checked in seconds.
- Layout is measured at 360, 390, 430, 1366 and 1440 px for overflow and tap-target size.

## 6. Non-goals

- Price prediction
- Custody or transaction execution
- Collecting user accounts or wallet data
