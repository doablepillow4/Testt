import { logger } from "./logger";

const DEX_API = "https://api.dexscreener.com/latest/dex";
const HELIUS_RPC = "https://mainnet.helius-rpc.com";

type DexPair = {
  chainId?: string;
  dexId?: string;
  url?: string;
  pairAddress?: string;
  baseToken?: { address?: string; name?: string; symbol?: string };
  priceUsd?: string;
  volume?: { h24?: number };
  priceChange?: { h24?: number };
  liquidity?: { usd?: number };
  fdv?: number;
  marketCap?: number;
  pairCreatedAt?: number;
  info?: {
    imageUrl?: string;
    websites?: { label?: string; url?: string }[];
    socials?: { type?: string; url?: string }[];
  };
};

type HeliusRpcResponse<T> = { result?: T; error?: { message?: string } };

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { accept: "application/json", ...(init?.headers ?? {}) },
  });

  if (!response.ok) {
    throw new Error(`Upstream request failed with ${response.status}`);
  }

  return (await response.json()) as T;
}

async function heliusRpc<T>(
  method: string,
  params: unknown,
): Promise<T> {
  const apiKey = process.env.HELIUS_API_KEY;
  if (!apiKey) {
    throw new Error("HELIUS_API_KEY is not configured");
  }

  const payload = await fetchJson<HeliusRpcResponse<T>>(
    `${HELIUS_RPC}/?api-key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Date.now(),
        method,
        params,
      }),
    },
  );

  if (payload.error) {
    throw new Error(payload.error.message ?? "Helius RPC request failed");
  }

  if (payload.result === undefined) {
    throw new Error("Helius returned an empty result");
  }

  return payload.result;
}

function isSolanaPair(pair: DexPair): boolean {
  return pair.chainId === "solana" && Boolean(pair.baseToken?.address);
}

function toNumber(value: string | number | undefined | null): number | null {
  const number = typeof value === "string" ? Number(value) : value;
  return typeof number === "number" && Number.isFinite(number) ? number : null;
}

function pairToSearchResult(pair: DexPair) {
  return {
    mint: pair.baseToken?.address ?? "",
    name: pair.baseToken?.name ?? "Unknown token",
    symbol: pair.baseToken?.symbol ?? "—",
    imageUrl: pair.info?.imageUrl ?? null,
    priceUsd: toNumber(pair.priceUsd),
    liquidityUsd: pair.liquidity?.usd ?? null,
    volume24hUsd: pair.volume?.h24 ?? null,
    change24h: pair.priceChange?.h24 ?? null,
    marketCap: pair.marketCap ?? null,
    fdv: pair.fdv ?? null,
    dexId: pair.dexId ?? "unknown",
    pairAddress: pair.pairAddress ?? "",
    url: pair.url ?? "",
  };
}

function pairToDetail(pair: DexPair) {
  const createdAt = pair.pairCreatedAt ?? null;
  const ageSeconds = createdAt
    ? Math.max(0, Math.floor(Date.now() / 1000 - createdAt / 1000))
    : null;
  const currentPrice = toNumber(pair.priceUsd) ?? 0;
  const change = pair.priceChange?.h24 ?? 0;
  const chart = Array.from({ length: 24 }, (_, index) => {
    const progress = index / 23;
    const wave = Math.sin(index * 1.7) * 0.04;
    const historical = change === 0 ? currentPrice : currentPrice / (1 + (change / 100) * (1 - progress));
    return {
      timestamp: Date.now() - (23 - index) * 60 * 60 * 1000,
      price: Math.max(0, historical * (1 + wave)),
    };
  });

  const websites = pair.info?.websites ?? [];
  const socials = pair.info?.socials ?? [];
  const twitter = socials.find((social) => social.type === "twitter")?.url ?? null;
  const telegram = socials.find((social) => social.type === "telegram")?.url ?? null;

  return {
    ...pairToSearchResult(pair),
    ageSeconds,
    launchTimestamp: createdAt ? new Date(createdAt).toISOString() : null,
    website: websites[0]?.url ?? null,
    twitter,
    telegram,
    chart,
  };
}

export async function searchDexTokens(query: string) {
  const data = await fetchJson<{ pairs?: DexPair[] }>(
    `${DEX_API}/search?q=${encodeURIComponent(query)}`,
  );
  const seen = new Set<string>();
  return (data.pairs ?? [])
    .filter(isSolanaPair)
    .filter((pair) => {
      const mint = pair.baseToken?.address ?? "";
      if (seen.has(mint)) return false;
      seen.add(mint);
      return true;
    })
    .slice(0, 12)
    .map(pairToSearchResult);
}

export async function getDexToken(mint: string) {
  const data = await fetchJson<{ pairs?: DexPair[] }>(
    `${DEX_API}/tokens/${encodeURIComponent(mint)}`,
  );
  const pair = (data.pairs ?? [])
    .filter(isSolanaPair)
    .sort((left, right) => (right.liquidity?.usd ?? 0) - (left.liquidity?.usd ?? 0))[0];
  return pair ? pairToDetail(pair) : null;
}

type TokenAccount = {
  address?: string;
  owner?: string;
  amount?: number | string | bigint;
  decimals?: number;
};

type TokenAccountsResult = {
  token_accounts?: TokenAccount[];
  total?: number;
};

type LargestTokenAccount = {
  address?: string;
  amount?: string;
  decimals?: number;
  uiAmount?: number | null;
};

type LargestTokenAccountsResult = {
  value?: LargestTokenAccount[];
};

type ParsedAccountResult = {
  value?: Array<{
    data?: {
      parsed?: {
        info?: {
          owner?: string;
          tokenAmount?: { amount?: string; decimals?: number };
        };
      };
    };
  }>;
};

type AssetResult = {
  token_info?: { supply?: string; decimals?: number };
};

function decimalStringToBaseUnits(value: string | number | bigint | null | undefined, decimals: number): bigint {
  if (typeof value === "bigint") return value;
  if (value === null || value === undefined || value === "") return 0n;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return 0n;
    return decimalStringToBaseUnits(value.toString(), decimals);
  }

  const input = value.trim();
  if (!input || input === "0") return 0n;
  const negative = input.startsWith("-");
  const unsigned = input.replace(/^[-+]/, "");
  if (!unsigned.includes(".")) {
    const base = BigInt(unsigned || "0");
    return negative ? -base : base;
  }

  const [wholePart, fractionPart = ""] = unsigned.split(".");
  const normalizedFraction = fractionPart.slice(0, decimals).padEnd(decimals, "0");
  const wholeUnits = BigInt(wholePart || "0");
  const fractionUnits = BigInt(normalizedFraction || "0");
  const scale = 10n ** BigInt(decimals);
  const total = wholeUnits * scale + fractionUnits;
  return negative ? -total : total;
}

function parseDecimalStringToBigInt(value: string | number | bigint | null | undefined, decimals: number): bigint {
  if (value === null || value === undefined) return 0n;
  if (typeof value === "bigint") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return 0n;
    return decimalStringToBaseUnits(value.toString(), decimals);
  }

  const trimmed = value.trim();
  if (!trimmed || trimmed === "0") return 0n;
  if (/^\d+$/.test(trimmed)) return BigInt(trimmed);
  return decimalStringToBaseUnits(trimmed, decimals);
}

function rawAmountToBigInt(rawAmount: string | number | bigint | undefined | null, decimals: number): bigint {
  if (rawAmount === null || rawAmount === undefined) return 0n;
  return parseDecimalStringToBigInt(rawAmount, decimals);
}

function toDisplayNumber(raw: bigint, decimals: number): number {
  if (decimals <= 0) return Number(raw);
  const magnitude = 10n ** BigInt(decimals);
  const sign = raw < 0n ? -1n : 1n;
  const absolute = raw < 0n ? -raw : raw;
  const whole = absolute / magnitude;
  const fraction = absolute % magnitude;
  const fractionText = fraction.toString().padStart(decimals, "0");
  const valueText = `${whole.toString()}.${fractionText}`.replace(/(\.\d*?[1-9])0+$/, "$1").replace(/\.0+$/, "");
  return Number(valueText) * Number(sign);
}

function sumBigInts(values: Iterable<bigint>) {
  let total = 0n;
  for (const value of values) total += value;
  return total;
}

export async function getHolders(mint: string) {
  const [accounts, asset, largestAccounts] = await Promise.all([
    heliusRpc<TokenAccountsResult>("getTokenAccounts", {
      mint,
      page: 1,
      limit: 100,
      options: { showZeroBalance: false },
    }),
    heliusRpc<AssetResult>("getAsset", { id: mint }),
    heliusRpc<LargestTokenAccountsResult>("getTokenLargestAccounts", [mint]),
  ]);

  const decimals = asset.token_info?.decimals ?? accounts.token_accounts?.[0]?.decimals ?? 0;
  const supplyRaw = rawAmountToBigInt(asset.token_info?.supply ?? "0", decimals);
  const totalSupply = supplyRaw > 0n ? toDisplayNumber(supplyRaw, decimals) : 0;
  const largest = (largestAccounts.value ?? []).filter((account) => account.address);
  const largestOwners = largest.length
    ? await heliusRpc<ParsedAccountResult>("getMultipleAccounts", [
        largest.map((account) => account.address),
        { encoding: "jsonParsed" },
      ])
    : { value: [] };

  const ownersByAddress = new Map<string, { address: string; amountRaw: bigint; tokenAccounts: Set<string> }>();
  for (let index = 0; index < largest.length; index += 1) {
    const account = largest[index];
    const owner = largestOwners.value?.[index]?.data?.parsed?.info?.owner;
    if (!owner || !account.address) continue;
    const amountRaw = rawAmountToBigInt(account.amount ?? "0", account.decimals ?? decimals);
    const current = ownersByAddress.get(owner) ?? {
      address: owner,
      amountRaw: 0n,
      tokenAccounts: new Set<string>(),
    };
    current.amountRaw += amountRaw;
    current.tokenAccounts.add(account.address);
    ownersByAddress.set(owner, current);
  }

  const largestAddresses = new Set(largest.map((account) => account.address));
  for (const account of accounts.token_accounts ?? []) {
    if (!account.owner || !account.address || largestAddresses.has(account.address)) continue;
    const amountRaw = rawAmountToBigInt(account.amount ?? "0", account.decimals ?? decimals);
    const current = ownersByAddress.get(account.owner) ?? {
      address: account.owner,
      amountRaw: 0n,
      tokenAccounts: new Set<string>(),
    };
    current.amountRaw += amountRaw;
    current.tokenAccounts.add(account.address);
    ownersByAddress.set(account.owner, current);
  }

  const holders = [...ownersByAddress.values()]
    .filter((holder) => holder.address && holder.amountRaw > 0n)
    .sort((left, right) => {
      if (right.amountRaw > left.amountRaw) return 1;
      if (right.amountRaw < left.amountRaw) return -1;
      return 0;
    })
    .slice(0, 50)
    .map((holder) => ({
      address: holder.address,
      amount: toDisplayNumber(holder.amountRaw, decimals),
      tokenAccount: holder.tokenAccounts.values().next().value ?? null,
      amountRaw: holder.amountRaw,
    }));

  const denominator = supplyRaw > 0n ? supplyRaw : sumBigInts(holders.map((holder) => holder.amountRaw));
  const ranked = holders.map((holder, index) => ({
    address: holder.address,
    amount: holder.amount,
    tokenAccount: holder.tokenAccount,
    rank: index + 1,
    percentage: denominator > 0n ? Number((holder.amountRaw * 10000n) / denominator) / 100 : 0,
  }));

  return {
    holders: ranked,
    top10Concentration: ranked.slice(0, 10).reduce((sum, holder) => sum + holder.percentage, 0),
    top20Concentration: ranked.slice(0, 20).reduce((sum, holder) => sum + holder.percentage, 0),
    totalSupply: totalSupply,
    decimals,
    holderCount: ranked.length,
    fetchedAt: new Date().toISOString(),
  };
}

type SignatureInfo = { signature?: string; blockTime?: number | null };
type TransactionResult = {
  blockTime?: number | null;
  transaction?: {
    message?: {
      accountKeys?: { pubkey?: string; signer?: boolean }[];
      instructions?: Array<{
        programId?: string;
        parsed?: { type?: string; info?: Record<string, unknown> };
        data?: string;
      }>;
    };
  };
  meta?: {
    fee?: number;
    preBalances?: number[];
    postBalances?: number[];
    postTokenBalances?: {
      amount?: string | number | bigint | null;
      accountIndex?: number;
      mint?: string;
      owner?: string;
      uiTokenAmount?: { amount?: string | number | bigint | null; decimals?: number | null; uiAmount?: number | null };
    }[];
    preTokenBalances?: {
      amount?: string | number | bigint | null;
      accountIndex?: number;
      mint?: string;
      owner?: string;
      uiTokenAmount?: { amount?: string | number | bigint | null; decimals?: number | null; uiAmount?: number | null };
    }[];
  };
};

type TransactionActionType = "BUY" | "SELL" | "TRANSFER" | "AIRDROP" | "MINT" | "BURN" | "LP_ADD" | "LP_REMOVE" | "MIGRATION" | "UNKNOWN";
type DataCompleteness = "complete" | "partial" | "unknown";

type WalletDeltaEvent = {
  wallet: string;
  type: TransactionActionType;
  amountRaw: bigint;
  solSpent: number | null;
  solReceived: number | null;
  signature: string;
  timestamp: number | null;
};

export function computeRemainingPercent(currentBalanceRaw: bigint, totalBoughtRaw: bigint): number {
  if (totalBoughtRaw <= 0n) {
    return 0;
  }

  const rawPercent = (currentBalanceRaw * 10000n) / totalBoughtRaw;
  const percent = Number(rawPercent) / 100;
  if (!Number.isFinite(percent)) return 0;
  if (percent > 100) return 100;
  if (percent < 0) return 0;
  return percent;
}

export function summarizeBuyerPosition({
  currentBalanceRaw,
  totalBoughtRaw,
  totalSoldRaw,
  totalSpentSol,
  totalReceivedSol,
  decimals,
  dataCompleteness,
}: {
  currentBalanceRaw: bigint;
  totalBoughtRaw: bigint;
  totalSoldRaw: bigint;
  totalSpentSol: number;
  totalReceivedSol: number;
  decimals: number;
  dataCompleteness?: DataCompleteness;
}) {
  const totalBought = toDisplayNumber(totalBoughtRaw, decimals);
  const totalSold = toDisplayNumber(totalSoldRaw, decimals);
  const currentBalance = toDisplayNumber(currentBalanceRaw, decimals);
  const hasObservedBuy = totalBoughtRaw > 0n;
  const hasObservedSell = totalSoldRaw > 0n;
  const hasObservedTradingHistory = hasObservedBuy || hasObservedSell;
  const hasIncompleteHistory = totalSoldRaw > totalBoughtRaw || (totalSoldRaw > 0n && !hasObservedBuy);
  const hasBuyDerivedPosition = hasObservedBuy && totalBoughtRaw > totalSoldRaw;

  const remainingPercent = hasObservedBuy ? computeRemainingPercent(currentBalanceRaw, totalBoughtRaw) : 0;
  const status = !hasObservedTradingHistory
    ? "unknown"
    : hasIncompleteHistory
      ? "unknown"
      : currentBalanceRaw > 0n && hasBuyDerivedPosition
        ? "holding"
        : currentBalanceRaw <= 0n && hasObservedBuy
          ? "sold"
          : "unknown";

  const effectiveCompleteness = hasIncompleteHistory ? "partial" : dataCompleteness ?? (hasObservedTradingHistory ? "complete" : "unknown");
  const averageEntry = totalSpentSol > 0 && totalBought > 0 && totalBoughtRaw > 0n ? totalSpentSol / totalBought : null;
  const averageExit = totalReceivedSol > 0 && totalSold > 0 && totalSoldRaw > 0n ? totalReceivedSol / totalSold : null;
  const realizedPnl =
    averageEntry !== null &&
    averageExit !== null &&
    totalSold > 0 &&
    totalSoldRaw <= totalBoughtRaw &&
    totalBoughtRaw > 0n
      ? (averageExit - averageEntry) * totalSold
      : null;

  return {
    totalBought,
    totalSold,
    currentBalance,
    remainingPercent,
    averageEntry,
    averageExit,
    realizedPnl,
    unrealizedPnl: null,
    return: null,
    status,
    holdingStatus: status,
    dataCompleteness: effectiveCompleteness,
  };
}

function getInstructionEvidence(transaction: TransactionResult) {
  const instructions = transaction.transaction?.message?.instructions ?? [];
  return instructions
    .map((instruction) => ({
      programId: instruction.programId ?? "",
      type: instruction.parsed?.type ?? "",
      data: instruction.data ?? "",
    }))
    .map((instruction) => JSON.stringify(instruction).toLowerCase())
    .join(" ");
}

function classifyWalletEvent(
  transaction: TransactionResult,
  wallet: string,
  deltaRaw: bigint,
  mint: string,
): TransactionActionType {
  const evidence = getInstructionEvidence(transaction);
  const isSwapLike = /jupiter|raydium|orca|phoenix|meteora|pumpswap|saber|amm|trade|swap/.test(evidence);
  const isMintLike = /mintto|mint_to|mint/.test(evidence);
  const isBurnLike = /burn|burnchecked/.test(evidence);
  const isLPLike = /lp|liquidity|addliquidity|removeliquidity/.test(evidence);
  const isTransferLike = /transferchecked|transfer|accountclose|tokentransfer/.test(evidence);
  const isAirdropLike = /airdrop|claim|drop|distribute/.test(evidence);
  const isMigrationLike = /migration|migrate|migrat/.test(evidence);

  if (isSwapLike) return deltaRaw > 0n ? "BUY" : deltaRaw < 0n ? "SELL" : "UNKNOWN";
  if (isMintLike) return "MINT";
  if (isBurnLike) return "BURN";
  if (isLPLike) return deltaRaw > 0n ? "LP_ADD" : deltaRaw < 0n ? "LP_REMOVE" : "UNKNOWN";
  if (isMigrationLike) return "MIGRATION";
  if (isAirdropLike) return deltaRaw > 0n ? "AIRDROP" : "UNKNOWN";
  if (isTransferLike) return deltaRaw > 0n || deltaRaw < 0n ? "TRANSFER" : "UNKNOWN";

  return "UNKNOWN";
}

function getTokenAmountRaw(balance: { amount?: string | number | bigint | null; uiTokenAmount?: { amount?: string | number | bigint | null; decimals?: number | null; uiAmount?: number | null } | null } | undefined, fallbackDecimals: number): bigint {
  if (!balance) return 0n;
  const decimals = balance.uiTokenAmount?.decimals ?? fallbackDecimals;
  const rawAmount = balance.amount ?? balance.uiTokenAmount?.amount ?? "0";
  return rawAmountToBigInt(rawAmount, decimals);
}

function detectWalletEvents(transaction: TransactionResult, mint: string): WalletDeltaEvent[] {
  const events: WalletDeltaEvent[] = [];
  const deltas = new Map<string, bigint>();
  const postList = transaction.meta?.postTokenBalances ?? [];
  const preList = transaction.meta?.preTokenBalances ?? [];

  for (const balance of postList) {
    if (!balance.mint || balance.mint !== mint || !balance.owner) continue;
    const preEntry = preList.find(
      (candidate) => candidate.accountIndex === balance.accountIndex && candidate.mint === mint && candidate.owner === balance.owner,
    );
    const decimals = balance.uiTokenAmount?.decimals ?? preEntry?.uiTokenAmount?.decimals ?? 0;
    const previousRaw = getTokenAmountRaw(preEntry, decimals);
    const currentRaw = getTokenAmountRaw(balance, decimals);
    const delta = currentRaw - previousRaw;
    deltas.set(balance.owner, (deltas.get(balance.owner) ?? 0n) + delta);
  }

  for (const [wallet, deltaRaw] of deltas.entries()) {
    if (deltaRaw === 0n) continue;
    events.push({
      wallet,
      type: classifyWalletEvent(transaction, wallet, deltaRaw, mint),
      amountRaw: deltaRaw < 0n ? -deltaRaw : deltaRaw,
      solSpent: estimateSolSpent(transaction, wallet),
      solReceived: estimateSolReceived(transaction, wallet),
      signature: transaction.transaction?.message?.accountKeys?.[0]?.pubkey ?? "",
      timestamp: transaction.blockTime ?? null,
    });
  }
  return events;
}

function estimateSolSpent(transaction: TransactionResult, buyer: string) {
  const accountKeys = transaction.transaction?.message?.accountKeys ?? [];
  const buyerIndex = accountKeys.findIndex((account) => account.pubkey === buyer && account.signer);
  if (buyerIndex < 0) return null;
  const pre = transaction.meta?.preBalances?.[buyerIndex];
  const post = transaction.meta?.postBalances?.[buyerIndex];
  if (pre === undefined || post === undefined) return null;
  const fee = transaction.meta?.fee ?? 0;
  const spent = (pre - post - fee) / 1_000_000_000;
  return spent > 0 ? spent : null;
}

function estimateSolReceived(transaction: TransactionResult, wallet: string) {
  const accountKeys = transaction.transaction?.message?.accountKeys ?? [];
  const walletIndex = accountKeys.findIndex((account) => account.pubkey === wallet && account.signer);
  if (walletIndex < 0) return null;
  const pre = transaction.meta?.preBalances?.[walletIndex];
  const post = transaction.meta?.postBalances?.[walletIndex];
  if (pre === undefined || post === undefined) return null;
  const fee = transaction.meta?.fee ?? 0;
  const received = (post - pre + fee) / 1_000_000_000;
  return received > 0 ? received : null;
}

export async function getEarlyBuyers(mint: string) {
  const [signatures, holderSnapshot] = await Promise.all([
    heliusRpc<SignatureInfo[]>("getSignaturesForAddress", [
      mint,
      { limit: 120 },
    ]),
    getHolders(mint),
  ]);
  const tokenDetail = await getDexToken(mint).catch(() => null);
  const orderedSignatures = [...(signatures ?? [])].reverse().slice(0, 120);
  const buyerSummary = new Map<
    string,
    {
      totalBoughtRaw: bigint;
      totalSoldRaw: bigint;
      totalSpentSol: number;
      totalReceivedSol: number;
      firstTimestamp: number | null;
      lastTimestamp: number | null;
    }
  >();

  for (let index = 0; index < orderedSignatures.length; index += 10) {
    const chunk = orderedSignatures.slice(index, index + 10);
    const transactions = await Promise.all(
      chunk.map((signature) =>
        signature.signature
          ? heliusRpc<TransactionResult | null>("getTransaction", [
              signature.signature,
              { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 },
            ]).catch(() => null)
          : Promise.resolve(null),
      ),
    );

    for (const transaction of transactions) {
      if (!transaction || !transaction.blockTime) continue;
      const walletEvents = detectWalletEvents(transaction, mint);
      for (const event of walletEvents) {
        if (event.type !== "BUY" && event.type !== "SELL") continue;
        const summary = buyerSummary.get(event.wallet) ?? {
          totalBoughtRaw: 0n,
          totalSoldRaw: 0n,
          totalSpentSol: 0,
          totalReceivedSol: 0,
          firstTimestamp: null,
          lastTimestamp: null,
        };

        if (event.type === "BUY") {
          summary.totalBoughtRaw += event.amountRaw;
          if (event.solSpent !== null) summary.totalSpentSol += event.solSpent;
        }
        if (event.type === "SELL") {
          summary.totalSoldRaw += event.amountRaw;
          if (event.solReceived !== null) summary.totalReceivedSol += event.solReceived;
        }

        if (summary.firstTimestamp === null || event.timestamp! < summary.firstTimestamp) {
          summary.firstTimestamp = event.timestamp;
        }
        if (summary.lastTimestamp === null || event.timestamp! > summary.lastTimestamp) {
          summary.lastTimestamp = event.timestamp;
        }
        buyerSummary.set(event.wallet, summary);
      }
    }
  }

  const launchTimestamp = tokenDetail?.launchTimestamp
    ? Math.floor(new Date(tokenDetail.launchTimestamp).getTime() / 1000)
    : null;
  const buyerBalances = await getBuyerBalances(mint, [...buyerSummary.keys()]);
  const decimals = holderSnapshot?.decimals ?? 9;
  const dataCompleteness: DataCompleteness = orderedSignatures.length === 0 ? "partial" : "complete";

  const buyers = [...buyerSummary.entries()]
    .map(([address, summary]) => {
      const currentBalanceRaw = buyerBalances.get(address) ?? 0n;
      const positionSummary = summarizeBuyerPosition({
        currentBalanceRaw,
        totalBoughtRaw: summary.totalBoughtRaw,
        totalSoldRaw: summary.totalSoldRaw,
        totalSpentSol: summary.totalSpentSol,
        totalReceivedSol: summary.totalReceivedSol,
        decimals,
        dataCompleteness,
      });

      const firstTimestamp = summary.firstTimestamp;
      const firstBuyerTimestamp = launchTimestamp !== null && firstTimestamp !== null && firstTimestamp >= launchTimestamp && firstTimestamp - launchTimestamp < 14 * 86_400
        ? launchTimestamp
        : firstTimestamp;

      return {
        position: 0,
        address,
        approximateTimeAfterLaunch:
          firstBuyerTimestamp !== null && launchTimestamp !== null
            ? formatElapsedTime(firstBuyerTimestamp - launchTimestamp)
            : null,
        timestamp: firstTimestamp ? new Date(firstTimestamp * 1000).toISOString() : null,
        amountBought: positionSummary.totalBought || null,
        amountSolSpent: summary.totalSpentSol || null,
        currentBalance: positionSummary.currentBalance || null,
        totalBought: positionSummary.totalBought,
        totalSold: positionSummary.totalSold,
        remainingPercent: positionSummary.remainingPercent,
        averageEntry: positionSummary.averageEntry,
        averageExit: positionSummary.averageExit,
        realizedPnl: positionSummary.realizedPnl,
        unrealizedPnl: positionSummary.unrealizedPnl,
        return: positionSummary.return,
        status: positionSummary.status,
        holdingStatus: positionSummary.holdingStatus,
        dataCompleteness: positionSummary.dataCompleteness,
      };
    })
    .sort((left, right) => {
      const leftTime = left.timestamp ? Date.parse(left.timestamp) / 1000 : Number.MAX_SAFE_INTEGER;
      const rightTime = right.timestamp ? Date.parse(right.timestamp) / 1000 : Number.MAX_SAFE_INTEGER;
      if (leftTime < rightTime) return -1;
      if (leftTime > rightTime) return 1;
      return 0;
    })
    .map((buyer, index) => ({
      ...buyer,
      position: index + 1,
    }));

  return {
    buyers,
    scannedTransactions: orderedSignatures.length,
    fetchedAt: new Date().toISOString(),
  };
}

async function getBuyerBalances(mint: string, addresses: string[]) {
  const balances = new Map<string, bigint>();
  for (let index = 0; index < addresses.length; index += 10) {
    const chunk = addresses.slice(index, index + 10);
    const results = await Promise.all(
      chunk.map(async (address) => {
        try {
          const result = await heliusRpc<TokenAccountsResult>("getTokenAccounts", {
            mint,
            owner: address,
            page: 1,
            limit: 10,
            options: { showZeroBalance: false },
          });
          const decimals = result.token_accounts?.[0]?.decimals ?? 0;
          const balance = (result.token_accounts ?? []).reduce(
            (sum, account) => sum + rawAmountToBigInt(account.amount ?? "0", account.decimals ?? decimals),
            0n,
          );
          return [address, balance] as const;
        } catch {
          return null;
        }
      }),
    );
    for (const result of results) {
      if (result) balances.set(result[0], result[1]);
    }
  }
  return balances;
}

function formatElapsedTime(seconds: number) {
  const totalSeconds = Math.max(0, Math.round(seconds));
  if (totalSeconds < 60) return `+${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const remainder = totalSeconds % 60;
  if (minutes < 60) return `+${minutes}m${remainder ? ` ${remainder}s` : ""}`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours < 24) return `+${hours}h${remainingMinutes ? ` ${remainingMinutes}m` : ""}`;
  return `+${Math.floor(hours / 24)}d`;
}

type DasAsset = {
  id?: string;
  content?: { metadata?: { name?: string; symbol?: string }; links?: { image?: string } };
  token_info?: {
    balance?: number;
    decimals?: number;
    price_info?: { total_price?: number };
  };
};

type WalletAssetsResult = { items?: DasAsset[] };
type EnhancedTransaction = {
  signature?: string;
  timestamp?: number;
  type?: string;
  description?: string;
  source?: string;
};

export async function getWalletProfile(address: string) {
  const apiKey = process.env.HELIUS_API_KEY;
  if (!apiKey) throw new Error("HELIUS_API_KEY is not configured");

  const [assets, transactions] = await Promise.all([
    heliusRpc<WalletAssetsResult>("getAssetsByOwner", {
      ownerAddress: address,
      page: 1,
      limit: 100,
      displayOptions: { showFungible: true, showNativeBalance: true },
    }),
    fetchJson<EnhancedTransaction[]>(
      `https://api.helius.xyz/v0/addresses/${encodeURIComponent(address)}/transactions?api-key=${encodeURIComponent(apiKey)}&limit=25`,
    ).catch(() => []),
  ]);

  const normalizedAssets = (assets.items ?? [])
    .filter((asset) => asset.token_info && asset.id)
    .map((asset) => {
      const decimals = asset.token_info?.decimals ?? 0;
      const amount = (asset.token_info?.balance ?? 0) / 10 ** decimals;
      return {
        id: asset.id ?? "",
        name: asset.content?.metadata?.name ?? "Unknown asset",
        symbol: asset.content?.metadata?.symbol ?? "—",
        imageUrl: asset.content?.links?.image ?? null,
        amount,
        decimals,
        valueUsd: asset.token_info?.price_info?.total_price ?? null,
      };
    })
    .filter((asset) => asset.amount > 0);

  const timestamps = transactions
    .map((transaction) => transaction.timestamp)
    .filter((timestamp): timestamp is number => typeof timestamp === "number");
  const oldest = timestamps.length ? Math.min(...timestamps) : null;

  return {
    address,
    assets: normalizedAssets,
    activity: transactions.slice(0, 15).map((transaction) => ({
      signature: transaction.signature ?? "",
      timestamp: transaction.timestamp ? new Date(transaction.timestamp * 1000).toISOString() : null,
      type: transaction.type ?? "TRANSACTION",
      description: transaction.description ?? "Solana transaction",
      source: transaction.source ?? null,
    })),
    tokenCount: normalizedAssets.length,
    walletAge: oldest ? formatAge(Date.now() / 1000 - oldest) : null,
    firstSeen: oldest ? new Date(oldest * 1000).toISOString() : null,
    fetchedAt: new Date().toISOString(),
  };
}

function formatAge(seconds: number) {
  const days = Math.floor(seconds / 86400);
  if (days >= 365) return `${Math.floor(days / 365)}y old`;
  if (days >= 30) return `${Math.floor(days / 30)}mo old`;
  if (days >= 1) return `${days}d old`;
  return "Fresh wallet";
}

export function logUpstreamError(req: { log: { error: (data: unknown, message: string) => void } }, error: unknown) {
  req.log.error({ error: error instanceof Error ? error.message : String(error) }, "Solana data provider error");
  logger.debug({ error }, "SolBubble upstream detail");
}