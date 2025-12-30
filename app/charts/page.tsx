'use client';

import { useEffect, useRef, useState } from 'react';
import { createChart, ColorType } from 'lightweight-charts';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const SYMBOLS = [
  { value: 'TSLA', label: 'Tesla' },
  { value: 'AMZN', label: 'Amazon' },
  { value: 'NVDA', label: 'Nvidia' },
  { value: 'META', label: 'Meta' },
  { value: 'TSM', label: '台積電 ADR' },
];

export default function ChartsPage() {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [selectedSymbol, setSelectedSymbol] = useState('TSLA');
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

    fetch(`/api/prices?symbol=${selectedSymbol}&days=30`)
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
  }, [selectedSymbol]);

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

      {/* Symbol Selector */}
      <Card className="bg-white/95 backdrop-blur mb-6">
        <CardHeader>
          <CardTitle className="text-lg">選擇股票</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {SYMBOLS.map((symbol) => (
              <button
                key={symbol.value}
                onClick={() => setSelectedSymbol(symbol.value)}
                className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
                  selectedSymbol === symbol.value
                    ? 'bg-gradient-to-r from-[#667eea] to-[#764ba2] text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {symbol.label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Chart */}
      <Card className="bg-white/95 backdrop-blur">
        <CardHeader>
          <CardTitle className="text-xl">
            {SYMBOLS.find(s => s.value === selectedSymbol)?.label} - 30 天走勢
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
      <div className="mt-6 text-center text-white/80 text-sm">
        <p>資料來源: Alpha Vantage API</p>
      </div>
    </div>
  );
}
