# Analyza

**Read the market from its holders.**

Analyza is an on-chain market analysis project for [Robinhood Chain](https://rpc.mainnet.chain.robinhood.com). It rebuilds the holder base behind a token from public chain history, so a token can be judged by who owns it and how those owners have behaved before.

Site: [analyza.fun](https://analyza.fun) · Status: **in build**

---

## What it answers

| Question | What gets measured |
| --- | --- |
| Who holds the bag | How much float sits with a handful of addresses, and for how long |
| Ahead or behind | Each holder's return, built from cost, proceeds and open position |
| Follow the wallet trail | The same address across every other token it has touched |
| Weigh the evidence | Every figure lists how many addresses stand behind it |

## How a token gets read

1. **Gather** every transfer from chain logs
2. **Rebuild** each address transaction by transaction
3. **Link** addresses against other tokens
4. **Rank** holders by return band and track record
5. **Filter** noise so it stays visible but never moves a headline figure

Details are in [docs/architecture.md](docs/architecture.md).

## Chain

| Field | Value |
| --- | --- |
| Network | Robinhood Chain |
| Chain id | `4663` |
| RPC | `https://rpc.mainnet.chain.robinhood.com` |
| Live inputs | Chain RPC (block, gas), DefiLlama (chain TVL), DexScreener (pairs) |

## Contract

| Field | Value |
| --- | --- |
| Address | _Not announced yet_ |

The address will be published here and in the site's top bar at the same moment. Treat any address that appears anywhere else as unverified.

## Links

| Channel | Status |
| --- | --- |
| Website | [analyza.fun](https://analyza.fun) |
| X | _Not published yet_ |
| GitHub | You are here |

## Principles

- **Public data only.** No wallet connection, nothing to sign, no keys held.
- **Show the footing.** Numbers state their sample size.
- **Say what is not known.** Unannounced facts stay marked as unannounced.

## Documentation

- [Whitepaper](docs/whitepaper.md)
- [Tokenomics](docs/tokenomics.md)
- [Roadmap](docs/roadmap.md)
- [Architecture](docs/architecture.md)
- [Contributing](.github/CONTRIBUTING.md)
- [Security policy](.github/SECURITY.md)

## License

[MIT](LICENSE)
