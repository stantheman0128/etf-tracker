'use client';

import { RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

export default function RefreshButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleRefresh = () => {
    startTransition(() => {
      router.refresh();
    });
  };

  const isRefreshing = isPending;

  return (
    <button
      onClick={handleRefresh}
      disabled={isRefreshing}
      className="
        group flex items-center gap-2 px-4 py-2.5 
        bg-gradient-to-r from-blue-500 to-purple-500 
        hover:from-blue-600 hover:to-purple-600 
        text-white rounded-xl shadow-lg 
        hover:shadow-xl hover:scale-105
        transition-all duration-200 
        disabled:opacity-70 disabled:cursor-not-allowed
        disabled:hover:scale-100
      "
      title="重新整理資料"
    >
      <RefreshCw
        size={18}
        className={`transition-transform ${isRefreshing ? 'animate-spin' : 'group-hover:rotate-180'}`}
      />
      <span className="text-sm font-semibold">
        {isRefreshing ? '更新中...' : '刷新'}
      </span>
    </button>
  );
}
