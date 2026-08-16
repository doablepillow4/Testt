import { ArrowRight, BarChart3, ChevronRight, Clock3, Database, Search, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useLocation } from 'wouter';
import { getSearchTokensQueryKey, useSearchTokens } from '@workspace/api-client-react';
import { AppShell, compactUsd, EmptyState, formatUsd, LoadingRows, percent, QueryError, SectionLabel, TokenAvatar, shortValue } from '@/components/app-shell';

export default function Home() {
  const [location, setLocation] = useLocation();
  const initialQuery = useMemo(() => new URLSearchParams(location.split('?')[1] ?? '').get('q') ?? '', [location]);
  const [input, setInput] = useState(initialQuery);
  const [submitted, setSubmitted] = useState(initialQuery);
  useEffect(() => {
    setInput(initialQuery);
    setSubmitted(initialQuery);
  }, [initialQuery]);
  const request = submitted.trim() || 'solana';
  const search = useSearchTokens(
    { q: request },
    { query: { enabled: true, queryKey: getSearchTokensQueryKey({ q: request }), staleTime: 30_000 } },
  );
  const results = search.data ?? [];

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const clean = input.trim();
    if (!clean) return;
    setSubmitted(clean);
    setLocation(`/?q=${encodeURIComponent(clean)}`);
  }

  return (
    <AppShell>
      <div className="terminal-grid relative overflow-hidden">
        <div className="pointer-events-none absolute -left-24 top-16 h-80 w-80 rounded-full bg-primary/7 blur-3xl" />
        <div className="pointer-events-none absolute right-0 top-0 h-72 w-72 rounded-full bg-accent/5 blur-3xl" />
        <section className="relative mx-auto max-w-[1440px] px-4 pb-12 pt-16 sm:px-7 sm:pb-20 sm:pt-24">
          <div className="max-w-3xl rise-in">
            <div className="mb-6 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[.2em] text-primary">
              <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-primary" />
              Solana token intelligence
            </div>
            <h1 className="max-w-3xl text-[clamp(2.8rem,8vw,6.8rem)] font-extrabold leading-[.93] tracking-[-.085em] text-foreground">
              Find the signal<br /><span className="text-primary">before the crowd.</span>
            </h1>
            <p className="mt-7 max-w-xl text-[15px] leading-7 text-muted-foreground sm:text-base">
              Inspect any Solana token in seconds. Market context, holder risk, and the wallets that arrived first — without the launch-day noise.
            </p>
          </div>

          <form onSubmit={submit} className="mt-10 flex max-w-2xl gap-2 rise-in-delay" role="search">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-primary" />
              <input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Paste a mint address, symbol, or token name"
                aria-label="Search Solana tokens"
                data-testid="input-token-search"
                className="h-14 w-full rounded-xl border border-primary/30 bg-card/90 pl-12 pr-4 text-sm text-foreground shadow-[0_14px_36px_rgba(0,0,0,.18)] outline-none placeholder:text-muted-foreground/80 focus:border-primary"
              />
            </div>
            <button type="submit" data-testid="button-search-token" className="flex h-14 shrink-0 items-center gap-2 rounded-xl bg-primary px-5 text-xs font-extrabold text-primary-foreground transition-transform hover:-translate-y-0.5 active:translate-y-0 sm:px-6">
              Scan <ArrowRight className="h-4 w-4" />
            </button>
          </form>

          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[10px] text-muted-foreground">
            <span className="flex items-center gap-2"><ShieldCheck className="h-3.5 w-3.5 text-primary" /> On-chain context</span>
            <span className="flex items-center gap-2"><Clock3 className="h-3.5 w-3.5 text-accent" /> Fresh market data</span>
            <span className="flex items-center gap-2"><SlidersHorizontal className="h-3.5 w-3.5 text-chart-3" /> High-signal filters</span>
          </div>
        </section>
      </div>

      <section className="mx-auto max-w-[1440px] px-4 py-12 sm:px-7 sm:py-16">
        <SectionLabel eyebrow="Search index" title={submitted ? `Results for “${submitted}”` : 'Recent scans'} detail={`${results.length} matches`} />
        {search.isLoading ? <LoadingRows count={4} /> : search.isError ? <QueryError onRetry={() => search.refetch()} /> : results.length === 0 ? (
          <EmptyState title="No tokens surfaced" detail="Try a ticker, full project name, or paste the complete mint address to widen the scan." />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border bg-card/60">
            <div className="hidden grid-cols-[minmax(220px,1.7fr)_repeat(4,minmax(90px,1fr))_100px] gap-4 border-b border-border bg-secondary/35 px-5 py-3 font-mono text-[9px] uppercase tracking-[.16em] text-muted-foreground md:grid">
              <span>Token</span><span>Price</span><span>24h</span><span>Liquidity</span><span>Volume</span><span>Route</span>
            </div>
            <div className="divide-y divide-border">
              {results.map((token) => (
                <Link href={`/token/${token.mint}`} key={token.mint} data-testid={`link-token-${token.mint}`} className="group grid grid-cols-2 gap-3 px-4 py-4 transition-colors hover:bg-secondary/45 sm:px-5 md:grid-cols-[minmax(220px,1.7fr)_repeat(4,minmax(90px,1fr))_100px] md:items-center md:gap-4">
                  <div className="col-span-2 flex min-w-0 items-center gap-3 md:col-span-1">
                    <TokenAvatar name={token.name} symbol={token.symbol} imageUrl={token.imageUrl} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-extrabold tracking-[-.02em] text-foreground">{token.name}</p>
                      <p className="font-mono text-[10px] uppercase tracking-[.12em] text-muted-foreground">{token.symbol} <span className="mx-1 text-border">·</span> {shortValue(token.mint)}</p>
                    </div>
                    <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary md:hidden" />
                  </div>
                  <div><p className="font-mono text-xs text-foreground">{formatUsd(token.priceUsd, 6)}</p><p className="mt-1 text-[9px] uppercase text-muted-foreground md:hidden">price</p></div>
                  <div><p className={`font-mono text-xs ${(token.change24h ?? 0) >= 0 ? 'text-primary' : 'text-destructive'}`}>{percent(token.change24h)}</p><p className="mt-1 text-[9px] uppercase text-muted-foreground md:hidden">24h move</p></div>
                  <div className="hidden md:block"><p className="font-mono text-xs text-foreground">{compactUsd(token.liquidityUsd)}</p></div>
                  <div className="hidden md:block"><p className="font-mono text-xs text-foreground">{compactUsd(token.volume24hUsd)}</p></div>
                  <div className="hidden items-center gap-1 font-mono text-[10px] uppercase text-muted-foreground md:flex">{token.dexId} <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-1 group-hover:text-primary" /></div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="border-y border-border/70 bg-card/25">
        <div className="mx-auto grid max-w-[1440px] gap-0 px-4 sm:grid-cols-3 sm:px-7">
          {[
            { icon: Database, title: 'One clean surface', text: 'Market data and on-chain behavior in the same scan.' },
            { icon: BarChart3, title: 'Read the pulse', text: 'Price context that shows shape, not just a number.' },
            { icon: ShieldCheck, title: 'See the concentration', text: 'Know who owns supply before you make a call.' },
          ].map(({ icon: Icon, title, text }, index) => (
            <div key={title} className={`flex gap-4 border-border py-7 sm:px-7 ${index !== 2 ? 'sm:border-r' : ''} ${index !== 0 ? 'border-t sm:border-t-0' : ''}`}>
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <div><p className="text-xs font-extrabold text-foreground">{title}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{text}</p></div>
            </div>
          ))}
        </div>
      </section>
    </AppShell>
  );
}