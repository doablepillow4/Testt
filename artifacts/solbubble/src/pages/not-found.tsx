import { ArrowLeft, ScanSearch } from 'lucide-react';
import { Link } from 'wouter';
import { AppShell } from '@/components/app-shell';

export default function NotFound() {
  return (
    <AppShell>
      <div className="mx-auto flex min-h-[calc(100dvh-150px)] max-w-[700px] flex-col items-center justify-center px-6 text-center">
        <div className="mb-5 grid h-14 w-14 place-items-center rounded-2xl border border-primary/25 bg-primary/10 text-primary"><ScanSearch className="h-6 w-6" /></div>
        <p className="font-mono text-[10px] uppercase tracking-[.2em] text-primary">No signal here</p>
        <h1 className="mt-3 text-3xl font-extrabold tracking-[-.06em] text-foreground">That route is outside the index.</h1>
        <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">Head back to Discover and search for a token or paste a mint address to begin a scan.</p>
        <Link href="/" data-testid="link-not-found-home" className="mt-7 flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-xs font-extrabold text-primary-foreground transition-transform hover:-translate-y-0.5"><ArrowLeft className="h-3.5 w-3.5" /> Back to Discover</Link>
      </div>
    </AppShell>
  );
}
