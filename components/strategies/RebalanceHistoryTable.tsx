import type { RebalanceEvent } from '@/lib/strategies/momentum-types';

interface Props {
  rebalances: RebalanceEvent[];
  maxRows?: number;
}

/**
 * Card-less history table — caller provides the outer container.
 */
export default function RebalanceHistoryTable({ rebalances, maxRows = 12 }: Props) {
  // Most recent first
  const sorted = [...rebalances].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, maxRows);

  if (sorted.length === 0) {
    return (
      <div className="px-6 pb-4 text-xs text-gray-500">尚無紀錄</div>
    );
  }

  return (
    <div className="px-4 pb-4 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[11px] uppercase tracking-wider text-gray-500 border-b">
            <th className="text-left font-medium py-2 px-2">日期</th>
            <th className="text-left font-medium py-2 px-2">賣出</th>
            <th className="text-left font-medium py-2 px-2">買進</th>
            <th className="text-left font-medium py-2 px-2">新組合</th>
            <th className="text-right font-medium py-2 px-2">當時 NAV</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(r => (
            <tr key={r.date} className="border-b last:border-b-0">
              <td className="py-2 px-2 font-mono text-xs text-gray-700">{r.date}</td>
              <td className="py-2 px-2">
                {r.sold.length === 0 ? (
                  <span className="text-gray-400 text-xs">—</span>
                ) : (
                  r.sold.map(t => (
                    <span key={t} className="inline-block font-mono text-xs px-1.5 py-0.5 mr-1 mb-1 bg-green-50 text-green-700 rounded">
                      {t}
                    </span>
                  ))
                )}
              </td>
              <td className="py-2 px-2">
                {r.bought.length === 0 ? (
                  <span className="text-gray-400 text-xs">(初始)</span>
                ) : (
                  r.bought.map(t => (
                    <span key={t} className="inline-block font-mono text-xs px-1.5 py-0.5 mr-1 mb-1 bg-red-50 text-red-700 rounded">
                      {t}
                    </span>
                  ))
                )}
              </td>
              <td className="py-2 px-2">
                <span className="font-mono text-xs text-gray-500">
                  {r.newHoldings.map(h => h.ticker).join(' · ')}
                </span>
              </td>
              <td className="py-2 px-2 text-right font-mono text-xs text-gray-700">
                {r.preNav.toFixed(2)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
