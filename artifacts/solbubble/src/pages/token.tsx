import { ArrowUpRight, Check, Copy, Globe, MessageCircle, Share2, Twitter, Users, WalletCards } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'wouter';
import { getGetTokenEarlyBuyersQueryKey, getGetTokenHoldersQueryKey, getGetTokenQueryKey, useGetToken, useGetTokenEarlyBuyers, useGetTokenHolders } from '@workspace/api-client-react';
import { AppShell, compactUsd, CopyButton, EmptyState, formatUsd, LoadingRows, percent, QueryError, SectionLabel, shortValue, TokenAvatar } from '@/components/app-shell';

function ageLabel(seconds: number | null | undefined) {
  if (seconds === null || seconds === undefined) return 'Age unavailable';
  if (seconds < 60) return `${seconds}s old`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m old`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h old`;
  return `${Math.floor(seconds / 86400)}d old`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function PulseChart({ points }: { points: { timestamp: number; price: number }[] }) {
  if (!points.length) return <EmptyState title="Pulse not available" detail="This pair has not returned enough price points for a useful shape yet." />;
  const values = points.map((point) => point.price);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const coordinates = points.map((point, index) => {
    const x = (index / Math.max(points.length - 1, 1)) * 100;
    const y = 92 - ((point.price - min) / range) * 72;
    return `${x},${y}`;
  }).join(' ');
  const area = `0,92 ${coordinates} 100,92`;
  return (
    <div className="relative h-[250px] w-full overflow-hidden rounded-xl border border-border/70 bg-background/40 p-3 sm:h-[310px]">
      <div className="pointer-events-none absolute inset-x-3 top-3 bottom-3 flex flex-col justify-between">
        {[0, 1, 2, 3].map((line) => <span key={line} className="border-t border-dashed border-border/50" />)}
      </div>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="relative h-full w-full">
        <defs><linearGradient id="pulse-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="hsl(166 96% 48% / .25)" /><stop offset="100%" stopColor="hsl(166 96% 48% / 0)" /></linearGradient></defs>
        <polygon points={area} fill="url(#pulse-fill)" />
        <polyline points={coordinates} fill="none" stroke="hsl(166 96% 48%)" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="absolute bottom-2 left-3 right-3 flex justify-between font-mono text-[9px] text-muted-foreground">
        <span>{new Date(points[0].timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        <span>{new Date(points[points.length - 1].timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
      </div>
    </div>
  );
}

function Stat({ label, value, tone = 'normal' }: { label: string; value: string; tone?: 'normal' | 'positive' | 'negative' }) {
  return <div className="rounded-xl border border-border bg-card/65 px-4 py-4"><p className="font-mono text-[9px] uppercase tracking-[.14em] text-muted-foreground">{label}</p><p className={`mt-2 font-mono text-[15px] font-medium ${tone === 'positive' ? 'text-primary' : tone === 'negative' ? 'text-destructive' : 'text-foreground'}`}>{value}</p></div>;
}

export default function TokenPage() {
  const { mint = '' } = useParams<{ mint: string }>();
  const tokenQuery = useGetToken(mint, { query: { enabled: Boolean(mint), queryKey: getGetTokenQueryKey(mint), staleTime: 30_000 } });
  const holdersQuery = useGetTokenHolders(mint, { query: { enabled: Boolean(mint), queryKey: getGetTokenHoldersQueryKey(mint), staleTime: 60_000 } });
  const buyersQuery = useGetTokenEarlyBuyers(mint, { query: { enabled: Boolean(mint), queryKey: getGetTokenEarlyBuyersQueryKey(mint), staleTime: 60_000 } });
  const [shared, setShared] = useState(false);
  const token = tokenQuery.data;
  const chart = useMemo(() => token?.chart ?? [], [token?.chart]);

  async function share() {
    if (navigator.share) await navigator.share({ title: token?.name ?? 'SolBubble token scan', url: window.location.href });
    else {
      await navigator.clipboard?.writeText(window.location.href);
      setShared(true);
      window.setTimeout(() => setShared(false), 1500);
    }
  }

  if (tokenQuery.isLoading) {
    return <AppShell><div className="mx-auto max-w-[1440px] px-4 py-12 sm:px-7"><div className="skeleton h-8 w-44 rounded" /><div className="mt-5 skeleton h-20 w-full rounded-2xl" /><div className="mt-8 grid gap-4 md:grid-cols-4"><div className="skeleton h-24 rounded-xl" /><div className="skeleton h-24 rounded-xl" /><div className="skeleton h-24 rounded-xl" /><div className="skeleton h-24 rounded-xl" /></div></div></AppShell>;
  }
  if (tokenQuery.isError || !token) {
    return <AppShell><div className="mx-auto max-w-[900px] px-4 py-20 sm:px-7"><QueryError onRetry={() => tokenQuery.refetch()} message="We could not resolve that mint. Check the address and try again." /></div></AppShell>;
  }

  const changeTone = (token.change24h ?? 0) >= 0 ? 'positive' : 'negative';
  return (
    <AppShell>
      <div className="mx-auto max-w-[1440px] px-4 py-8 sm:px-7 sm:py-12">
        <div className="mb-7 flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <TokenAvatar name={token.name} symbol={token.symbol} imageUrl={token.imageUrl} size="lg" />
            <div className="min-w-0">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <h1 className="truncate text-2xl font-extrabold tracking-[-.06em] text-foreground sm:text-3xl">{token.name}</h1>
                <span className="rounded-md border border-primary/25 bg-primary/10 px-2 py-1 font-mono text-[9px] uppercase tracking-[.14em] text-primary">{token.symbol}</span>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
                <span className="font-mono">{shortValue(token.mint)}</span>
                <CopyButton value={token.mint} />
                <span className="text-border">·</span><span className="uppercase">{token.dexId}</span>
                <span className="text-primary">● {ageLabel(token.ageSeconds)}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={share} data-testid="button-share-token" className="flex h-9 items-center gap-2 rounded-lg border border-border bg-secondary/60 px-3 text-[11px] font-bold text-secondary-foreground transition-colors hover:border-primary/50 hover:text-primary">
              {shared ? <Check className="h-3.5 w-3.5 text-primary" /> : <Share2 className="h-3.5 w-3.5" />} {shared ? 'Copied' : 'Share'}
            </button>
            <a href={token.url} target="_blank" rel="noreferrer" data-testid="link-dex-pair" className="flex h-9 items-center gap-2 rounded-lg bg-primary px-3 text-[11px] font-extrabold text-primary-foreground transition-transform hover:-translate-y-0.5">
              Open pair <ArrowUpRight className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Price USD" value={formatUsd(token.priceUsd, 6)} />
          <Stat label="24h change" value={percent(token.change24h)} tone={changeTone} />
          <Stat label="Market cap" value={compactUsd(token.marketCap)} />
          <Stat label="Liquidity" value={compactUsd(token.liquidityUsd)} />
        </div>

        <div className="mt-8 grid gap-7 lg:grid-cols-[minmax(0,1.5fr)_minmax(310px,.7fr)]">
          <section className="min-w-0">
            <div className="mb-4 flex items-center justify-between">
              <SectionLabel eyebrow="Market pulse" title="Price shape" detail="24 hours" />
              <span className={`mb-5 font-mono text-[11px] ${changeTone === 'positive' ? 'text-primary' : 'text-destructive'}`}>{percent(token.change24h)} today</span>
            </div>
            <PulseChart points={chart} />
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="24h volume" value={compactUsd(token.volume24hUsd)} />
              <Stat label="FDV" value={compactUsd(token.fdv)} />
              <Stat label="Pair" value={shortValue(token.pairAddress)} />
              <Stat label="Launched" value={formatDate(token.launchTimestamp)} />
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-card/60 p-5">
            <SectionLabel eyebrow="Token identity" title="Context" />
            <dl className="space-y-4">
              <div className="flex items-center justify-between gap-3"><dt className="text-xs text-muted-foreground">Mint</dt><dd className="flex items-center gap-2 font-mono text-[10px] text-foreground"><span>{shortValue(token.mint)}</span><CopyButton value={token.mint} /></dd></div>
              <div className="flex items-center justify-between gap-3"><dt className="text-xs text-muted-foreground">Pair address</dt><dd className="font-mono text-[10px] text-foreground">{shortValue(token.pairAddress)}</dd></div>
              <div className="flex items-center justify-between gap-3"><dt className="text-xs text-muted-foreground">Fully diluted value</dt><dd className="font-mono text-xs text-foreground">{compactUsd(token.fdv)}</dd></div>
              <div className="flex items-center justify-between gap-3"><dt className="text-xs text-muted-foreground">Launch date</dt><dd className="font-mono text-[10px] text-foreground">{formatDate(token.launchTimestamp)}</dd></div>
            </dl>
            <div className="mt-6 border-t border-border pt-4">
              <p className="mb-3 font-mono text-[9px] uppercase tracking-[.18em] text-muted-foreground">Project links</p>
              <div className="flex flex-wrap gap-2">
                {token.website && <a href={token.website} target="_blank" rel="noreferrer" data-testid="link-token-website" className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-2 text-[10px] font-semibold text-secondary-foreground hover:border-primary/50 hover:text-primary"><Globe className="h-3 w-3" /> Site</a>}
                {token.twitter && <a href={token.twitter} target="_blank" rel="noreferrer" data-testid="link-token-twitter" className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-2 text-[10px] font-semibold text-secondary-foreground hover:border-primary/50 hover:text-primary"><Twitter className="h-3 w-3" /> X / Twitter</a>}
                {token.telegram && <a href={token.telegram} target="_blank" rel="noreferrer" data-testid="link-token-telegram" className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-2 text-[10px] font-semibold text-secondary-foreground hover:border-primary/50 hover:text-primary"><MessageCircle className="h-3 w-3" /> Telegram</a>}
                {!token.website && !token.twitter && !token.telegram && <span className="text-xs text-muted-foreground">No verified links returned.</span>}
              </div>
            </div>
          </section>
        </div>

        <div className="mt-12 grid gap-7 lg:grid-cols-[minmax(0,1.12fr)_minmax(0,.88fr)]">
          <section>
            <SectionLabel eyebrow="Supply map" title="Holder concentration" detail={holdersQuery.data ? `Fetched ${formatDate(holdersQuery.data.fetchedAt)}` : undefined} />
            {holdersQuery.isLoading ? <LoadingRows count={5} /> : holdersQuery.isError || !holdersQuery.data ? <QueryError onRetry={() => holdersQuery.refetch()} /> : (
              <>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Stat label="Top 10 control" value={`${holdersQuery.data.top10Concentration.toFixed(2)}%`} tone={holdersQuery.data.top10Concentration > 40 ? 'negative' : 'positive'} />
                  <Stat label="Tracked supply" value={holdersQuery.data.totalSupply.toLocaleString()} />
                  <Stat label="Decimals" value={String(holdersQuery.data.decimals)} />
                </div>
                <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-card/60">
                  <div className="grid grid-cols-[42px_minmax(110px,1fr)_100px_76px] gap-3 border-b border-border bg-secondary/35 px-4 py-3 font-mono text-[9px] uppercase tracking-[.12em] text-muted-foreground"><span>#</span><span>Wallet</span><span>Amount</span><span className="text-right">Share</span></div>
                  <div className="divide-y divide-border">
                    {holdersQuery.data.holders.slice(0, 10).map((holder) => <div key={holder.address} className="grid grid-cols-[42px_minmax(110px,1fr)_100px_76px] items-center gap-3 px-4 py-3 text-xs">
                      <span className="font-mono text-muted-foreground">{String(holder.rank).padStart(2, '0')}</span>
                      <Link href={`/wallet/${holder.address}`} data-testid={`link-holder-wallet-${holder.rank}`} className="flex min-w-0 items-center gap-2 font-mono text-[10px] text-secondary-foreground hover:text-primary"><WalletCards className="h-3 w-3 shrink-0 text-muted-foreground" /> <span className="truncate">{shortValue(holder.address)}</span></Link>
                      <span className="font-mono text-[10px] text-foreground">{holder.amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                      <span className={`text-right font-mono text-[10px] ${holder.rank <= 3 ? 'text-accent' : 'text-muted-foreground'}`}>{holder.percentage.toFixed(2)}%</span>
                    </div>)}
                  </div>
                </div>
              </>
            )}
          </section>

          <section>
            <SectionLabel eyebrow="First money" title="Early buyers" detail={buyersQuery.data ? `${buyersQuery.data.scannedTransactions.toLocaleString()} tx scanned` : undefined} />
            {buyersQuery.isLoading ? <LoadingRows count={5} /> : buyersQuery.isError || !buyersQuery.data ? <QueryError onRetry={() => buyersQuery.refetch()} /> : buyersQuery.data.buyers.length === 0 ? <EmptyState title="No early buyers found" detail="The scan did not identify a clean first-buyer set for this token." /> : (
              <div className="overflow-hidden rounded-2xl border border-border bg-card/60">
                <div className="grid grid-cols-[42px_minmax(110px,1fr)_90px] gap-3 border-b border-border bg-secondary/35 px-4 py-3 font-mono text-[9px] uppercase tracking-[.12em] text-muted-foreground"><span>#</span><span>Wallet</span><span className="text-right">Arrived</span></div>
                <div className="divide-y divide-border">
                  {buyersQuery.data.buyers.slice(0, 10).map((buyer) => <div key={buyer.address} className="grid grid-cols-[42px_minmax(110px,1fr)_90px] items-center gap-3 px-4 py-3">
                    <span className="font-mono text-muted-foreground">{String(buyer.position).padStart(2, '0')}</span>
                    <Link href={`/wallet/${buyer.address}`} data-testid={`link-early-buyer-${buyer.position}`} className="flex min-w-0 items-center gap-2 font-mono text-[10px] text-secondary-foreground hover:text-primary"><Users className="h-3 w-3 shrink-0 text-primary" /><span className="truncate">{shortValue(buyer.address)}</span></Link>
                    <span className="text-right font-mono text-[10px] text-accent">{buyer.approximateTimeAfterLaunch ?? '—'}</span>
                  </div>)}
                </div>
              </div>
            )}
          </section>
        </div>

        <div className="mt-10 flex items-center gap-2 border-t border-border pt-5 text-[10px] text-muted-foreground">
          <Copy className="h-3 w-3" /><span className="font-mono">{token.mint}</span><CopyButton value={token.mint} label="Copy mint" /><span className="ml-auto hidden sm:block">Data is indexed context, not a trade recommendation.</span>
        </div>
      </div>
    </AppShell>
  );
}