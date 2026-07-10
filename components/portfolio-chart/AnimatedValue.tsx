import { useAnimatedNumber } from '@/lib/hooks/useAnimatedNumber';

// 數字跳動顯示組件
export function AnimatedValue({
  value,
  prefix = '',
  suffix = '',
  className = '',
  showSign = false,
}: {
  value: number;
  prefix?: string;
  suffix?: string;
  className?: string;
  showSign?: boolean;
}) {
  const animatedValue = useAnimatedNumber(value, { duration: 400 });
  const sign = showSign && value >= 0 ? '+' : '';

  return (
    <span className={className}>
      {sign}{prefix}{Math.round(animatedValue).toLocaleString()}{suffix}
    </span>
  );
}
