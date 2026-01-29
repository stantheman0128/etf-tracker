'use client';

import { useState, useEffect, useRef } from 'react';

interface UseAnimatedNumberOptions {
  duration?: number;  // 動畫持續時間（毫秒）
  decimals?: number;  // 小數位數
}

export function useAnimatedNumber(
  targetValue: number,
  options: UseAnimatedNumberOptions = {}
) {
  const { duration = 500, decimals = 0 } = options;
  const [displayValue, setDisplayValue] = useState(targetValue);
  const animationRef = useRef<number | null>(null);
  const previousValueRef = useRef(targetValue);

  useEffect(() => {
    // 如果值沒變化，不需要動畫
    if (previousValueRef.current === targetValue) return;

    const startValue = previousValueRef.current;
    const difference = targetValue - startValue;
    const startTime = performance.now();

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // 使用 easeOutExpo 緩動函數，讓動畫更自然
      const easeProgress = progress === 1 
        ? 1 
        : 1 - Math.pow(2, -10 * progress);

      const currentValue = startValue + difference * easeProgress;
      
      setDisplayValue(
        decimals > 0 
          ? parseFloat(currentValue.toFixed(decimals))
          : Math.round(currentValue)
      );

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      } else {
        previousValueRef.current = targetValue;
      }
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [targetValue, duration, decimals]);

  return displayValue;
}
