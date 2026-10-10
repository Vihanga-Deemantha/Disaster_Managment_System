import { useCallback, useEffect, useRef, useState } from 'react';
import type { DraftLocation } from '../domain/types';

export interface Point {
  lat: number;
  lng: number;
}
export interface LocationProvider {
  requestPermission(): Promise<boolean>;
  current(): Promise<Point & { accuracyM?: number }>;
  lastKnown(): Promise<Point | undefined>;
}
type ManualReason = 'DENIED' | 'TIMEOUT' | 'UNAVAILABLE' | 'ADJUSTED';
export type LocationState =
  | { status: 'LOCATING' }
  | { status: 'READY'; location: DraftLocation }
  | {
      status: 'MANUAL';
      reason: ManualReason;
      center: Point;
      lastKnown?: Point;
      location?: DraftLocation;
    };
const COLOMBO = { lat: 6.9271, lng: 79.8612 };

function startRequest(
  provider: LocationProvider,
  timeoutMs: number,
  update: (state: LocationState) => void,
): () => void {
  let active = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const set = (state: LocationState) => {
    if (active) update(state);
  };
  const manual = (reason: ManualReason) => {
    set({ status: 'MANUAL', reason, center: COLOMBO });
    void provider
      .lastKnown()
      .then((center) => {
        if (center) set({ status: 'MANUAL', reason, center, lastKnown: center });
      })
      .catch(() => undefined);
  };
  async function locate(): Promise<void> {
    try {
      if (!(await provider.requestPermission())) {
        manual('DENIED');
        return;
      }
      if (!active) return;
      const timeout = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('LOCATION_TIMEOUT')), timeoutMs);
      });
      const point = await Promise.race([provider.current(), timeout]);
      set({ status: 'READY', location: { ...point, source: 'GPS' } });
    } catch (error) {
      if (active)
        manual(
          error instanceof Error && error.message === 'LOCATION_TIMEOUT'
            ? 'TIMEOUT'
            : 'UNAVAILABLE',
        );
    } finally {
      clearTimeout(timer);
    }
  }
  set({ status: 'LOCATING' });
  void locate();
  return () => {
    active = false;
    clearTimeout(timer);
  };
}

export function useCurrentLocation(provider: LocationProvider, timeoutMs = 10_000) {
  const [state, setState] = useState<LocationState>({ status: 'LOCATING' });
  const [attempt, setAttempt] = useState(0);
  const cancel = useRef<() => void>(() => undefined);
  useEffect(() => {
    cancel.current = startRequest(provider, timeoutMs, setState);
    return cancel.current;
  }, [provider, timeoutMs, attempt]);
  const retry = useCallback(() => {
    cancel.current();
    setAttempt((value) => value + 1);
  }, []);
  const pin = useCallback(({ lat, lng }: Point) => {
    cancel.current();
    setState({
      status: 'MANUAL',
      reason: 'ADJUSTED',
      center: { lat, lng },
      location: { lat, lng, source: 'MANUAL' },
    });
  }, []);
  return { state, retry, pin };
}
