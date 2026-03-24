'use client';

import { useEffect, useState } from 'react';

/** 顯示使用者本地時間（避免 SSR 顯示伺服器時區） */
export default function LocalTimestamp() {
  const [time, setTime] = useState<string>('');

  useEffect(() => {
    setTime(new Date().toLocaleString('zh-TW'));
  }, []);

  if (!time) return <span className="text-transparent">loading</span>;

  return <>{time}</>;
}
