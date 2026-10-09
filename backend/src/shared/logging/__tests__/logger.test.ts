import { Writable } from 'node:stream';
import { createLogger, nullLogger, pinoOptions } from '../Logger';

function capture() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, done) {
      lines.push(chunk.toString());
      done();
    },
  });
  const entries = () => lines.map((line) => JSON.parse(line) as Record<string, unknown>);
  return { stream, entries, raw: () => lines.join('') };
}

describe('createLogger', () => {
  it('writes structured JSON with the message, level and context', () => {
    const { stream, entries } = capture();
    const logger = createLogger({ level: 'debug', pretty: false }, stream);

    logger.debug('d', { n: 1 });
    logger.info('i', { n: 2 });
    logger.warn('w', { n: 3 });
    logger.error('e', { n: 4 });

    expect(entries().map((e) => [e.level, e.msg, e.n])).toEqual([
      [20, 'd', 1],
      [30, 'i', 2],
      [40, 'w', 3],
      [50, 'e', 4],
    ]);
  });

  it('logs a message with no context at every level', () => {
    const { stream, entries } = capture();
    const logger = createLogger({ level: 'debug', pretty: false }, stream);

    logger.debug('plain');
    logger.info('plain');
    logger.warn('plain');
    logger.error('plain');

    expect(entries().map((e) => [e.msg, e.level])).toEqual([
      ['plain', 20],
      ['plain', 30],
      ['plain', 40],
      ['plain', 50],
    ]);
  });

  it('respects the configured level', () => {
    const { stream, entries } = capture();
    const logger = createLogger({ level: 'warn', pretty: false }, stream);

    logger.info('hidden');
    logger.warn('shown');

    expect(entries().map((e) => e.msg)).toEqual(['shown']);
  });

  it('never lets a password, token or NIC reach a log line, at any depth', () => {
    const { stream, raw } = capture();
    const logger = createLogger({ level: 'info', pretty: false }, stream);

    logger.info('login attempt', {
      password: 'hunter2-plain',
      nic: '853400937V',
      token: 'tok-1',
      refreshToken: 'rt-1',
      accessToken: 'at-1',
      body: {
        password: 'nested-pass',
        currentPassword: 'cur-pass',
        newPassword: 'new-pass',
        nic: '199001234567',
      },
      user: { token: 'nested-token', refreshToken: 'nested-rt', accessToken: 'nested-at' },
      headers: { cookie: 'sz_access=secret-jwt', authorization: 'Bearer secret-bearer' },
      harmless: 'kept',
    });

    for (const secret of [
      'hunter2-plain',
      '853400937V',
      'tok-1',
      'rt-1',
      'at-1',
      'nested-pass',
      'cur-pass',
      'new-pass',
      '199001234567',
      'nested-token',
      'nested-rt',
      'nested-at',
      'secret-jwt',
      'secret-bearer',
    ]) {
      expect(raw()).not.toContain(secret);
    }
    expect(raw()).toContain('"harmless":"kept"');
    expect(raw()).toContain('[redacted]');
  });
});

describe('pinoOptions', () => {
  it('uses plain JSON in production and a pretty transport only when asked', () => {
    expect(pinoOptions({ level: 'info', pretty: false }).transport).toBeUndefined();
    expect(pinoOptions({ level: 'info', pretty: true }).transport).toEqual({
      target: 'pino-pretty',
      options: { colorize: true },
    });
  });

  it('carries the level through', () => {
    expect(pinoOptions({ level: 'error', pretty: false }).level).toBe('error');
  });
});

describe('nullLogger', () => {
  it('accepts every call and does nothing', () => {
    expect(() => {
      nullLogger.debug('x');
      nullLogger.info('x');
      nullLogger.warn('x');
      nullLogger.error('x');
    }).not.toThrow();
  });
});
