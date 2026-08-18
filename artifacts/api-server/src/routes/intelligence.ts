import { Router, type IRouter } from "express";
import {
  GetTokenEarlyBuyersParams,
  GetTokenEarlyBuyersResponse,
  GetTokenHolderRiskParams,
  GetTokenHolderRiskResponse,
  GetTokenHoldersParams,
  GetTokenHoldersResponse,
  GetTokenParams,
  GetTokenResponse,
  GetTokenRiskParams,
  GetTokenRiskResponse,
  GetWalletProfileParams,
  GetWalletProfileResponse,
  SearchTokensQueryParams,
  SearchTokensResponse,
} from "@workspace/api-zod";
import {
  getCoordinatedWallets,
  getDexToken,
  getEarlyBuyers,
  getHolders,
  getHolderDistributionRisk,
  getTokenRisk,
  getWalletProfile,
  logUpstreamError,
  searchDexTokens,
} from "../lib/solana-intel";

const router: IRouter = Router();

router.get("/tokens/search", async (req, res): Promise<void> => {
  const parsed = SearchTokensQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter a token name, symbol, or mint address." });
    return;
  }

  try {
    const result = await searchDexTokens(parsed.data.q);
    res.json(SearchTokensResponse.parse(result));
  } catch (error) {
    logUpstreamError(req, error);
    res.status(502).json({ error: "DexScreener is unavailable right now. Try again in a moment." });
  }
});

router.get("/tokens/:mint", async (req, res): Promise<void> => {
  const parsed = GetTokenParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "That does not look like a valid Solana mint address." });
    return;
  }

  try {
    const result = await getDexToken(parsed.data.mint);
    if (!result) {
      res.status(404).json({ error: "We could not find a Solana market for that mint." });
      return;
    }
    res.json(GetTokenResponse.parse(result));
  } catch (error) {
    logUpstreamError(req, error);
    res.status(502).json({ error: "Market data is unavailable right now. Try again in a moment." });
  }
});

router.get("/tokens/:mint/holders", async (req, res): Promise<void> => {
  const parsed = GetTokenHoldersParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "That does not look like a valid Solana mint address." });
    return;
  }

  try {
    res.json(GetTokenHoldersResponse.parse(await getHolders(parsed.data.mint)));
  } catch (error) {
    logUpstreamError(req, error);
    res.status(502).json({ error: "Holder data is unavailable right now. Try again in a moment." });
  }
});

router.get("/tokens/:mint/buyers", async (req, res): Promise<void> => {
  const parsed = GetTokenEarlyBuyersParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "That does not look like a valid Solana mint address." });
    return;
  }

  try {
    res.json(GetTokenEarlyBuyersResponse.parse(await getEarlyBuyers(parsed.data.mint)));
  } catch (error) {
    logUpstreamError(req, error);
    res.status(502).json({ error: "Early buyer data is unavailable right now. Try again in a moment." });
  }
});

router.get("/tokens/:mint/holder-risk", async (req, res): Promise<void> => {
  const parsed = GetTokenHolderRiskParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "That does not look like a valid Solana mint address." });
    return;
  }

  try {
    res.json(GetTokenHolderRiskResponse.parse(await getHolderDistributionRisk(parsed.data.mint)));
  } catch (error) {
    logUpstreamError(req, error);
    res.status(502).json({ error: "Holder risk data is unavailable right now. Try again in a moment." });
  }
});

router.get("/tokens/:mint/coordinated-wallets", async (req, res): Promise<void> => {
  const parsed = GetTokenHoldersParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "That does not look like a valid Solana mint address." });
    return;
  }

  try {
    res.json(await getCoordinatedWallets(parsed.data.mint));
  } catch (error) {
    logUpstreamError(req, error);
    res.status(502).json({ error: "Coordinated wallet intelligence is unavailable right now. Try again in a moment." });
  }
});

router.get("/tokens/:mint/risk", async (req, res): Promise<void> => {
  const parsed = GetTokenRiskParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "That does not look like a valid Solana mint address." });
    return;
  }

  try {
    res.json(GetTokenRiskResponse.parse(await getTokenRisk(parsed.data.mint)));
  } catch (error) {
    logUpstreamError(req, error);
    res.status(502).json({ error: "Token risk data is unavailable right now. Try again in a moment." });
  }
});

router.get("/wallets/:address", async (req, res): Promise<void> => {
  const parsed = GetWalletProfileParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "That does not look like a valid Solana wallet address." });
    return;
  }

  try {
    res.json(GetWalletProfileResponse.parse(await getWalletProfile(parsed.data.address)));
  } catch (error) {
    logUpstreamError(req, error);
    res.status(502).json({ error: "Wallet data is unavailable right now. Try again in a moment." });
  }
});

export default router;