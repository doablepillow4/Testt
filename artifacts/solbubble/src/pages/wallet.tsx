import { ArrowUpRight, CheckCircle2, Clock3, Copy, ExternalLink, Landmark, Layers3, Repeat2, WalletCards } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'wouter';
import { getGetWalletProfileQueryKey, useGetWalletProfile } from '@workspace/api-client-react';
import { AppShell, compactUsd, CopyButton, EmptyState, formatUsd, LoadingRows, QueryError, SectionLabel, shortValue, TokenAvatar } from '@/components/app-shell';

function formatActivityDate(value: string | null) {
  if (!value) return 'Time unavailable';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function walletAge(value: string | null) {
  if (!value) return 'Age unavailable';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const days = Math.max(1, Math.floor((Date.now() - date.getTime()) / 86_400_000));
  if (days < 30) return `${days} days`;
  if (days < 365) return `${Math.floor(days / 30)} months`;
  return `${(days / 365).toFixed(1)} years`;
}

function ActivityIcon({ type }: { type: string }) {
  if (type.toLowerCase().includes('swap') || type.toLowerCase().includes('trade')) return <Repeat2 className="h-4 w-4 text-accent" />;
  if (type.toLowerCase().includes('transfer')) return <Landmark className="h-4 w-4 text-chart-3" />;
  return <CheckCircle2 className="h-4 w-4 text-primary" />;
}

export default function WalletPage() {
  const { address = '' } = useParams<{ address: string }>();
  const walletQuery = useGetWalletProfile(address, { query: { enabled: Boolean(address), queryKey: getGetWalletProfileQueryKey(address), staleTime: 30_000 } });
  const [copied, setCopied] = useState(false);
  const profile = walletQuery.data;

  async function copyAddress() {
    await navigator.clipboard?.writeText(address);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  if (walletQuery.isLoading) {
    return <AppShell><div className="mx-auto max-w-[1440px] px-4 py-12 sm:px-7"><div className="skeleton h-24 rounded-2xl" /><div className="mt-8 grid gap-7 lg:grid-cols-[minmax(0,1fr)_390px]"><LoadingRows count={5} /><LoadingRows count={5} /></div></div></AppShell>;
  }
  if (walletQuery.isError || !profile) {
    return <AppShell><div className="mx-auto max-w-[900px] px-4 py-20 sm:px-7"><QueryError onRetry={() => walletQuery.refetch()} message="We could not resolve that wallet. Check the address and try again." /></div></AppShell>;
  }

  const totalValue = profile.assets.reduce((sum, asset) => sum + (asset.valueUsd ?? 0), 0);
  return (
    <AppShell>
      <div className="mx-auto max-w-[1440px] px-4 py-8 sm:px-7 sm:py-12">
        <div className="rounded-2xl border border-border bg-card/60 p-5 sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div className="flex min-w-0 items-center gap-4">
              <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-accent/25 bg-accent/10 text-accent"><WalletCards className="h-6 w-6" /></div>
              <div className="min-w-0">
                <p className="mb-1 font-mono text-[9px] uppercase tracking-[.2em] text-primary">Wallet profile</p>
                <h1 className="truncate font-mono text-base font-medium text-foreground sm:text-lg">{shortValue(profile.address)}</h1>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button type="button" onClick={copyAddress} data-testid="button-copy-wallet" className="flex items-center gap-1.5 rounded-md border border-border bg-secondary/60 px-2 py-1 font-mono text-[10px] text-secondary-foreground hover:border-primary/50 hover:text-primary">{copied ? <CheckCircle2 className="h-3 w-3 text-primary" /> : <Copy className="h-3 w-3" />} {copied ? 'Copied' : 'Copy address'}</button>
                  <CopyButton value={profile.address} label="Copy raw" />
                </div>
              </div>
            </div>
            <a href={`https://solscan.io/account/${profile.address}`} target="_blank" rel="noreferrer" data-testid="link-wallet-solscan" className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-[11px] font-bold text-secondary-foreground hover:border-primary/50 hover:text-primary">View on Solscan <ExternalLink className="h-3 w-3" /></a>
          </div>
          <div className="mt-7 grid gap-3 border-t border-border pt-5 sm:grid-cols-3">
            <div><p className="font-mono text-[9px] uppercase tracking-[.16em] text-muted-foreground">Tracked value</p><p className="mt-1 text-lg font-extrabold tracking-[-.04em] text-foreground">{formatUsd(totalValue)}</p></div>
            <div><p className="font-mono text-[9px] uppercase tracking-[.16em] text-muted-foreground">Token accounts</p><p className="mt-1 text-lg font-extrabold tracking-[-.04em] text-foreground">{profile.tokenCount.toLocaleString()}</p></div>
            <div><p className="font-mono text-[9px] uppercase tracking-[.16em] text-muted-foreground">Wallet age</p><p className="mt-1 text-lg font-extrabold tracking-[-.04em] text-foreground">{walletAge(profile.walletAge)}</p></div>
          </div>
        </div>

        <div className="mt-9 grid gap-9 lg:grid-cols-[minmax(0,1fr)_minmax(340px,.72fr)]">
          <section>
            <SectionLabel eyebrow="Asset inventory" title="Holdings" detail={`${profile.assets.length} assets`} />
            {profile.assets.length === 0 ? <EmptyState title="No holdings returned" detail="This wallet has no token balances in the current index window." /> : (
              <div className="overflow-hidden rounded-2xl border border-border bg-card/60">
                <div className="hidden grid-cols-[minmax(190px,1.5fr)_100px_100px_110px] gap-4 border-b border-border bg-secondary/35 px-5 py-3 font-mono text-[9px] uppercase tracking-[.15em] text-muted-foreground sm:grid"><span>Asset</span><span>Balance</span><span>Price</span><span className="text-right">Value</span></div>
                <div className="divide-y divide-border">
                  {profile.assets.map((asset) => (
                    <div key={asset.id} data-testid={`row-wallet-asset-${asset.id}`} className="grid grid-cols-2 gap-3 px-4 py-4 sm:grid-cols-[minmax(190px,1.5fr)_100px_100px_110px] sm:items-center sm:gap-4 sm:px-5">
                      <div className="col-span-2 flex items-center gap-3 sm:col-span-1"><TokenAvatar name={asset.name} symbol={asset.symbol} imageUrl={asset.imageUrl} size="sm" /><div className="min-w-0"><p className="truncate text-xs font-extrabold text-foreground">{asset.name}</p><p className="font-mono text-[9px] uppercase text-muted-foreground">{asset.symbol}</p></div></div>
                      <div><p className="font-mono text-xs text-foreground">{asset.amount.toLocaleString(undefined, { maximumFractionDigits: 4 })}</p><p className="mt-1 text-[9px] uppercase text-muted-foreground sm:hidden">balance</p></div>
                      <div className="hidden sm:block"><p className="font-mono text-xs text-muted-foreground">—</p></div>
                      <div className="text-right"><p className="font-mono text-xs text-foreground">{compactUsd(asset.valueUsd)}</p><p className="mt-1 text-[9px] uppercase text-muted-foreground sm:hidden">value</p></div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          <section>
            <SectionLabel eyebrow="On-chain trail" title="Recent activity" detail={profile.activity.length ? `${profile.activity.length} events` : 'No events'} />
            {profile.activity.length === 0 ? <EmptyState title="No recent activity" detail="There are no indexed transactions for this wallet in the current window." /> : (
              <div className="space-y-2">
                {profile.activity.map((activity) => (
                  <a href={`https://solscan.io/tx/${activity.signature}`} target="_blank" rel="noreferrer" key={activity.signature} data-testid={`link-wallet-activity-${activity.signature}`} className="group flex gap-3 rounded-xl border border-border bg-card/55 p-4 transition-colors hover:border-primary/40 hover:bg-card">
                    <div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-secondary"><ActivityIcon type={activity.type} /></div>
                    <div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><p className="text-xs font-bold text-foreground">{activity.type}</p><ArrowUpRight className="h-3 w-3 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" /></div><p className="mt-1 line-clamp-2 text-[11px] leading-5 text-muted-foreground">{activity.description}</p><p className="mt-2 flex items-center gap-1.5 font-mono text-[9px] text-muted-foreground"><Clock3 className="h-3 w-3" />{formatActivityDate(activity.timestamp)}</p></div>
                  </a>
                ))}
              </div>
            )}
          </section>
        </div>

        <div className="mt-10 flex items-center gap-2 border-t border-border pt-5 text-[10px] text-muted-foreground"><Layers3 className="h-3 w-3 text-primary" /><span>Profile indexed {formatActivityDate(profile.fetchedAt)}</span><span className="ml-auto hidden font-mono sm:block">{profile.address}</span></div>
      </div>
    </AppShell>
  );
}