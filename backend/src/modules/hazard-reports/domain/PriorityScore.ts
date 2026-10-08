import type { ClusteringConfig } from './ClusteringConfig';
import type { Band } from './types';

function bandFor(value: number, bands: ClusteringConfig['bands']): Band {
  if (value >= bands.high) return 'HIGH';
  if (value >= bands.elevated) return 'ELEVATED';
  if (value >= bands.moderate) return 'MODERATE';
  return 'LOW';
}

/** Value object: a 0–100 priority and the band it falls in. */
export class PriorityScore {
  private constructor(
    readonly value: number,
    readonly band: Band,
  ) {}

  static of(raw: number, bands: ClusteringConfig['bands']): PriorityScore {
    const value = Math.max(0, Math.min(100, Math.round(raw)));
    return new PriorityScore(value, bandFor(value, bands));
  }
}
