import { useCallback, useState } from 'react';

export type GeoStatus = 'idle' | 'detecting' | 'denied' | 'unsupported';

/** Reads the device location once, on request. Coordinates are rounded to about a metre. */
export function useGeolocation(onPosition: (lat: string, lng: string) => void) {
  const [status, setStatus] = useState<GeoStatus>('idle');

  const request = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setStatus('unsupported');
      return;
    }
    setStatus('detecting');
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setStatus('idle');
        onPosition(coords.latitude.toFixed(5), coords.longitude.toFixed(5));
      },
      () => setStatus('denied'),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }, [onPosition]);

  return { status, request };
}
