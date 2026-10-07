import { setupServer } from 'msw/node';

/** The fake API. Tests add handlers with `server.use(...)`; any request without one fails the test. */
export const server = setupServer();
