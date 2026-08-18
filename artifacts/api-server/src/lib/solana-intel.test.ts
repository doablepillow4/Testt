import assert from "node:assert/strict";
import test from "node:test";

import { analyzeCoordinatedWallets, computeRemainingPercent, summarizeBuyerPosition } from "./solana-intel";

test("remainingPercent is never meaningfully above 100% and zero buys stay at zero", () => {
  assert.equal(computeRemainingPercent(150n, 100n), 100);
  assert.equal(computeRemainingPercent(100n, 100n), 100);
  assert.equal(computeRemainingPercent(40n, 100n), 40);
  assert.equal(computeRemainingPercent(80n, 0n), 0);
});

test("currentBalance cannot create a BUY amount that never occurred", () => {
  const summary = summarizeBuyerPosition({
    currentBalanceRaw: 80n,
    totalBoughtRaw: 0n,
    totalSoldRaw: 0n,
    totalSpentSol: 0,
    totalReceivedSol: 0,
    decimals: 9,
    dataCompleteness: "partial",
  });

  assert.equal(summary.totalBought, 0);
  assert.equal(summary.currentBalance, 0.00000008);
  assert.equal(summary.remainingPercent, 0);
  assert.equal(summary.status, "unknown");
});

test("partial sells reconcile cleanly", () => {
  const summary = summarizeBuyerPosition({
    currentBalanceRaw: 60n,
    totalBoughtRaw: 100n,
    totalSoldRaw: 40n,
    totalSpentSol: 150,
    totalReceivedSol: 0,
    decimals: 0,
    dataCompleteness: "complete",
  });

  assert.equal(summary.totalBought, 100);
  assert.equal(summary.totalSold, 40);
  assert.equal(summary.currentBalance, 60);
  assert.equal(summary.remainingPercent, 60);
  assert.equal(summary.status, "holding");
});

test("full sells result in a sold position", () => {
  const summary = summarizeBuyerPosition({
    currentBalanceRaw: 0n,
    totalBoughtRaw: 100n,
    totalSoldRaw: 100n,
    totalSpentSol: 150,
    totalReceivedSol: 150,
    decimals: 0,
    dataCompleteness: "complete",
  });

  assert.equal(summary.remainingPercent, 0);
  assert.equal(summary.status, "sold");
  assert.equal(summary.currentBalance, 0);
});

test("transfer-only balances remain non-trading and incomplete", () => {
  const summary = summarizeBuyerPosition({
    currentBalanceRaw: 25n,
    totalBoughtRaw: 0n,
    totalSoldRaw: 0n,
    totalSpentSol: 0,
    totalReceivedSol: 0,
    decimals: 0,
    dataCompleteness: "unknown",
  });

  assert.equal(summary.totalBought, 0);
  assert.equal(summary.totalSold, 0);
  assert.equal(summary.remainingPercent, 0);
  assert.equal(summary.realizedPnl, null);
  assert.equal(summary.status, "unknown");
});

test("sell with no observed buys is incomplete and not holding", () => {
  const summary = summarizeBuyerPosition({
    currentBalanceRaw: 0n,
    totalBoughtRaw: 0n,
    totalSoldRaw: 10n,
    totalSpentSol: 0,
    totalReceivedSol: 0,
    decimals: 0,
    dataCompleteness: "partial",
  });

  assert.equal(summary.totalBought, 0);
  assert.equal(summary.totalSold, 10);
  assert.equal(summary.status, "unknown");
  assert.equal(summary.dataCompleteness, "partial");
  assert.equal(summary.realizedPnl, null);
});

test("incomplete history is marked incomplete when sold exceeds bought", () => {
  const summary = summarizeBuyerPosition({
    currentBalanceRaw: 10n,
    totalBoughtRaw: 20n,
    totalSoldRaw: 25n,
    totalSpentSol: 0,
    totalReceivedSol: 0,
    decimals: 0,
    dataCompleteness: "complete",
  });

  assert.equal(summary.dataCompleteness, "partial");
  assert.equal(summary.status, "unknown");
  assert.equal(summary.remainingPercent, 50);
});

test("unrelated wallets in the same DEX transaction do not cluster", () => {
  const result = analyzeCoordinatedWallets({
    tradeEvents: [
      { wallet: "A", type: "BUY", amountRaw: 1000n, timestamp: 1_700_000_000, signature: "sig-1" },
      { wallet: "B", type: "BUY", amountRaw: 1200n, timestamp: 1_700_000_010, signature: "sig-1" },
    ],
    totalSupplyRaw: 1_000_000n,
    decimals: 9,
    walletBalances: new Map([["A", 1000n], ["B", 1200n]]),
  });

  assert.equal(result.clusters.length, 0);
});

test("shared funding sources are treated as real evidence when they repeat", () => {
  const result = analyzeCoordinatedWallets({
    tradeEvents: [
      { wallet: "A", type: "BUY", amountRaw: 1_000_000n, timestamp: 1_700_000_000, signature: "sig-1", fundingSource: "funding-1" },
      { wallet: "B", type: "BUY", amountRaw: 980_000n, timestamp: 1_700_000_090, signature: "sig-1", fundingSource: "funding-1" },
      { wallet: "A", type: "BUY", amountRaw: 1_100_000n, timestamp: 1_700_010_000, signature: "sig-2", fundingSource: "funding-1" },
      { wallet: "B", type: "BUY", amountRaw: 1_050_000n, timestamp: 1_700_010_100, signature: "sig-2", fundingSource: "funding-1" },
    ],
    totalSupplyRaw: 10_000_000n,
    decimals: 9,
    walletBalances: new Map([["A", 2_000_000n], ["B", 1_900_000n]]),
  });

  const cluster = result.clusters[0];
  assert.ok(cluster);
  assert.ok(cluster.signals.some((signal) => signal.type === "funding-source"));
  assert.ok(cluster.reasons.some((reason) => reason.toLowerCase().includes("funding source") || reason.toLowerCase().includes("funding")));
});

test("same timing without shared funding or repeated patterns does not cluster", () => {
  const result = analyzeCoordinatedWallets({
    tradeEvents: [
      { wallet: "A", type: "BUY", amountRaw: 1_000n, timestamp: 1_700_000_000, signature: "sig-1" },
      { wallet: "B", type: "BUY", amountRaw: 990n, timestamp: 1_700_000_090, signature: "sig-2" },
    ],
    totalSupplyRaw: 1_000_000n,
    decimals: 9,
    walletBalances: new Map([["A", 1_000n], ["B", 990n]]),
  });

  assert.equal(result.clusters.length, 0);
});

test("similar trade sizes without repeated evidence do not cluster", () => {
  const result = analyzeCoordinatedWallets({
    tradeEvents: [
      { wallet: "A", type: "BUY", amountRaw: 2_000n, timestamp: 1_700_000_000, signature: "sig-1" },
      { wallet: "B", type: "BUY", amountRaw: 1_900n, timestamp: 1_700_020_000, signature: "sig-2" },
    ],
    totalSupplyRaw: 1_000_000n,
    decimals: 9,
    walletBalances: new Map([["A", 2_000n], ["B", 1_900n]]),
  });

  assert.equal(result.clusters.length, 0);
});

test("repeated coordinated buys raise confidence and survive the multi-signal check", () => {
  const result = analyzeCoordinatedWallets({
    tradeEvents: [
      { wallet: "A", type: "BUY", amountRaw: 1_000n, timestamp: 1_700_000_000, signature: "sig-1" },
      { wallet: "B", type: "BUY", amountRaw: 980n, timestamp: 1_700_000_020, signature: "sig-1" },
      { wallet: "A", type: "BUY", amountRaw: 1_100n, timestamp: 1_700_010_000, signature: "sig-2" },
      { wallet: "B", type: "BUY", amountRaw: 1_050n, timestamp: 1_700_010_030, signature: "sig-2" },
    ],
    totalSupplyRaw: 10_000n,
    decimals: 9,
    walletBalances: new Map([["A", 2_100n], ["B", 2_030n]]),
  });

  assert.ok(result.clusters.length > 0);
  assert.ok(result.clusters[0]?.confidence >= 0.4);
  assert.ok(result.clusters[0]?.signals.some((signal) => signal.type === "same-tx" || signal.type === "temporal" || signal.type === "similar-size"));
});

test("coordinated sells are detected without claiming common ownership", () => {
  const result = analyzeCoordinatedWallets({
    tradeEvents: [
      { wallet: "X", type: "SELL", amountRaw: 900n, timestamp: 1_700_000_000, signature: "sig-1" },
      { wallet: "Y", type: "SELL", amountRaw: 870n, timestamp: 1_700_000_090, signature: "sig-1" },
      { wallet: "X", type: "SELL", amountRaw: 800n, timestamp: 1_700_001_000, signature: "sig-2" },
      { wallet: "Y", type: "SELL", amountRaw: 790n, timestamp: 1_700_001_080, signature: "sig-2" },
    ],
    totalSupplyRaw: 1_000_000n,
    decimals: 9,
    walletBalances: new Map([["X", 0n], ["Y", 0n]]),
  });

  const cluster = result.clusters[0];
  assert.ok(cluster);
  assert.ok(cluster.signals.some((signal) => signal.type === "sell-sync"));
  assert.ok(cluster.reasons.some((reason) => reason.toLowerCase().includes("sell")));
});

test("LP and router activity is not treated as wallet coordination when it is not repeated", () => {
  const result = analyzeCoordinatedWallets({
    tradeEvents: [
      { wallet: "LP-1", type: "BUY", amountRaw: 25_000n, timestamp: 1_700_000_000, signature: "lp-sig-1" },
      { wallet: "ROUTER-1", type: "BUY", amountRaw: 24_500n, timestamp: 1_700_000_020, signature: "lp-sig-1" },
    ],
    totalSupplyRaw: 1_000_000n,
    decimals: 9,
    walletBalances: new Map([["LP-1", 25_000n], ["ROUTER-1", 24_500n]]),
  });

  assert.equal(result.clusters.length, 0);
});

test("incomplete transaction history stays partial", () => {
  const result = analyzeCoordinatedWallets({
    tradeEvents: [
      { wallet: "A", type: "BUY", amountRaw: 500n, timestamp: 1_700_000_000, signature: "sig-1" },
      { wallet: "B", type: "BUY", amountRaw: 490n, timestamp: 1_700_000_100, signature: "sig-1" },
    ],
    totalSupplyRaw: 10_000_000n,
    decimals: 9,
    walletBalances: new Map([["A", 500n], ["B", 490n]]),
  });

  assert.equal(result.dataCompleteness, "partial");
  assert.equal(result.clusters.length, 0);
});
