import { CHANNELS } from '@shared/contracts/enums';
import {
  failsOnFirstTry,
  GATEWAY_MODES,
  GatewaySimulator,
  hashOf,
} from '../../infrastructure/GatewaySimulator';

const ids = Array.from({ length: 300 }, (_, i) => `c-${i}`);

describe('UC-1 E2 / master plan 11: GatewaySimulator', () => {
  it('starts with every gateway working', () => {
    const simulator = new GatewaySimulator();

    for (const channel of CHANNELS) expect(simulator.modeOf(channel)).toBe('OK');
    expect(GATEWAY_MODES).toEqual(['OK', 'FAIL_SOME', 'DOWN']);
  });

  it('switches one gateway at a time', () => {
    const simulator = new GatewaySimulator();

    simulator.setMode('SMS', 'DOWN');
    simulator.setMode('PUSH', 'FAIL_SOME');

    expect(simulator.snapshot()).toEqual({
      PUSH: 'FAIL_SOME',
      SMS: 'DOWN',
      WHATSAPP: 'OK',
      EMAIL: 'OK',
    });
  });

  it('gives out a copy, so a caller cannot flip a gateway by editing the snapshot', () => {
    const simulator = new GatewaySimulator();

    simulator.snapshot().PUSH = 'DOWN';

    expect(simulator.modeOf('PUSH')).toBe('OK');
  });
});

describe('UC-1 A1: the simulated failures are deterministic', () => {
  it('hashes the same text to the same number every time, and different texts differently', () => {
    expect(hashOf('')).toBe(5381);
    expect(hashOf('a')).toBe(5381 * 33 + 97);
    expect(hashOf('PUSH:c-1')).toBe(hashOf('PUSH:c-1'));
    expect(hashOf('PUSH:c-1')).not.toBe(hashOf('PUSH:c-2'));
  });

  it('keeps the hash a small non-negative whole number however long the text is', () => {
    const hash = hashOf('x'.repeat(500));

    expect(Number.isInteger(hash)).toBe(true);
    expect(hash).toBeGreaterThanOrEqual(0);
    expect(hash).toBeLessThan(2 ** 32);
  });

  it('fails the first try for about a third of the citizens', () => {
    const failing = ids.filter((id) => failsOnFirstTry('PUSH', id, 1)).length;

    expect(failing).toBeGreaterThan(80);
    expect(failing).toBeLessThan(120);
  });

  it('never fails a retry, so one retry always clears a simulated failure', () => {
    expect(ids.some((id) => failsOnFirstTry('PUSH', id, 2))).toBe(false);
    expect(ids.some((id) => failsOnFirstTry('PUSH', id, 3))).toBe(false);
  });

  it('fails different citizens on different channels, so a citizen is rarely cut off from both', () => {
    const both = ids.filter(
      (id) => failsOnFirstTry('PUSH', id, 1) && failsOnFirstTry('SMS', id, 1),
    );
    const onlyPush = ids.filter(
      (id) => failsOnFirstTry('PUSH', id, 1) && !failsOnFirstTry('SMS', id, 1),
    );

    expect(onlyPush.length).toBeGreaterThan(0);
    expect(both.length).toBeLessThan(ids.filter((id) => failsOnFirstTry('PUSH', id, 1)).length);
  });
});
