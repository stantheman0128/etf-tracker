import { Card, CardContent } from '@/components/ui/card';
import type { RebalanceEvent } from '@/lib/strategies/momentum-types';

interface Props {
  rebalances: RebalanceEvent[];
  maxRows?: number;
}

export default function RebalanceHistoryTable({ rebalances, maxRows = 12 }: Props) {
  // Most recent first
  const sorted = [...rebalances].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, maxRows);

  return (
    <Card>
      <CardContent className="py-4">
        <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-2 px-1">
          換手歷史
        </div>
        {sorted.length === 0 ? (
          <div className="text-xs text-muted-foreground py-3 px-1">尚無紀錄</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-muted-foreground border-b">
                <th className="text-left font-medium py-2 px-1">日期</th>
                <th className="text-left font-medium py-2 px-1">賣出</th>
                <th className="text-left font-medium py-2 px-1">買進</th>
                <th className="text-left font-medium py-2 px-1">新組合</th>
                <th className="text-right font-medium py-2 px-1">當時 NAV</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(r => (
                <tr key={r.date} className="border-b last:border-b-0">
                  <td className="py-2 px-1 font-mono text-xs">{r.date}</td>
                  <td className="py-2 px-1">
                    {r.sold.length === 0 ? (
                      <span className="text-muted-foreground text-xs">—</span>
                    ) : (
                      r.sold.map(t => (
                        <span key={t} className="inline-block font-mono text-xs px-1.5 py-0.5 mr-1 mb-1 bg-green-50 text-green-700 rounded">
                          {t}
                        </span>
                      ))
                    )}
                  </td>
                  <td className="py-2 px-1">
                    {r.bought.length === 0 ? (
                      <span className="text-muted-foreground text-xs">(初始)</span>
                    ) : (
                      r.bought.map(t => (
                        <span key={t} className="inline-block font-mono text-xs px-1.5 py-0.5 mr-1 mb-1 bg-red-50 text-red-700 rounded">
                          {t}
                        </span>
                      ))
                    )}
                  </td>
                  <td className="py-2 px-1">
                    <span className="font-mono text-xs text-muted-foreground">
                      {r.newHoldings.map(h => h.ticker).join(' · ')}
                    </span>
                  </td>
                  <td className="py-2 px-1 text-right font-mono text-xs">
                    {r.preNav.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}
