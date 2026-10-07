import type { RegisterInput } from '../../contracts/auth';
import { TEST_PASSWORD } from '../../testing/constants';
import { DuplicateError } from '../application/ports';
import { createAuthHarness, type AuthHarness } from '../testing/authHarness';

const HOUR = 3_600_000;
const MINUTE = 60_000;

const registration = (overrides: Partial<RegisterInput> = {}): RegisterInput => ({
  nic: '199001234567',
  fullName: 'Test Citizen',
  phone: '+94771234567',
  password: TEST_PASSWORD,
  homeLocation: { lat: 7.0873, lng: 79.9925 },
  district: 'GAMPAHA',
  preferredLanguage: 'SI',
  whatsappOptIn: false,
  emailOptIn: false,
  confirmDistrictMismatch: false,
  ...overrides,
});

const loginAs = (h: AuthHarness, identifier: string, password = TEST_PASSWORD) =>
  h.service.login({ identifier, password }, h.client);

describe('Auth §7.1.2 register', () => {
  it('creates a citizen, derives the river basin and signs them in', async () => {
    const h = createAuthHarness({ basinId: 'basin-kelani' });

    const result = await h.service.register(registration(), h.client);

    expect(result.user).toMatchObject({
      role: 'CITIZEN',
      displayName: 'Test Citizen',
      phone: '+94771234567',
      district: 'GAMPAHA',
      riverBasinId: 'basin-kelani',
      preferredLanguage: 'SI',
    });
    expect(result.tokens.accessToken).toEqual(expect.any(String));
    expect(result.tokens.refreshToken).toBe('refresh-token-1');
    expect(h.audit.actions()).toEqual(['auth.register']);
  });

  it('shows the NIC only masked and stores it encrypted, never as typed', async () => {
    const h = createAuthHarness();

    const result = await h.service.register(registration({ nic: '853400937V' }), h.client);

    expect(result.user.nicMasked).toBe('*******37V');
    const profile = [...h.profiles.profiles.values()][0];
    expect(profile?.nicEncrypted).not.toBe('853400937V');
    expect(JSON.stringify(result)).not.toContain('853400937');
  });

  it('stores a password hash, never the password', async () => {
    const h = createAuthHarness();

    await h.service.register(registration(), h.client);

    const user = [...h.users.users.values()][0];
    expect(user?.passwordHash).not.toBe(TEST_PASSWORD);
    expect(JSON.stringify([...h.users.users.values()])).not.toContain(TEST_PASSWORD);
  });

  it('rejects a second registration with the same phone number', async () => {
    const h = createAuthHarness();
    await h.service.register(registration(), h.client);

    await expect(
      h.service.register(registration({ nic: '198512345678' }), h.client),
    ).rejects.toMatchObject({ code: 'PHONE_ALREADY_REGISTERED' });
  });

  it('rejects a duplicate NIC even when the first card was typed in the other format', async () => {
    const h = createAuthHarness();
    await h.service.register(registration({ nic: '853400937V' }), h.client);

    await expect(
      h.service.register(registration({ nic: '198534000937', phone: '+94772222222' }), h.client),
    ).rejects.toMatchObject({ code: 'NIC_ALREADY_REGISTERED' });
  });

  it('creates nothing when the NIC is rejected', async () => {
    const h = createAuthHarness();
    await h.service.register(registration(), h.client);

    await expect(
      h.service.register(registration({ phone: '+94772222222' }), h.client),
    ).rejects.toMatchObject({ code: 'NIC_ALREADY_REGISTERED' });

    expect(h.users.users.size).toBe(1);
    expect(h.sessions.sessions).toHaveLength(1);
  });

  it('turns a phone clash found only at insert time (a race) into the same conflict error', async () => {
    const h = createAuthHarness();
    jest.spyOn(h.users, 'create').mockRejectedValueOnce(new DuplicateError('phone'));

    await expect(h.service.register(registration(), h.client)).rejects.toMatchObject({
      code: 'PHONE_ALREADY_REGISTERED',
    });
  });

  it('removes the half-created user when a concurrent registration took the NIC first', async () => {
    const h = createAuthHarness();
    jest.spyOn(h.profiles, 'create').mockRejectedValueOnce(new DuplicateError('nicHash'));

    await expect(h.service.register(registration(), h.client)).rejects.toMatchObject({
      code: 'NIC_ALREADY_REGISTERED',
    });

    expect(h.users.users.size).toBe(0);
  });

  it('maps an email clash to its own conflict code', async () => {
    const h = createAuthHarness();
    jest.spyOn(h.users, 'create').mockRejectedValueOnce(new DuplicateError('email'));

    await expect(h.service.register(registration(), h.client)).rejects.toMatchObject({
      code: 'EMAIL_ALREADY_REGISTERED',
    });
  });

  it('lets an unexpected storage error through instead of disguising it as a conflict', async () => {
    const h = createAuthHarness();
    jest.spyOn(h.users, 'create').mockRejectedValueOnce(new Error('database is down'));

    await expect(h.service.register(registration(), h.client)).rejects.toThrow('database is down');
  });

  it('rejects a location outside Sri Lanka, even if the citizen confirms the district', async () => {
    const h = createAuthHarness();

    await expect(
      h.service.register(
        registration({ homeLocation: { lat: 51.5, lng: -0.12 }, confirmDistrictMismatch: true }),
        h.client,
      ),
    ).rejects.toMatchObject({ code: 'LOCATION_OUTSIDE_SRI_LANKA' });
  });

  it('suggests the nearest district when the pin is far from the one claimed', async () => {
    const h = createAuthHarness();

    await expect(
      h.service.register(
        registration({ homeLocation: { lat: 6.9271, lng: 79.8612 }, district: 'JAFFNA' }),
        h.client,
      ),
    ).rejects.toMatchObject({
      code: 'DISTRICT_LOCATION_MISMATCH',
      details: { suggestedDistrict: 'COLOMBO' },
    });
  });

  it('accepts the mismatch when the citizen explicitly confirms it', async () => {
    const h = createAuthHarness();

    const result = await h.service.register(
      registration({
        homeLocation: { lat: 6.9271, lng: 79.8612 },
        district: 'JAFFNA',
        confirmDistrictMismatch: true,
      }),
      h.client,
    );

    expect(result.user.district).toBe('JAFFNA');
  });

  it('tolerates a neighbouring district near a border (one of the two nearest)', async () => {
    const h = createAuthHarness();

    const result = await h.service.register(
      registration({ homeLocation: { lat: 6.9271, lng: 79.8612 }, district: 'GAMPAHA' }),
      h.client,
    );

    expect(result.user.district).toBe('GAMPAHA');
  });
});

describe('Auth §7.1.3 login', () => {
  it('signs a staff member in by email, ignoring case and spaces', async () => {
    const h = createAuthHarness();
    await h.addStaff({ role: 'DMC_OFFICER', email: 'officer@example.test' });

    const result = await loginAs(h, '  Officer@Example.TEST ');

    expect(result.user.role).toBe('DMC_OFFICER');
    expect(h.audit.actions()).toEqual(['auth.login.success']);
  });

  it.each(['0771234567', '+94771234567', '077 123 4567'])(
    'signs a citizen in by phone typed as %s',
    async (typed) => {
      const h = createAuthHarness();
      await h.addCitizen();

      const result = await loginAs(h, typed);

      expect(result.user.role).toBe('CITIZEN');
    },
  );

  it('carries scope claims in the access token: citizens by home location, staff as provisioned', async () => {
    const h = createAuthHarness({ basinId: 'basin-kalu' });
    await h.addCitizen();
    await h.addStaff({
      role: 'NGO_MANAGER',
      email: 'ngo@example.test',
      organizationId: 'org-1',
      organizationType: 'NGO',
    });

    const citizen = await loginAs(h, '0771234567');
    const ngo = await loginAs(h, 'ngo@example.test');

    expect(h.accessTokens.verify(citizen.tokens.accessToken)).toMatchObject({
      role: 'CITIZEN',
      district: 'GAMPAHA',
      riverBasinId: 'basin-kalu',
    });
    expect(h.accessTokens.verify(ngo.tokens.accessToken)).toMatchObject({
      role: 'NGO_MANAGER',
      organizationId: 'org-1',
      organizationType: 'NGO',
    });
  });

  it('treats an identifier that is neither an email nor a valid phone as an unknown account', async () => {
    const h = createAuthHarness();

    await expect(loginAs(h, 'just some words')).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });

    expect(h.throttle.states.has('login:just some words')).toBe(true);
  });

  it('gives a wrong password and an unknown account the same generic error', async () => {
    const h = createAuthHarness();
    await h.addStaff();

    const wrongPassword = loginAs(h, 'officer@example.test', 'not the password');
    const unknownAccount = loginAs(h, 'ghost@example.test');

    await expect(wrongPassword).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
      message: 'Invalid credentials.',
    });
    await expect(unknownAccount).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
      message: 'Invalid credentials.',
    });
  });

  it('spends one password verification whether or not the account exists (timing equalised)', async () => {
    const h = createAuthHarness();
    await h.addStaff();

    await loginAs(h, 'officer@example.test', 'wrong').catch(() => undefined);
    const afterKnown = h.hasher.verifications.length;
    await loginAs(h, 'ghost@example.test', 'wrong').catch(() => undefined);

    expect(h.hasher.verifications.length - afterKnown).toBe(1);
  });

  it('treats a disabled account like an unknown one', async () => {
    const h = createAuthHarness();
    const user = await h.addStaff();
    h.users.users.set(user.userId, { ...user, status: 'DISABLED' });

    await expect(loginAs(h, 'officer@example.test')).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });
  });

  it('records a failed login in the audit log without the password or the identifier', async () => {
    const h = createAuthHarness();
    await h.addStaff();

    await loginAs(h, 'officer@example.test', 'wrong password').catch(() => undefined);

    const entry = h.audit.find('auth.login.failure');
    expect(entry).toMatchObject({ ip: '203.0.113.7', userAgent: 'jest-agent' });
    expect(JSON.stringify(entry)).not.toContain('wrong password');
    expect(JSON.stringify(entry)).not.toContain('officer@example.test');
  });
});

describe('Auth §7.1.4 progressive delay instead of lockout', () => {
  const failTimes = async (h: AuthHarness, identifier: string, times: number) => {
    for (let i = 0; i < times; i += 1) {
      await loginAs(h, identifier, 'wrong').catch(() => undefined);
    }
  };

  it('allows three wrong passwords before any delay', async () => {
    const h = createAuthHarness();
    await h.addStaff();

    await failTimes(h, 'officer@example.test', 3);

    // The 3rd failure starts the delay, but the first three attempts were never blocked.
    expect(h.throttle.states.get('login:officer@example.test')?.failures).toBe(3);
  });

  it('makes the fourth attempt wait one second, even with the right password', async () => {
    const h = createAuthHarness();
    await h.addStaff();
    await failTimes(h, 'officer@example.test', 3);

    await expect(loginAs(h, 'officer@example.test')).rejects.toMatchObject({
      code: 'LOGIN_THROTTLED',
      retryAfterSeconds: 1,
    });
  });

  it('lets the right password in once the wait has passed, and resets the counter', async () => {
    const h = createAuthHarness();
    await h.addStaff();
    await failTimes(h, 'officer@example.test', 3);
    h.clock.advance(1000);

    await expect(loginAs(h, 'officer@example.test')).resolves.toBeDefined();

    expect(h.throttle.states.has('login:officer@example.test')).toBe(false);
  });

  it('doubles the wait with each further failure: 1 s, 2 s, 4 s', async () => {
    const h = createAuthHarness();
    await h.addStaff();
    await failTimes(h, 'officer@example.test', 3);

    h.clock.advance(1000);
    await failTimes(h, 'officer@example.test', 1);
    await expect(loginAs(h, 'officer@example.test')).rejects.toMatchObject({
      retryAfterSeconds: 2,
    });

    h.clock.advance(2000);
    await failTimes(h, 'officer@example.test', 1);
    await expect(loginAs(h, 'officer@example.test')).rejects.toMatchObject({
      retryAfterSeconds: 4,
    });
  });

  it('never makes anyone wait more than 30 seconds (an attacker cannot lock the officer out)', async () => {
    const h = createAuthHarness();
    await h.addStaff();
    h.throttle.states.set('login:officer@example.test', {
      failures: 50,
      lastFailedAt: h.clock.now(),
    });

    await expect(loginAs(h, 'officer@example.test')).rejects.toMatchObject({
      retryAfterSeconds: 30,
    });
  });

  it('counts down the wait as time passes', async () => {
    const h = createAuthHarness();
    await h.addStaff();
    h.throttle.states.set('login:officer@example.test', {
      failures: 6,
      lastFailedAt: h.clock.now(),
    });
    h.clock.advance(5500);

    await expect(loginAs(h, 'officer@example.test')).rejects.toMatchObject({
      retryAfterSeconds: 3,
    });
  });

  it('throttles an unknown identifier exactly like a real one, so existence is not revealed', async () => {
    const h = createAuthHarness();

    await failTimes(h, 'ghost@example.test', 3);

    await expect(loginAs(h, 'ghost@example.test')).rejects.toMatchObject({
      code: 'LOGIN_THROTTLED',
    });
  });

  it('does not throttle a different account because someone else failed', async () => {
    const h = createAuthHarness();
    await h.addStaff({ email: 'a@example.test' });
    await h.addStaff({ email: 'b@example.test' });
    await failTimes(h, 'a@example.test', 5);

    await expect(loginAs(h, 'b@example.test')).resolves.toBeDefined();
  });
});

describe('Auth §7.1.3 refresh rotation and reuse detection', () => {
  it('rotates the refresh token and keeps the same sign-in family', async () => {
    const h = createAuthHarness();
    await h.addStaff();
    const first = await loginAs(h, 'officer@example.test');

    const second = await h.service.refresh(first.tokens.refreshToken, h.client);

    expect(second.tokens.refreshToken).not.toBe(first.tokens.refreshToken);
    const [oldRow, newRow] = h.sessions.sessions;
    expect(oldRow?.rotatedAt).toEqual(h.clock.now());
    expect(newRow?.familyId).toBe(oldRow?.familyId);
    expect(second.user.role).toBe('DMC_OFFICER');
  });

  it('keeps the original password-entry time, so refreshing never counts as re-authenticating', async () => {
    const h = createAuthHarness();
    await h.addStaff();
    const first = await loginAs(h, 'officer@example.test');
    const signedInAt = h.clock.now();
    h.clock.advance(10 * MINUTE);

    const second = await h.service.refresh(first.tokens.refreshToken, h.client);

    expect(h.accessTokens.verify(second.tokens.accessToken).authenticatedAt).toEqual(signedInAt);
  });

  it('revokes the whole family when an old token is replayed after the grace period', async () => {
    const h = createAuthHarness();
    await h.addStaff();
    const first = await loginAs(h, 'officer@example.test');
    const second = await h.service.refresh(first.tokens.refreshToken, h.client);
    h.clock.advance(11_000);

    await expect(h.service.refresh(first.tokens.refreshToken, h.client)).rejects.toMatchObject({
      code: 'SESSION_REVOKED',
    });

    await expect(h.service.refresh(second.tokens.refreshToken, h.client)).rejects.toMatchObject({
      code: 'SESSION_REVOKED',
    });
    expect(h.audit.actions()).toContain('auth.refresh.reuse_detected');
  });

  it('treats a replay inside the grace window as a harmless race and keeps the session alive', async () => {
    const h = createAuthHarness();
    await h.addStaff();
    const first = await loginAs(h, 'officer@example.test');
    const second = await h.service.refresh(first.tokens.refreshToken, h.client);
    h.clock.advance(2000);

    await expect(h.service.refresh(first.tokens.refreshToken, h.client)).rejects.toMatchObject({
      code: 'TOKEN_ROTATED',
    });

    await expect(h.service.refresh(second.tokens.refreshToken, h.client)).resolves.toBeDefined();
    expect(h.audit.actions()).not.toContain('auth.refresh.reuse_detected');
  });

  it('reports a lost rotation race instead of issuing two live tokens', async () => {
    const h = createAuthHarness();
    await h.addStaff();
    const first = await loginAs(h, 'officer@example.test');
    jest.spyOn(h.sessions, 'markRotated').mockResolvedValueOnce(false);

    await expect(h.service.refresh(first.tokens.refreshToken, h.client)).rejects.toMatchObject({
      code: 'TOKEN_ROTATED',
    });
    expect(h.sessions.sessions).toHaveLength(1);
  });

  it('rejects an unknown refresh token', async () => {
    const h = createAuthHarness();

    await expect(h.service.refresh('made-up-token', h.client)).rejects.toMatchObject({
      code: 'SESSION_INVALID',
    });
  });

  it('rejects a refresh token whose sign-in was revoked', async () => {
    const h = createAuthHarness();
    await h.addStaff();
    const first = await loginAs(h, 'officer@example.test');
    await h.service.logout({ refreshToken: first.tokens.refreshToken }, h.client);

    await expect(h.service.refresh(first.tokens.refreshToken, h.client)).rejects.toMatchObject({
      code: 'SESSION_REVOKED',
    });
  });

  it('expires an unused refresh token after the 12-hour idle window', async () => {
    const h = createAuthHarness();
    await h.addStaff();
    const first = await loginAs(h, 'officer@example.test');
    h.clock.advance(12 * HOUR);

    await expect(h.service.refresh(first.tokens.refreshToken, h.client)).rejects.toMatchObject({
      code: 'SESSION_EXPIRED',
    });
  });

  it('still accepts the token one millisecond before the idle window ends', async () => {
    const h = createAuthHarness();
    await h.addStaff();
    const first = await loginAs(h, 'officer@example.test');
    h.clock.advance(12 * HOUR - 1);

    await expect(h.service.refresh(first.tokens.refreshToken, h.client)).resolves.toBeDefined();
  });

  it('never lets rotation push a token past the sign-in’s absolute lifetime', async () => {
    const h = createAuthHarness({
      policy: { idleTtlMs: 10 * MINUTE, staffAbsoluteMs: 15 * MINUTE },
    });
    await h.addStaff();
    const first = await loginAs(h, 'officer@example.test');
    h.clock.advance(9 * MINUTE);

    const second = await h.service.refresh(first.tokens.refreshToken, h.client);

    expect(second.tokens.refreshExpiresAt).toEqual(new Date(h.clock.now().getTime() + 6 * MINUTE));
  });

  it('gives citizens a week and staff a day as the absolute limit', async () => {
    const h = createAuthHarness();
    await h.addStaff();
    await h.addCitizen();

    await loginAs(h, 'officer@example.test');
    await loginAs(h, '0771234567');

    const [staffRow, citizenRow] = h.sessions.sessions;
    expect(staffRow!.absoluteExpiresAt.getTime() - h.clock.now().getTime()).toBe(24 * HOUR);
    expect(citizenRow!.absoluteExpiresAt.getTime() - h.clock.now().getTime()).toBe(7 * 24 * HOUR);
  });

  it('revokes the sign-in when the account was disabled since', async () => {
    const h = createAuthHarness();
    const user = await h.addStaff();
    const first = await loginAs(h, 'officer@example.test');
    h.users.users.set(user.userId, { ...user, status: 'DISABLED' });

    await expect(h.service.refresh(first.tokens.refreshToken, h.client)).rejects.toMatchObject({
      code: 'SESSION_REVOKED',
    });
    expect(h.sessions.sessions[0]?.revokedAt).toBeDefined();
  });
});

describe('Auth §7.1.3 logout', () => {
  it('revokes the sign-in from the refresh cookie alone (the access token may have expired)', async () => {
    const h = createAuthHarness();
    await h.addStaff();
    const first = await loginAs(h, 'officer@example.test');

    await h.service.logout({ refreshToken: first.tokens.refreshToken }, h.client);

    expect(h.sessions.sessions.every((row) => row.revokedAt)).toBe(true);
    expect(h.audit.actions()).toContain('auth.logout');
  });

  it('revokes the sign-in from a valid access token when there is no refresh cookie', async () => {
    const h = createAuthHarness();
    await h.addStaff();
    const first = await loginAs(h, 'officer@example.test');
    const context = h.accessTokens.verify(first.tokens.accessToken);

    await h.service.logout({ context }, h.client);

    expect(h.sessions.sessions.every((row) => row.revokedAt)).toBe(true);
    expect(h.audit.find('auth.logout')?.actorId).toBe(context.userId);
  });

  it('does nothing, quietly, when there is nothing to sign out', async () => {
    const h = createAuthHarness();

    await expect(h.service.logout({}, h.client)).resolves.toBeUndefined();
    await expect(h.service.logout({ refreshToken: 'unknown' }, h.client)).resolves.toBeUndefined();

    expect(h.audit.actions()).toEqual([]);
  });
});

describe('Auth §7.1.5 step-up re-authentication (BR3)', () => {
  it('marks the sign-in as freshly authenticated when the password is re-entered', async () => {
    const h = createAuthHarness();
    await h.addStaff();
    const login = await loginAs(h, 'officer@example.test');
    const context = h.accessTokens.verify(login.tokens.accessToken);
    h.clock.advance(20 * MINUTE);

    const result = await h.service.reauth(context, TEST_PASSWORD, h.client);

    expect(h.accessTokens.verify(result.accessToken).authenticatedAt).toEqual(h.clock.now());
    expect(result.user.authenticatedAt).toBe(h.clock.now().toISOString());
    expect(h.audit.actions()).toContain('auth.reauth.success');
  });

  it('keeps the fresh time through the next refresh', async () => {
    const h = createAuthHarness();
    await h.addStaff();
    const login = await loginAs(h, 'officer@example.test');
    const context = h.accessTokens.verify(login.tokens.accessToken);
    h.clock.advance(20 * MINUTE);
    await h.service.reauth(context, TEST_PASSWORD, h.client);
    const reauthAt = h.clock.now();
    h.clock.advance(MINUTE);

    const refreshed = await h.service.refresh(login.tokens.refreshToken, h.client);

    expect(h.accessTokens.verify(refreshed.tokens.accessToken).authenticatedAt).toEqual(reauthAt);
  });

  it('refuses a wrong password and leaves the sign-in untouched', async () => {
    const h = createAuthHarness();
    await h.addStaff();
    const login = await loginAs(h, 'officer@example.test');
    const context = h.accessTokens.verify(login.tokens.accessToken);
    const before = h.sessions.sessions[0]?.authenticatedAt;
    h.clock.advance(MINUTE);

    await expect(h.service.reauth(context, 'wrong', h.client)).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });

    expect(h.sessions.sessions[0]?.authenticatedAt).toEqual(before);
    expect(h.audit.actions()).toContain('auth.reauth.failure');
  });

  it('applies the progressive delay to repeated wrong passwords at the confirmation step', async () => {
    const h = createAuthHarness();
    await h.addStaff();
    const login = await loginAs(h, 'officer@example.test');
    const context = h.accessTokens.verify(login.tokens.accessToken);
    for (let i = 0; i < 3; i += 1) {
      await h.service.reauth(context, 'wrong', h.client).catch(() => undefined);
    }

    await expect(h.service.reauth(context, TEST_PASSWORD, h.client)).rejects.toMatchObject({
      code: 'LOGIN_THROTTLED',
    });
  });
});

describe('Auth §7.1.3 password change', () => {
  it('replaces the password and signs the person out of every device', async () => {
    const h = createAuthHarness();
    await h.addStaff();
    const phone = await loginAs(h, 'officer@example.test');
    const laptop = await loginAs(h, 'officer@example.test');
    const context = h.accessTokens.verify(phone.tokens.accessToken);

    await h.service.changePassword(
      context,
      { currentPassword: TEST_PASSWORD, newPassword: 'a brand new passphrase' },
      h.client,
    );

    expect(h.sessions.sessions.every((row) => row.revokedAt)).toBe(true);
    await expect(h.service.refresh(laptop.tokens.refreshToken, h.client)).rejects.toMatchObject({
      code: 'SESSION_REVOKED',
    });
    await expect(loginAs(h, 'officer@example.test')).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });
    await expect(
      loginAs(h, 'officer@example.test', 'a brand new passphrase'),
    ).resolves.toBeDefined();
    expect(h.audit.actions()).toContain('auth.password_change');
  });

  it('refuses to change the password without the current one', async () => {
    const h = createAuthHarness();
    await h.addStaff();
    const login = await loginAs(h, 'officer@example.test');
    const context = h.accessTokens.verify(login.tokens.accessToken);

    await expect(
      h.service.changePassword(
        context,
        { currentPassword: 'wrong', newPassword: 'a brand new passphrase' },
        h.client,
      ),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });

    expect(h.sessions.sessions.every((row) => !row.revokedAt)).toBe(true);
    expect(h.audit.actions()).toContain('auth.password_change.failure');
  });
});

describe('Auth §7.1.10 me', () => {
  it('describes a staff member without any citizen-only fields', async () => {
    const h = createAuthHarness();
    await h.addStaff({ role: 'DISTRICT_OFFICER', district: 'GAMPAHA' });
    const login = await loginAs(h, 'officer@example.test');

    const me = await h.service.me(h.accessTokens.verify(login.tokens.accessToken));

    expect(me).toMatchObject({
      role: 'DISTRICT_OFFICER',
      district: 'GAMPAHA',
      email: 'officer@example.test',
    });
    expect(me.nicMasked).toBeUndefined();
    expect(me.preferredLanguage).toBeUndefined();
  });

  it('describes a citizen with a masked NIC and never the full one', async () => {
    const h = createAuthHarness();
    await h.addCitizen({ nic: '905200451V' });
    const login = await loginAs(h, '0771234567');

    const me = await h.service.me(h.accessTokens.verify(login.tokens.accessToken));

    expect(me.nicMasked).toBe('*******51V');
    expect(JSON.stringify(me)).not.toContain('905200451');
  });

  it('refuses a token whose account has since been disabled', async () => {
    const h = createAuthHarness();
    const user = await h.addStaff();
    const login = await loginAs(h, 'officer@example.test');
    h.users.users.set(user.userId, { ...user, status: 'DISABLED' });

    await expect(
      h.service.me(h.accessTokens.verify(login.tokens.accessToken)),
    ).rejects.toMatchObject({ code: 'SESSION_INVALID' });
  });

  it('refuses a token whose account no longer exists', async () => {
    const h = createAuthHarness();
    const user = await h.addStaff();
    const login = await loginAs(h, 'officer@example.test');
    h.users.users.delete(user.userId);

    await expect(
      h.service.me(h.accessTokens.verify(login.tokens.accessToken)),
    ).rejects.toMatchObject({ code: 'SESSION_INVALID' });
  });
});
