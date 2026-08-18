import assert from "node:assert/strict";
import test from "node:test";

import { computeRemainingPercent, summarizeBuyerPosition } from "./solana-intel";

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
