import { parseMapMessage } from '../domain/mapMessage';

describe('map bridge input', () => {
  it('accepts explicit coordinates and map availability messages', () => {
    expect(parseMapMessage('{"type":"PIN","lat":6.5,"lng":80}')).toEqual({
      type: 'PIN',
      point: { lat: 6.5, lng: 80 },
    });
    expect(parseMapMessage('{"type":"READY"}')).toEqual({ type: 'READY' });
    expect(parseMapMessage('{"type":"ERROR"}')).toEqual({ type: 'ERROR' });
  });
  it.each([
    '',
    'oops',
    'null',
    '[]',
    'true',
    '6',
    '"PIN"',
    '{}',
    '{"type":"UNKNOWN"}',
    '{"type":"PIN"}',
    '{"type":"PIN","lat":"6","lng":80}',
    '{"type":"PIN","lat":6,"lng":null}',
    '{"type":"PIN","lat":91,"lng":80}',
    '{"type":"PIN","lat":6,"lng":181}',
    '{"type":"PIN","lat":1e400,"lng":80}',
    '{"type":"PIN","lat":6,"lng":1e400}',
  ])('ignores malformed or impossible coordinates: %s', (data) => {
    expect(parseMapMessage(data)).toBeUndefined();
  });
  it('allows geographic boundaries; Sri Lanka validation remains at submission', () => {
    expect(parseMapMessage('{"type":"PIN","lat":-90,"lng":-180}')).toEqual({
      type: 'PIN',
      point: { lat: -90, lng: -180 },
    });
  });
});
