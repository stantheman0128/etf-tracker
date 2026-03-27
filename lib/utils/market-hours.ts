/**
 * Market hour utilities - DST-aware UTC timestamps for TW/US markets
 */

interface MarketWindow {
  market: string;
  label: string;
  openUTC: number;   // Unix timestamp (seconds)
  closeUTC: number;   // Unix timestamp (seconds)
  color: string;
}

/**
 * Detect US Eastern timezone UTC offset for a given date.
 * Returns -4 for EDT (Mar-Nov) or -5 for EST (Nov-Mar).
 */
function getUSEasternOffset(date: Date): number {
  // Format the date in America/New_York and extract the UTC offset
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    timeZoneName: 'shortOffset',
  });
  const parts = formatter.formatToParts(date);
  const tzPart = parts.find(p => p.type === 'timeZoneName');
  // tzPart.value is like "GMT-5" or "GMT-4"
  if (tzPart?.value) {
    const match = tzPart.value.match(/GMT([+-]\d+)/);
    if (match) return parseInt(match[1], 10);
  }
  return -5; // fallback to EST
}

/**
 * Get market open/close windows in UTC for a specific date.
 * Returns array of MarketWindow with Unix timestamps.
 *
 * Taiwan: 09:00-13:30 (UTC+8, no DST)
 * US: 09:30-16:00 (America/New_York, DST-aware)
 */
export function getMarketHoursUTC(dateStr: string): MarketWindow[] {
  const [y, m, d] = dateStr.split('-').map(Number);
  const windows: MarketWindow[] = [];

  // Check day of week (0=Sun, 6=Sat)
  const dateObj = new Date(y, m - 1, d);
  const dow = dateObj.getDay();
  const isWeekday = dow >= 1 && dow <= 5;

  if (!isWeekday) return windows;

  // Taiwan: 09:00-13:30 CST (UTC+8) -> 01:00-05:30 UTC
  const twOpenUTC = Date.UTC(y, m - 1, d, 1, 0, 0) / 1000;
  const twCloseUTC = Date.UTC(y, m - 1, d, 5, 30, 0) / 1000;
  windows.push({
    market: 'TW',
    label: '台股',
    openUTC: twOpenUTC,
    closeUTC: twCloseUTC,
    color: '#ef4444', // red
  });

  // US: 09:30-16:00 Eastern (DST-aware)
  const usOffset = getUSEasternOffset(dateObj);
  const usOpenHourUTC = 9.5 - usOffset; // 9:30 local -> UTC
  const usCloseHourUTC = 16 - usOffset;  // 16:00 local -> UTC
  const usOpenUTC = Date.UTC(y, m - 1, d, Math.floor(usOpenHourUTC), (usOpenHourUTC % 1) * 60, 0) / 1000;
  const usCloseUTC = Date.UTC(y, m - 1, d, Math.floor(usCloseHourUTC), 0, 0) / 1000;
  windows.push({
    market: 'US',
    label: '美股',
    openUTC: usOpenUTC,
    closeUTC: usCloseUTC,
    color: '#3b82f6', // blue
  });

  return windows;
}
