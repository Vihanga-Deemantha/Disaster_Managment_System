export interface MapPoint {
  lat: number;
  lng: number;
}
export type MapMessage = { type: 'PIN'; point: MapPoint } | { type: 'READY' | 'ERROR' };

export function parseMapMessage(data: string): MapMessage | undefined {
  try {
    const value: unknown = JSON.parse(data);
    if (!value || typeof value !== 'object') return undefined;
    const message = value as Record<string, unknown>;
    if (isStatus(message.type)) return { type: message.type };
    if (
      message.type !== 'PIN' ||
      !validCoordinate(message.lat, 90) ||
      !validCoordinate(message.lng, 180)
    )
      return undefined;
    return { type: 'PIN', point: { lat: message.lat as number, lng: message.lng as number } };
  } catch {
    return undefined;
  }
}
function isStatus(value: unknown): value is 'READY' | 'ERROR' {
  return value === 'READY' || value === 'ERROR';
}
function validCoordinate(value: unknown, limit: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= limit;
}
