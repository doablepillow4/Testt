import assert from "node:assert/strict";
import test from "node:test";

import { analyzeCoordinatedWallets, analyzeHolderDistributionRisk, analyzeTokenRisk, computeRemainingPercent, summarizeBuyerPosition } from "./solana-intel";

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

test("healthy distribution stays low risk", () => {
  const result = analyzeHolderDistributionRisk({
    holders: [
      { address: "A", percentage: 3 },
      { address: "B", percentage: 3 },
      { address: "C", percentage: 3 },
      { address: "D", percentage: 3 },
      { address: "E", percentage: 3 },
      { address: "F", percentage: 3 },
      { address: "G", percentage: 3 },
      { address: "H", percentage: 3 },
      { address: "I", percentage: 3 },
      { address: "J", percentage: 2 },
      { address: "K", percentage: 2 },
      { address: "L", percentage: 2 },
      { address: "M", percentage: 2 },
      { address: "N", percentage: 2 },
      { address: "O", percentage: 2 },
    ],
    totalSupply: 100,
    liquidityUsd: 500_000,
  });

  assert.equal(result.riskLevel, "low");
  assert.equal(result.dataCompleteness, "complete");
  assert.ok(result.top10Concentration < 35);
});

test("whale concentration raises the risk score", () => {
  const result = analyzeHolderDistributionRisk({
    holders: [
      { address: "WHALE-1", percentage: 25 },
      { address: "WHALE-2", percentage: 19 },
      { address: "WHALE-3", percentage: 17 },
      { address: "WHALE-4", percentage: 12 },
      { address: "WHALE-5", percentage: 9 },
      { address: "WHALE-6", percentage: 8 },
      { address: "WHALE-7", percentage: 6 },
      { address: "WHALE-8", percentage: 5 },
      { address: "WHALE-9", percentage: 4 },
      { address: "WHALE-10", percentage: 3 },
    ],
    totalSupply: 100,
    liquidityUsd: 120_000,
  });

  assert.ok(["medium", "high", "critical"].includes(result.riskLevel));
  assert.ok(result.top10Concentration >= 60);
  assert.ok(result.reasons.some((reason) => reason.toLowerCase().includes("top 10")));
});

test("LP and infrastructure wallets are excluded from concentration risk", () => {
  const result = analyzeHolderDistributionRisk({
    holders: [
      { address: "LP-VAULT-1", percentage: 35 },
      { address: "ROUTER-9", percentage: 30 },
      { address: "BURN-WALLET", percentage: 18 },
      { address: "A", percentage: 7 },
      { address: "B", percentage: 5 },
      { address: "C", percentage: 4 },
      { address: "D", percentage: 1 },
    ],
    totalSupply: 100,
    liquidityUsd: 600_000,
  });

  assert.equal(result.excludedLikelyInfrastructure, 3);
  assert.equal(result.top10Concentration, 17);
  assert.ok(result.riskLevel === "low");
});

test("insufficient data stays conservative and explicit", () => {
  const result = analyzeHolderDistributionRisk({
    holders: [],
    totalSupply: 0,
    liquidityUsd: null,
  });

  assert.equal(result.dataCompleteness, "unknown");
  assert.ok(result.reasons.some((reason) => reason.toLowerCase().includes("insufficient")));
  assert.ok(result.riskLevel === "medium");
});

test("failed upstream intelligence cannot fabricate synthetic low-risk values", () => {
  const result = analyzeTokenRisk({
    holderRisk: null,
    earlyBuyers: null,
    coordinatedWallets: null,
    marketData: { liquidityUsd: 12_000 },
  });

  assert.notEqual(result.riskScore, 29.75);
  assert.ok(result.riskScore >= 50);
  assert.notEqual(result.severity, "low");
  assert.equal(result.dataCompleteness, "unknown");
  assert.equal(result.componentScores.holderConcentration.score, null);
  assert.equal(result.componentScores.earlyBuyers.score, null);
  assert.equal(result.componentScores.coordinatedWallets.score, null);
  assert.ok(result.reasons.some((reason) => reason.toLowerCase().includes("insufficient") || reason.toLowerCase().includes("unavailable")));
  assert.ok(result.warnings.some((warning) => warning.toLowerCase().includes("missing") || warning.toLowerCase().includes("insufficient")));
});

test("low-risk token stays low when concentration, buyers, and liquidity are healthy", () => {
  const result = analyzeTokenRisk({
    holderRisk: { riskScore: 12, reasons: ["Top holders are diversified."], dataCompleteness: "complete" },
    earlyBuyers: { buyers: [{ status: "sold", dataCompleteness: "complete", totalBought: 100, totalSold: 100, currentBalance: 0, remainingPercent: 0 }] },
    coordinatedWallets: { clusters: [] },
    marketData: { liquidityUsd: 750_000 },
  });

  assert.ok(result.riskScore >= 0 && result.riskScore <= 100);
  assert.notEqual(result.componentScores.holderConcentration.score, null);
  assert.notEqual(result.componentScores.earlyBuyers.score, null);
  assert.notEqual(result.componentScores.liquidity.score, null);
  assert.ok(result.reasons.some((reason) => reason.toLowerCase().includes("holders") || reason.toLowerCase().includes("top")));
});

test("concentrated holders push the unified score high", () => {
  const result = analyzeTokenRisk({
    holderRisk: { riskScore: 85, reasons: ["Top 10 holders control 74% of supply."], dataCompleteness: "complete" },
    earlyBuyers: { buyers: [{ status: "holding", dataCompleteness: "complete", totalBought: 100, totalSold: 20, currentBalance: 80, remainingPercent: 80 }] },
    coordinatedWallets: { clusters: [] },
    marketData: { liquidityUsd: 90_000 },
  });

  assert.ok(result.riskScore >= 60);
  assert.ok(["high", "critical"].includes(result.severity));
});

test("coordinated wallets increase the risk score only when there is supporting evidence", () => {
  const result = analyzeTokenRisk({
    holderRisk: { riskScore: 35, reasons: ["Distribution is mostly balanced."], dataCompleteness: "partial" },
    earlyBuyers: { buyers: [{ status: "holding", dataCompleteness: "complete", totalBought: 200, totalSold: 25, currentBalance: 150, remainingPercent: 75 }] },
    coordinatedWallets: { clusters: [{ confidence: 0.82, reasons: ["Same funding source and synchronized buys."], signals: [{ type: "funding-source", strength: 1, summary: "Shared funding source detected." }, { type: "temporal", strength: 0.8, summary: "Buy windows were close together." }] }] },
    marketData: { liquidityUsd: 125_000 },
  });

  assert.ok(result.riskScore >= 40);
  assert.ok(result.reasons.some((reason) => reason.toLowerCase().includes("funding source") || reason.toLowerCase().includes("synchronized") || reason.toLowerCase().includes("same funding")));
});

test("incomplete buyer history remains conservative instead of low risk", () => {
  const result = analyzeTokenRisk({
    holderRisk: { riskScore: 18, reasons: ["Distribution looks healthy."], dataCompleteness: "complete" },
    earlyBuyers: { buyers: [{ status: "unknown", dataCompleteness: "unknown", totalBought: 0, totalSold: 25, currentBalance: 0, remainingPercent: 0 }] },
    coordinatedWallets: { clusters: [] },
    marketData: { liquidityUsd: 1_000_000 },
  });

  assert.ok(result.dataCompleteness === "unknown" || result.dataCompleteness === "partial");
  assert.ok(result.warnings.length > 0 || result.reasons.some((reason) => reason.toLowerCase().includes("incomplete") || reason.toLowerCase().includes("missing")));
  assert.ok(result.riskScore >= 20);
});

test("conflicting low- and high-signal inputs are merged conservatively without double-counting", () => {
  const result = analyzeTokenRisk({
    holderRisk: { riskScore: 20, reasons: ["Diversified holders."], dataCompleteness: "complete" },
    earlyBuyers: { buyers: [{ status: "unknown", dataCompleteness: "partial", totalBought: 10, totalSold: 15, currentBalance: 5, remainingPercent: 50 }] },
    coordinatedWallets: { clusters: [{ confidence: 0.6, reasons: ["Temporal co-occurrence."], signals: [{ type: "temporal", strength: 0.6, summary: "Timed within a short window." }, { type: "same-tx", strength: 0.4, summary: "Appeared in the same signature." }] }] },
    marketData: { liquidityUsd: 600_000 },
  });

  assert.ok(result.riskScore >= 20 && result.riskScore <= 60);
  assert.ok(result.reasons.length > 0);
  assert.ok(result.warnings.length > 0 || result.dataCompleteness !== "complete");
});
