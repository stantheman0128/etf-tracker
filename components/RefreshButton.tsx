'use client';

import { RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function RefreshButton() {
  const router = useRouter();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    router.refresh();
    // 給予視覺回饋，1.5 秒後結束動畫
    setTimeout(() => setIsRefreshing(false), 1500);
  };

  return (
    <button
      onClick={handleRefresh}
      disabled={isRefreshing}
      className="flex items-center gap-2 px-4 py-2 bg-white/90 hover:bg-white rounded-lg shadow-md transition-all disabled:opacity-50"
      title="重新整理資料"
    >
      <RefreshCw
        size={18}
        className={isRefreshing ? 'animate-spin' : ''}
      />
      <span className="text-sm font-medium text-gray-700">
        {isRefreshing ? '更新中...' : '重新整理'}
      </span>
    </button>
  );
}
