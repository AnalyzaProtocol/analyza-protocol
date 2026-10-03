# Analyza Whitepaper

_Status: working draft. The engine described here is in build; sections state what is intended, not what is shipped._

## 1. Summary

Price charts describe what a token did. They say little about who is holding it. Analyza reconstructs the holder base of a token on Robinhood Chain from public chain history and presents it as a readable crowd: how concentrated it is, how each holder stands, and how those holders have behaved elsewhere.

## 2. The problem

- A chart can look healthy while a few addresses control most of the float.
- Headline holder counts mix real participants with dust balances, free arrivals and contract plumbing.
- Evaluating a wallet's past behavior means stitching together many tokens by hand.
- Aggregate figures rarely disclose how many addresses support them.

## 3. The approach

Analyza treats the transfer log as the source of truth and derives everything from it.

1. **Gather.** Pull every transfer a token has had.
2. **Rebuild.** Replay each address to recover cost, proceeds and remaining balance.
3. **Link.** Match addresses against other tokens they have touched.
4. **Rank.** Group holders into return bands and grade each by how earlier positions aged.
5. **Filter.** Set aside tiny balances, free arrivals and contract plumbing. They stay listed but never move a headline figure.

## 4. Design commitments

- **Public data only.** The system reads chain state. It never asks for a wallet connection and never requests a signature.
- **Sample size on every number.** A figure without its footing is not shown as a finding.
- **Exclusions are visible.** Filtered addresses are counted and labeled, not silently dropped.
- **No unannounced facts.** Contract addresses, accounts and dates appear only once they are stated.

## 5. Scope and limits

- Analysis is retrospective. It describes holders; it does not predict price.
- Return figures depend on the transfers visible on chain. Activity routed through venues or contracts that obscure ownership is flagged rather than guessed.
- Nothing produced by Analyza is financial advice.

## 6. Vision

A reading layer for Robinhood Chain where any token's crowd can be inspected in seconds, with the evidence attached to every claim.

See also: [Architecture](architecture.md) · [Roadmap](roadmap.md) · [Tokenomics](tokenomics.md)
