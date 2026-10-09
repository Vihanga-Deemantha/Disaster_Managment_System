import { responseCountdown, useCurrentTime } from './liveUpdates';
export function ResponseDeadline({ deadline }: { deadline: string }) {
  const now = useCurrentTime();
  return (
    <p className="mt-2 text-sm font-bold text-accent-700">
      Owner response: {responseCountdown(deadline, now)}
    </p>
  );
}
