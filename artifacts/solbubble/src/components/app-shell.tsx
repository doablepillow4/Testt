import { ArrowUpRight, Command, Search, Sparkles } from 'lucide-react';
import { type FormEvent, type ReactNode, useState } from 'react';
import { Link, useLocation } from 'wouter';

function shortAddress(value: string) {
  return value.length > 12 ? `${value.slice(0, 5)}…${value.slice(-5)}` : value;
}

export function AppShell({ children }: { children: ReactNode }) {
  const [location, setLocation] = useLocation();
  const [query, setQuery] = useState('');

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const clean = query.trim();
    if (clean) setLocation(`/?q=${encodeURIComponent(clean)}`);
  }

  const isHome = location === '/' || location.startsWith('/?');

  return (
    <div className="noise min-h-[100dvh] bg-background">
      <header className="sticky top-0 z-40 border-b border-border/80 bg-background/90 backdrop-blur-xl">
        <div className="mx-auto flex h-[70px] max-w-[1440px] items-center gap-4 px-4 sm:px-7">
          <Link href="/" data-testid="link-brand" className="group flex shrink-0 items-center gap-3">
            <span className="relative grid h-9 w-9 place-items-center overflow-hidden rounded-[11px] bg-primary text-primary-foreground shadow-[0_0_24px_rgba(38,242,193,.16)]">
              <span className="absolute h-16 w-16 rounded-full border border-primary-foreground/20" />
              <span className="font-mono text-[13px] font-medium tracking-tighter">SB</span>
            </span>
            <span className="hidden text-[15px] font-extrabold tracking-[-.04em] text-foreground sm:block">SolBubble</span>
          </Link>

          <div className="mx-auto hidden h-px max-w-[90px] flex-1 bg-border md:block" />

          <form onSubmit={submit} className="relative flex min-w-0 flex-1 md:max-w-[430px]" role="search">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-[16px] w-[16px] -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search token or paste mint"
              aria-label="Search token or paste mint"
              data-testid="input-global-search"
              className="h-10 w-full rounded-xl border border-border bg-secondary/55 pl-10 pr-12 text-[12px] text-foreground outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-primary/60 focus:bg-secondary"
            />
            <span className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 items-center gap-1 rounded-md border border-border bg-background/70 px-1.5 py-1 font-mono text-[9px] text-muted-foreground sm:flex">
              <Command className="h-2.5 w-2.5" /> K
            </span>
          </form>

          <nav className="hidden items-center gap-1 text-[11px] font-semibold text-muted-foreground lg:flex">
            <Link href="/" data-testid="link-discover" className={`rounded-lg px-3 py-2 transition-colors hover:text-foreground ${isHome ? 'bg-secondary text-foreground' : ''}`}>
              Discover
            </Link>
            <a href="https://docs.solana.com" target="_blank" rel="noreferrer" data-testid="link-solana-docs" className="flex items-center gap-1 rounded-lg px-3 py-2 transition-colors hover:bg-secondary hover:text-foreground">
              Solana <ArrowUpRight className="h-3 w-3" />
            </a>
          </nav>
          <div className="hidden items-center gap-2 border-l border-border pl-4 sm:flex">
            <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-primary" />
            <span className="font-mono text-[9px] uppercase tracking-[.16em] text-muted-foreground">Live index</span>
          </div>
        </div>
      </header>
      <main>{children}</main>
      <footer className="mx-auto flex max-w-[1440px] items-center justify-between border-t border-border/70 px-4 py-8 text-[10px] text-muted-foreground sm:px-7">
        <span className="font-mono tracking-[.16em]">SOLBUBBLE / SIGNAL OVER NOISE</span>
        <span className="hidden sm:block">Indexed on Solana · {shortAddress('7xKXtg2CW87d97TXJSDpbD5Pnnjv3dJ2KJ1s7aXq') }</span>
      </footer>
    </div>
  );
}

export function SectionLabel({ eyebrow, title, detail }: { eyebrow: string; title: string; detail?: string }) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <div>
        <p className="mb-1 font-mono text-[9px] uppercase tracking-[.2em] text-primary">{eyebrow}</p>
        <h2 className="text-lg font-extrabold tracking-[-.04em] text-foreground">{title}</h2>
      </div>
      {detail && <span className="font-mono text-[10px] text-muted-foreground">{detail}</span>}
    </div>
  );
}

export function TokenAvatar({ name, symbol, imageUrl, size = 'md' }: { name: string; symbol: string; imageUrl?: string | null; size?: 'sm' | 'md' | 'lg' }) {
  const dimensions = size === 'lg' ? 'h-16 w-16 text-xl' : size === 'sm' ? 'h-8 w-8 text-[10px]' : 'h-10 w-10 text-xs';
  return imageUrl ? (
    <img src={imageUrl} alt={`${name} logo`} className={`${dimensions} rounded-full border border-border object-cover`} />
  ) : (
    <div className={`${dimensions} grid shrink-0 place-items-center rounded-full border border-primary/25 bg-primary/10 font-mono font-medium text-primary`}>
      {symbol.slice(0, 3).toUpperCase()}
    </div>
  );
}

export function shortValue(value: string) {
  return value.length > 14 ? `${value.slice(0, 6)}…${value.slice(-5)}` : value;
}

export function formatUsd(value: number | null | undefined, decimals = 2) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  if (Math.abs(value) < 0.01 && value !== 0) return `$${value.toFixed(6)}`;
  return `$${value.toLocaleString('en-US', { maximumFractionDigits: decimals, minimumFractionDigits: decimals })}`;
}

export function compactUsd(value: number | null | undefined) {
  if (value === null || value === undefined) return '—';
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return formatUsd(value);
}

export function percent(value: number | null | undefined) {
  if (value === null || value === undefined) return '—';
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

export function CopyButton({ value, label = 'Copy address' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard?.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }
  return (
    <button onClick={copy} type="button" data-testid={`button-copy-${value.slice(0, 6)}`} className="font-mono text-[10px] text-muted-foreground transition-colors hover:text-primary">
      {copied ? 'Copied' : label}
    </button>
  );
}

export function QueryError({ message = 'The index did not answer in time.', onRetry }: { message?: string; onRetry: () => void }) {
  return (
    <div className="rounded-2xl border border-destructive/30 bg-destructive/5 px-6 py-10 text-center">
      <p className="mb-1 text-sm font-bold text-foreground">Signal unavailable</p>
      <p className="mb-5 text-xs text-muted-foreground">{message}</p>
      <button type="button" onClick={onRetry} data-testid="button-retry" className="rounded-lg border border-border bg-secondary px-4 py-2 text-[11px] font-bold text-foreground transition-colors hover:border-primary/50 hover:text-primary">
        Try again
      </button>
    </div>
  );
}

export function LoadingRows({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-3" aria-label="Loading">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="flex items-center gap-3 rounded-xl border border-border/60 bg-card/60 px-4 py-3">
          <div className="skeleton h-8 w-8 rounded-full" />
          <div className="flex-1 space-y-2"><div className="skeleton h-3 w-28 rounded" /><div className="skeleton h-2 w-16 rounded" /></div>
          <div className="skeleton h-3 w-16 rounded" />
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card/35 px-6 py-12 text-center">
      <Sparkles className="mx-auto mb-3 h-5 w-5 text-primary/70" />
      <p className="text-sm font-bold text-foreground">{title}</p>
      <p className="mx-auto mt-1 max-w-xs text-xs leading-5 text-muted-foreground">{detail}</p>
    </div>
  );
}