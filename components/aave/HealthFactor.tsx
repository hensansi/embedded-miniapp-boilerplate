type Props = {
  value: number; // -1 = infinite (no borrows)
};

type Status = 'green' | 'yellow' | 'red';

function getStatus(value: number): Status {
  if (value < 0) return 'green';
  if (value >= 2) return 'green';
  if (value >= 1) return 'yellow';
  return 'red';
}

const STATUS_STYLES: Record<Status, { bg: string; fg: string }> = {
  green: { bg: 'var(--success-bg)', fg: 'var(--success-ink)' },
  yellow: { bg: 'var(--warn-bg)', fg: 'var(--warn-ink)' },
  red: { bg: 'var(--error-bg)', fg: 'var(--error-ink)' },
};

export function HealthFactor({ value }: Props) {
  const status = getStatus(value);
  const { bg, fg } = STATUS_STYLES[status];
  const display = value < 0 ? '∞' : value.toFixed(2);

  return (
    <div className="flex items-center justify-between">
      <span className="text-sm font-medium text-[var(--muted)]">Health Factor</span>
      <span
        className="rounded-full px-3 py-1 text-sm font-600"
        style={{ background: bg, color: fg }}
      >
        {display}
      </span>
    </div>
  );
}
