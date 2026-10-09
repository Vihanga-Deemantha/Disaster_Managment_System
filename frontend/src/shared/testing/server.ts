import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';

/**
 * The fake API. Tests add handlers with `server.use(...)`; any request without one fails the test.
 *
 * The handlers given here survive `resetHandlers()`: they answer what each module's opening screen asks
 * for with "nothing yet", so tests of the shell, sign-in and routing (which may end while such a request
 * is still in flight) do not have to know about every module. A test that cares registers its own
 * handler, which takes priority. Add your module's opening list here when you build its first screen.
 */
export const server = setupServer(
  http.get('/api/warnings', () => HttpResponse.json([])),
  // The demo gateway toggles that screens show while developing (UC-1).
  http.get('/api/dev/gateways', () =>
    HttpResponse.json({ PUSH: 'OK', SMS: 'OK', WHATSAPP: 'OK', EMAIL: 'OK' }),
  ),
);
