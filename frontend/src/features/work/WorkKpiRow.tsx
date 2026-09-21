import type { WorkSummary } from '@contracts/work';
import { formatPesos } from '@/lib/money';
import { cn } from '@/lib/cn';

function StatTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="min-w-0 rounded-sm border border-hairline bg-surface px-3 py-3">
      <p className="text-xs font-medium text-ink-muted">{label}</p>
      <p
        data-numeric
        className="u-display mt-1 truncate text-2xl text-ink"
      >
        {value}
      </p>
      {hint != null && <p className="mt-0.5 text-xs text-ink-muted">{hint}</p>}
    </div>
  );
}

/**
 * Headline figures as figures. A tile renders only when it has something to
 * say — no row of ₱0 or empty ratings (plan 0029).
 */
export function WorkKpiRow({ summary }: { summary: WorkSummary }) {
  const tiles: Array<{ key: string; label: string; value: string; hint?: string }> = [];

  if (summary.agreements.total > 0) {
    tiles.push({
      key: 'agreements',
      label: 'Agreements',
      value: String(summary.agreements.total),
    });
  }

  if (summary.money.committedCentavos > 0) {
    tiles.push({
      key: 'committed',
      label: 'Committed',
      value: formatPesos(summary.money.committedCentavos),
    });
  }

  if (summary.money.completedCentavos > 0) {
    tiles.push({
      key: 'completed',
      label: 'Completed',
      value: formatPesos(summary.money.completedCentavos),
    });
  }

  if (summary.ratings.average != null && summary.ratings.count > 0) {
    tiles.push({
      key: 'rating',
      label: 'Rating',
      value: summary.ratings.average.toFixed(1),
      hint: summary.ratings.count === 1 ? '1 rating' : `${summary.ratings.count} ratings`,
    });
  }

  if (tiles.length === 0) return null;

  return (
    <div
      className={cn(
        'mt-10 grid gap-3',
        // 375px wraps to two columns — the width the complaint came from.
        'grid-cols-2',
        tiles.length >= 3 && 'sm:grid-cols-4',
      )}
      data-testid="work-kpi-row"
    >
      {tiles.map((tile) => (
        <StatTile key={tile.key} label={tile.label} value={tile.value} hint={tile.hint} />
      ))}
    </div>
  );
}
