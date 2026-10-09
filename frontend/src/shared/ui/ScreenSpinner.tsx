import { Spinner } from './Spinner';

/** A full-screen wait on the brand's navy, shown while the app checks whether someone is signed in. */
export function ScreenSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-navy-900 text-white">
      <Spinner />
    </div>
  );
}
