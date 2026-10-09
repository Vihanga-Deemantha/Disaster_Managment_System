import { useEffect, useState } from 'react';
export function useResourcePolling(reload: () => void) {
  useEffect(() => {
    const timer = setInterval(reload, 30_000);
    return () => clearInterval(timer);
  }, [reload]);
}
export function useCurrentTime() {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return now;
}
export function responseCountdown(deadline: string, now: number) {
  const seconds = Math.max(0, Math.ceil((new Date(deadline).getTime() - now) / 1000));
  return seconds === 0
    ? 'Deadline passed · waiting for expiry update'
    : `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s remaining`;
}
