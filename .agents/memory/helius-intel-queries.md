---
name: Helius token intelligence queries
description: Provider-specific constraints for reliable Solana holder and buyer enrichment.
---

For ranked holder concentration, use Solana's `getTokenLargestAccounts` and resolve the token-account owners with `getMultipleAccounts`; Helius DAS `getTokenAccounts` does not accept a `sortBy` field and its first page is not a reliable ranking.

**Why:** The Helius endpoint rejected `sortBy`, and using the first DAS page produced implausibly tiny concentration percentages for a large token.

**How to apply:** Use `getTokenAccounts` with `mint` and `owner` when checking whether a detected buyer still holds a token. Treat failed or non-wallet detections as unknown rather than inventing a sold/holding state.