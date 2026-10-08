import { transferableAbortController } from 'node:util';
import { beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@/shared/testing/server';
import { event, emptyDashboard } from './fixtures';

/** Node 24 fetch requires its own AbortSignal; jsdom supplies a separate browser constructor. */
const native = transferableAbortController();
native.abort();
const NativeDOMException = (native.signal.reason as DOMException)
  .constructor as typeof DOMException;
class CrossRealmDOMException extends NativeDOMException {
  static override [Symbol.hasInstance](value: unknown) {
    return Object.prototype.toString.call(value) === '[object DOMException]';
  }
}
Object.assign(globalThis, {
  AbortController: native.constructor,
  AbortSignal: native.signal.constructor,
  DOMException: CrossRealmDOMException,
});
beforeEach(() => {
  server.use(
    http.get('/api/analytics/events', () => HttpResponse.json({ events: [event] })),
    http.get('/api/analytics/summary', () => HttpResponse.json(emptyDashboard)),
    http.get('/api/analytics/reports', () => HttpResponse.json({ reports: [] })),
  );
});
