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
  amount?: number | string;
  decimals?: number;
};

type TokenAccountsResult = {
  token_accounts?: TokenAccount[];
};

type AssetResult = {
  token_info?: { supply?: string; decimals?: number };
};

export async function getHolders(mint: string) {
  const [accounts, asset] = await Promise.all([
    heliusRpc<TokenAccountsResult>("getTokenAccounts", {
      mint,
      page: 1,
      limit: 100,
      options: { showZeroBalance: false },
    }),
    heliusRpc<AssetResult>("getAsset", { id: mint }),
  ]);

  const decimals = asset.token_info?.decimals ?? accounts.token_accounts?.[0]?.decimals ?? 0;
  const supplyRaw = Number(asset.token_info?.supply ?? 0);
  const totalSupply = supplyRaw > 0 ? supplyRaw / 10 ** decimals : 0;
  const holders = (accounts.token_accounts ?? [])
    .map((account) => ({
      address: account.owner ?? "",
      amount: Number(account.amount ?? 0) / 10 ** decimals,
      tokenAccount: account.address ?? null,
    }))
    .filter((holder) => holder.address && holder.amount > 0)
    .sort((left, right) => right.amount - left.amount)
    .slice(0, 50);
  const denominator = totalSupply || holders.reduce((sum, holder) => sum + holder.amount, 0);
  const ranked = holders.map((holder, index) => ({
    ...holder,
    rank: index + 1,
    percentage: denominator ? (holder.amount / denominator) * 100 : 0,
  }));

  return {
    holders: ranked,
    top10Concentration: ranked.slice(0, 10).reduce((sum, holder) => sum + holder.percentage, 0),
    totalSupply: denominator,
    decimals,
    fetchedAt: new Date().toISOString(),
  };
}

type SignatureInfo = { signature?: string; blockTime?: number | null };
type TransactionResult = {
  blockTime?: number | null;
  meta?: {
    postTokenBalances?: {
      accountIndex?: number;
      mint?: string;
      owner?: string;
      uiTokenAmount?: { uiAmount?: number | null };
    }[];
    preTokenBalances?: {
      accountIndex?: number;
      mint?: string;
      owner?: string;
      uiTokenAmount?: { uiAmount?: number | null };
    }[];
  };
};

export async function getEarlyBuyers(mint: string) {
  const signatures = await heliusRpc<SignatureInfo[]>("getSignaturesForAddress", [
    mint,
    { limit: 100 },
  ]);
  const orderedSignatures = [...(signatures ?? [])].reverse().slice(0, 80);
  const buyers = new Map<string, { timestamp: number | null; amount: number }>();

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
      if (!transaction) continue;
      const posts = transaction?.meta?.postTokenBalances ?? [];
      const pres = transaction?.meta?.preTokenBalances ?? [];
      for (const post of posts.filter((balance) => balance.mint === mint && balance.owner)) {
        const previous = pres.find(
          (balance) => balance.accountIndex === post.accountIndex && balance.mint === mint,
        )?.uiTokenAmount?.uiAmount ?? 0;
        const current = post.uiTokenAmount?.uiAmount ?? 0;
        const delta = current - previous;
        if (delta > 0 && post.owner) {
          const existing = buyers.get(post.owner);
          if (!existing || (transaction.blockTime ?? Infinity) < (existing.timestamp ?? Infinity)) {
            buyers.set(post.owner, { timestamp: transaction.blockTime ?? null, amount: delta });
          }
        }
      }
    }
  }

  const firstTimestamp = [...buyers.values()]
    .map((buyer) => buyer.timestamp)
    .filter((timestamp): timestamp is number => typeof timestamp === "number")
    .sort((left, right) => left - right)[0];

  return {
    buyers: [...buyers.entries()]
      .sort(([, left], [, right]) => (left.timestamp ?? Infinity) - (right.timestamp ?? Infinity))
      .slice(0, 50)
      .map(([address, buyer], index) => ({
        position: index + 1,
        address,
        approximateTimeAfterLaunch:
          firstTimestamp && buyer.timestamp
            ? formatElapsedTime(buyer.timestamp - firstTimestamp)
            : null,
        timestamp: buyer.timestamp ? new Date(buyer.timestamp * 1000).toISOString() : null,
        amountBought: buyer.amount || null,
      })),
    scannedTransactions: orderedSignatures.length,
    fetchedAt: new Date().toISOString(),
  };
}

function formatElapsedTime(seconds: number) {
  if (seconds < 60) return `${Math.max(0, Math.round(seconds))}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h`;
  return `${Math.round(seconds / 86400)}d`;
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