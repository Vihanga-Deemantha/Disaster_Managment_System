import { HttpResponse } from 'msw';
import type { AuthResponse, MeResponse } from '@contracts/auth';

/** A signed-in DMC Officer unless overridden. */
export const makeMe = (overrides: Partial<MeResponse> = {}): MeResponse => ({
  userId: 'user-1',
  role: 'DMC_OFFICER',
  displayName: 'DMC Officer (demo)',
  email: 'dmc.officer@safezone.lk',
  authenticatedAt: '2026-10-07T09:00:00.000Z',
  ...overrides,
});

export const makeCitizen = (overrides: Partial<MeResponse> = {}): MeResponse =>
  makeMe({
    userId: 'citizen-1',
    role: 'CITIZEN',
    displayName: 'Test Citizen',
    email: undefined,
    phone: '+94771234567',
    district: 'GAMPAHA',
    preferredLanguage: 'SI',
    nicMasked: '*********567',
    ...overrides,
  });

export const okUser = (user: MeResponse, status = 200) =>
  HttpResponse.json({ user } satisfies AuthResponse, { status });

/** The API's uniform error body (`{ error: { code, message, fields?, details? } }`). */
export const apiError = (
  status: number,
  code: string,
  extras: {
    message?: string;
    fields?: { field: string; code: string }[];
    details?: Record<string, unknown>;
  } = {},
) =>
  HttpResponse.json(
    {
      error: {
        code,
        message: extras.message ?? code,
        fields: extras.fields,
        details: extras.details,
      },
    },
    { status },
  );
