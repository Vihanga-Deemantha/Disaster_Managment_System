import { Spinner } from '@/shared/ui/Spinner';

/** Shown while a module's screens are loading on first visit (slow connections should not see a blank page). */
export function RouteFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-paper text-navy-800">
      <Spinner />
    </div>
  );
}
