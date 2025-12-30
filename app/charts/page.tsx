'use client';

import { useEffect, useRef, useState } from 'react';
import { createChart, ColorType } from 'lightweight-charts';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const CHART_VIEWS = [
  { value: 'portfolio', label: '📊 投資組合總值' },
  { value: 'TSLA', label: 'Tesla' },
  { value: 'AMZN', label: 'Amazon' },
  { value: 'NVDA', label: 'Nvidia' },
  { value: 'META', label: 'Meta' },
  { value: 'TSM', label: '台積電 ADR' },
  { value: '2330', label: '台積電 (TW)' },
];

export default function ChartsPage() {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [selectedView, setSelectedView] = useState('portfolio');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'white' },
        textColor: '#333',
      },
      width: chartContainerRef.current.clientWidth,
      height: 400,
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
      },
      grid: {
        vertLines: { color: '#f0f0f0' },
        horzLines: { color: '#f0f0f0' },
      },
    });

    const lineSeries = chart.addLineSeries({
      color: '#667eea',
      lineWidth: 2,
    });

    // 獲取歷史資料
    setLoading(true);
    setError(null);

    if (selectedView === 'portfolio') {
      // 投資組合總值：使用模擬資料（因為需要所有股票的歷史資料會很慢）
      setError('投資組合總值走勢圖功能開發中。目前請選擇個別股票查看歷史走勢。');
      setLoading(false);
    } else {
      fetch(`/api/prices?symbol=${selectedView}&days=90`)
        .then(res => {
          if (!res.ok) throw new Error('Failed to fetch data');
          return res.json();
        })
        .then(data => {
          if (data.error) {
            setError(data.error);
            return;
          }

          const formattedData = data.map((item: any) => ({
            time: item.date,
            value: item.close,
          }));

          lineSeries.setData(formattedData);
          chart.timeScale().fitContent();
          setLoading(false);
        })
        .catch(err => {
          console.error('Error fetching chart data:', err);
          setError('無法載入圖表資料');
          setLoading(false);
        });
    }

    // 響應式調整
    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({
          width: chartContainerRef.current.clientWidth,
        });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [selectedView]);

  return (
    <div className="container mx-auto p-4 md:p-6 max-w-7xl">
      {/* Header */}
      <div className="bg-white/95 backdrop-blur rounded-2xl shadow-xl p-6 mb-6">
        <div className="flex items-center gap-4">
          <Link href="/" className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <ArrowLeft size={24} />
          </Link>
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-[#667eea] to-[#764ba2] bg-clip-text text-transparent">
              📊 歷史曲線圖
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              過去 30 天價格走勢
            </p>
          </div>
        </div>
      </div>

      {/* View Selector */}
      <Card className="bg-white/95 backdrop-blur mb-6">
        <CardHeader>
          <CardTitle className="text-lg">選擇圖表</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {CHART_VIEWS.map((view) => (
              <button
                key={view.value}
                onClick={() => setSelectedView(view.value)}
                className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
                  selectedView === view.value
                    ? 'bg-gradient-to-r from-[#667eea] to-[#764ba2] text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {view.label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Chart */}
      <Card className="bg-white/95 backdrop-blur">
        <CardHeader>
          <CardTitle className="text-xl">
            {CHART_VIEWS.find(v => v.value === selectedView)?.label} - 90 天走勢
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading && (
            <div className="flex items-center justify-center h-[400px]">
              <div className="text-gray-500">載入中...</div>
            </div>
          )}
          {error && (
            <div className="flex items-center justify-center h-[400px]">
              <div className="text-red-500">{error}</div>
            </div>
          )}
          <div
            ref={chartContainerRef}
            className={loading || error ? 'hidden' : 'w-full'}
          />
        </CardContent>
      </Card>

      {/* Info */}
      <div className="mt-6 bg-white/10 backdrop-blur rounded-xl p-4 text-white/80 text-sm">
        <p className="mb-2">
          <strong>📊 投資組合總值：</strong>由於需要計算所有股票的歷史價格，此功能將在後續版本中實作。
        </p>
        <p>
          <strong>📈 個股走勢：</strong>資料來源為 Yahoo Finance API，免費且即時更新。顯示過去 90 天價格走勢。
        </p>
      </div>
    </div>
  );
}
