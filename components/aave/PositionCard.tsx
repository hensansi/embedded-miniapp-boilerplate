import type { AssetPosition } from '@/lib/aave';
import { AssetRow } from './AssetRow';

type Props = {
  title: string;
  assets: AssetPosition[];
};

export function PositionCard({ title, assets }: Props) {
  return (
    <div
      className="rounded-[var(--radius-card)] border border-[var(--line)] p-6"
      style={{
        background: 'var(--card)',
        boxShadow: 'var(--shadow-card)',
      }}
    >
      <h2 className="mb-4 text-base font-semibold tracking-tight text-[var(--ink)]">{title}</h2>
      {assets.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">No positions</p>
      ) : (
        <div>
          <div className="mb-2 flex items-center justify-between text-xs font-medium uppercase tracking-wider text-[var(--muted)]">
            <span>Asset</span>
            <div className="flex gap-8">
              <span>Amount</span>
              <span>APY</span>
            </div>
          </div>
          {assets.map((asset, i) => (
            <AssetRow key={`${asset.symbol}-${i}`} asset={asset} />
          ))}
        </div>
      )}
    </div>
  );
}
