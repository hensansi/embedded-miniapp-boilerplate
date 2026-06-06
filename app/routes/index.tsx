import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useWallet } from '@/hooks/use-wallet';
import { fetchAavePosition, type AavePosition } from '@/lib/aave';
import { PositionCard } from '@/components/aave/PositionCard';
import { HealthFactor } from '@/components/aave/HealthFactor';

export const Route = createFileRoute('/')({
  component: AaveDashboardPage,
});

function AaveDashboardPage() {
  const { address } = useWallet();
  const [position, setPosition] = useState<AavePosition | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!address) {
      setPosition(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchAavePosition(address)
      .then((data) => { if (!cancelled) setPosition(data); })
      .catch((e) => { if (!cancelled) setError(e.message ?? 'Failed to load position'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [address]);

  if (!address) return <EmptyState />;
  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;
  if (!position) return null;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--ink)]">
          Aave V3 Position
        </h1>
        <p className="mt-1 text-sm text-[var(--muted)]">Gnosis Chain</p>
      </div>

      <div
        className="rounded-[var(--radius-card)] border border-[var(--line)] p-6"
        style={{ background: 'var(--card)', boxShadow: 'var(--shadow-card)' }}
      >
        <HealthFactor value={position.healthFactor} />
      </div>

      <PositionCard title="Supplied" assets={position.supplied} />
      <PositionCard title="Borrowed" assets={position.borrowed} />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center justify-center gap-3 py-20 text-center">
      <div
        className="flex h-14 w-14 items-center justify-center rounded-full text-2xl"
        style={{ background: 'var(--accent-soft)' }}
      >
        ⬡
      </div>
      <p className="text-base font-medium text-[var(--ink)]">No wallet connected</p>
      <p className="max-w-xs text-sm text-[var(--muted)]">
        Open this app inside the Circles host to connect your wallet.
      </p>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div className="h-8 w-40 animate-pulse rounded-lg bg-[var(--line)]" />
      <div className="h-16 animate-pulse rounded-[var(--radius-card)] bg-[var(--line)]" />
      <div className="h-48 animate-pulse rounded-[var(--radius-card)] bg-[var(--line)]" />
      <div className="h-48 animate-pulse rounded-[var(--radius-card)] bg-[var(--line)]" />
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center gap-3 py-20 text-center">
      <p className="text-base font-medium" style={{ color: 'var(--error-ink)' }}>
        Failed to load position
      </p>
      <p className="text-sm text-[var(--muted)]">{message}</p>
    </div>
  );
}
