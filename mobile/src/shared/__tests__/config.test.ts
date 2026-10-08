import { resolveApiBaseUrl, type ApiAddressInputs } from '../config';

const NOTHING_KNOWN: ApiAddressInputs = {
  explicit: undefined,
  dev: true,
  web: false,
  browserHost: undefined,
  metroHost: undefined,
};
const resolve = (changes: Partial<ApiAddressInputs>) =>
  resolveApiBaseUrl({ ...NOTHING_KNOWN, ...changes });

describe('resolveApiBaseUrl: where the API is', () => {
  it('uses EXPO_PUBLIC_API_URL when it is set, without a trailing slash, whatever else is known', () => {
    expect(
      resolve({ explicit: 'http://api.example:4000//', metroHost: '10.43.174.188:8081' }),
    ).toBe('http://api.example:4000');
  });

  it('ignores an EXPO_PUBLIC_API_URL that is empty or only spaces', () => {
    expect(resolve({ explicit: '   ', metroHost: '10.43.174.188:8081' })).toBe(
      'http://10.43.174.188:4000',
    );
    expect(resolve({ explicit: '', metroHost: '10.43.174.188:8081' })).toBe(
      'http://10.43.174.188:4000',
    );
  });

  it.each([
    ['an address with a port', '10.43.174.188:8081', 'http://10.43.174.188:4000'],
    ['an address with no port', '10.43.174.188', 'http://10.43.174.188:4000'],
    ['a name', 'my-laptop.local:8081', 'http://my-laptop.local:4000'],
    ['localhost', 'localhost:8081', 'http://localhost:4000'],
    ['an IPv6 address', '[fe80::1]:8081', 'http://[fe80::1]:4000'],
    ['an address with spaces around it', '  10.0.0.5:8081 ', 'http://10.0.0.5:4000'],
  ])(
    'on a phone while developing, the API is on the machine Metro runs on (%s)',
    (_, metro, url) => {
      expect(resolve({ metroHost: metro })).toBe(url);
    },
  );

  it('in a browser while developing, the API is on the browser’s own host, not Metro’s', () => {
    expect(resolve({ web: true, browserHost: 'localhost', metroHost: '10.0.0.5:8081' })).toBe(
      'http://localhost:4000',
    );
  });

  it('does not guess once the app is built for release', () => {
    expect(
      resolve({ dev: false, web: true, browserHost: 'localhost', metroHost: '10.0.0.5:8081' }),
    ).toBe('http://10.0.2.2:4000');
    expect(resolve({ dev: false, metroHost: '10.0.0.5:8081' })).toBe('http://10.0.2.2:4000');
  });

  it('falls back to the Android emulator’s name for the laptop when nothing is known', () => {
    expect(resolve({})).toBe('http://10.0.2.2:4000');
    expect(resolve({ web: true })).toBe('http://10.0.2.2:4000');
    expect(resolve({ metroHost: '' })).toBe('http://10.0.2.2:4000');
  });

  it('does not take a bare port for a host', () => {
    expect(resolve({ metroHost: ':8081' })).toBe('http://10.0.2.2:4000');
  });
});

describe('API_BASE_URL: the rule wired to the real environment', () => {
  const original = process.env.EXPO_PUBLIC_API_URL;

  afterEach(() => {
    jest.dontMock('expo-constants');
    jest.dontMock('react-native');
    jest.resetModules();
    if (original === undefined) delete process.env.EXPO_PUBLIC_API_URL;
    else process.env.EXPO_PUBLIC_API_URL = original;
    delete (globalThis as { location?: unknown }).location;
  });

  function load(env: {
    os: string;
    hostUri?: string;
    explicit?: string;
    hostname?: string;
  }): string {
    jest.resetModules();
    jest.doMock('expo-constants', () => ({
      __esModule: true,
      default: { expoConfig: env.hostUri === undefined ? null : { hostUri: env.hostUri } },
    }));
    jest.doMock('react-native', () => ({ Platform: { OS: env.os } }));
    if (env.explicit === undefined) delete process.env.EXPO_PUBLIC_API_URL;
    else process.env.EXPO_PUBLIC_API_URL = env.explicit;
    if (env.hostname !== undefined) {
      (globalThis as { location?: unknown }).location = { hostname: env.hostname };
    }
    return jest.requireActual<{ API_BASE_URL: string }>('../config').API_BASE_URL;
  }

  it('on a phone: the address Expo Go loaded the app from', () => {
    expect(load({ os: 'ios', hostUri: '10.43.174.188:8081' })).toBe('http://10.43.174.188:4000');
  });

  it('in a browser: the address of the page', () => {
    expect(load({ os: 'web', hostname: 'localhost', hostUri: '10.43.174.188:8081' })).toBe(
      'http://localhost:4000',
    );
  });

  it('with an explicit EXPO_PUBLIC_API_URL: that', () => {
    expect(
      load({ os: 'ios', hostUri: '10.43.174.188:8081', explicit: 'http://api.example:4000' }),
    ).toBe('http://api.example:4000');
  });

  it('with no setting and no development server address: the emulator alias', () => {
    expect(load({ os: 'android' })).toBe('http://10.0.2.2:4000');
  });
});
