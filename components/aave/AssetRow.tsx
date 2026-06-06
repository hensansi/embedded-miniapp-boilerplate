import type { AssetPosition } from '@/lib/aave';

type Props = {
  asset: AssetPosition;
};

export function AssetRow({ asset }: Props) {
  const formattedAmount = asset.amount < 0.001
    ? '<0.001'
    : asset.amount.toLocaleString('en-US', { maximumFractionDigits: 4 });

  const formattedApy = asset.apy.toFixed(2) + '%';

  return (
    <div className="flex items-center justify-between py-3 border-b border-[var(--line)] last:border-0">
      <div className="flex items-center gap-3">
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-700 text-[var(--muted)]"
          style={{ background: 'var(--accent-soft)' }}
        >
          {asset.symbol.replace(' (stable)', '').slice(0, 3)}
        </div>
        <span className="text-sm font-medium text-[var(--ink)]">{asset.symbol}</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-sm text-[var(--ink)]">{formattedAmount}</span>
        <span
          className="rounded-full px-2 py-0.5 text-xs font-medium"
          style={{
            background: 'var(--accent-soft)',
            color: 'var(--accent)',
          }}
        >
          {formattedApy}
        </span>
      </div>
    </div>
  );
}
