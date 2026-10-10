import { responseCountdown, useCurrentTime } from './liveUpdates';
import { Clock3 } from 'lucide-react';
export function ResponseDeadline({ deadline }: { deadline: string }) {
  const now = useCurrentTime();
  const minutes = (new Date(deadline).getTime() - now) / 60_000;
  return (
    <p
      className={`mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold tabular-nums ${minutes <= 5 ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-800'}`}
    >
      <Clock3 size={16} aria-hidden="true" />
      Owner response: {responseCountdown(deadline, now)}
    </p>
  );
}
