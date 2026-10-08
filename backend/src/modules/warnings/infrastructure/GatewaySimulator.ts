import { CHANNELS, type Channel } from '@shared/contracts/enums';

export const GATEWAY_MODES = ['OK', 'FAIL_SOME', 'DOWN'] as const;
export type GatewayMode = (typeof GATEWAY_MODES)[number];

/**
 * The switchboard of the four simulated gateways (push, SMS, WhatsApp, e-mail are simulated behind
 * ports, master plan section 11). A demo flips a mode through the dev routes to show A1, E2 and E3.
 */
export class GatewaySimulator {
  private readonly modes = Object.fromEntries(
    CHANNELS.map((channel) => [channel, 'OK' as GatewayMode]),
  ) as Record<Channel, GatewayMode>;

  modeOf(channel: Channel): GatewayMode {
    return this.modes[channel];
  }

  setMode(channel: Channel, mode: GatewayMode): void {
    this.modes[channel] = mode;
  }

  snapshot(): Record<Channel, GatewayMode> {
    return { ...this.modes };
  }
}

/** A small, stable string hash (djb2), so "random" failures are the same on every run. */
export function hashOf(text: string): number {
  let hash = 5381;
  for (const character of text) hash = (hash * 33 + (character.codePointAt(0) as number)) >>> 0;
  return hash;
}

/**
 * `FAIL_SOME`: about a third of the citizens fail the first try on a channel, and every retry works.
 * Deterministic, so the same demo behaves the same way every time. The channel is part of the hash, so
 * Push and SMS fail for different citizens.
 */
export const failsOnFirstTry = (
  channel: Channel,
  citizenId: string,
  attemptNumber: number,
): boolean => attemptNumber === 1 && hashOf(`${channel}:${citizenId}`) % 3 === 0;
