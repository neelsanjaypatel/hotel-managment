import { addDays, rupees } from "@/lib/format";

// Income vs expense per day for one month, as paired bars.
export function DailyChart({ from, to, data }: { from: string; to: string; data: Map<string, { income: number; expense: number }> }) {
  const days: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);
  const max = Math.max(1, ...[...data.values()].flatMap((v) => [v.income, v.expense]));
  const W = 720, H = 180, pad = 4, bw = (W - pad * 2) / days.length;
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H + 18}`} className="h-auto w-full" role="img" aria-label="Daily income and expense">
        {days.map((d, i) => {
          const v = data.get(d) ?? { income: 0, expense: 0 };
          const x = pad + i * bw;
          const hi = (v.income / max) * H, he = (v.expense / max) * H;
          const w = Math.max(1, bw / 2 - 1.5);
          return (
            <g key={d}>
              <title>{`${d}: income ${rupees(v.income)}, expense ${rupees(v.expense)}`}</title>
              <rect x={x + 1} y={H - hi} width={w} height={hi} rx={1.5} fill="var(--income)" />
              <rect x={x + 1 + w + 1} y={H - he} width={w} height={he} rx={1.5} fill="var(--expense)" opacity={0.85} />
              {(i === 0 || (i + 1) % 5 === 0) && (
                <text x={x + bw / 2} y={H + 14} textAnchor="middle" fontSize="10" fill="var(--muted)">{Number(d.slice(8))}</text>
              )}
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-2 flex gap-4 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5"><i className="inline-block h-2 w-2 rounded-sm bg-income" />Income</span>
        <span className="inline-flex items-center gap-1.5"><i className="inline-block h-2 w-2 rounded-sm bg-expense" />Expense</span>
      </figcaption>
    </figure>
  );
}
