import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
import { cleanup, configure } from '@testing-library/react';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { clearOfflineData } from '@/shared/offline/db';
import { server } from './server';

// `findBy…` and `waitFor` wait up to one second by default. The first visit to a lazily loaded screen
// has to compile it, which can take longer on a busy CI machine; they still return the moment the
// element appears, so a fast machine loses nothing.
configure({ asyncUtilTimeout: 5000 });

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));

afterEach(async () => {
  cleanup();
  server.resetHandlers();
  await clearOfflineData();
  localStorage.clear();
});

afterAll(() => server.close());
