import { ApiError, NetworkError } from '@/shared/api/errors';
import type { RegisterRequest } from '@/shared/contracts/auth';
import { emptyForm, type RegisterFormValues } from '../domain/registerForm';
import {
  outcomeOfFailure,
  submitRegistration,
  type SubmitContext,
} from '../domain/submitRegistration';

const valid: RegisterFormValues = {
  ...emptyForm('SI'),
  nic: '200012345678',
  fullName: 'Nimali Perera',
  phone: '77 123 4567',
  password: 'sunrise over galle fort',
  district: 'GAMPAHA',
  lat: '7.0873',
  lng: '79.9925',
};

function context(overrides: Partial<SubmitContext> = {}) {
  const requests: RegisterRequest[] = [];
  const full: SubmitContext = {
    register: async (request) => void requests.push(request),
    getDeviceToken: async () => 'marker-1',
    currentYear: 2026,
    confirmDistrictMismatch: false,
    ...overrides,
  };
  return { full, requests };
}

describe('submitRegistration', () => {
  it('sends a complete form, with the device marker, and says it is registered', async () => {
    const { full, requests } = context();

    const outcome = await submitRegistration(valid, full);

    expect(outcome).toEqual({ kind: 'registered' });
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      nic: '200012345678',
      phone: '+94771234567',
      deviceToken: 'marker-1',
      preferredLanguage: 'SI',
      confirmDistrictMismatch: false,
    });
  });

  it('sends nothing, and says which fields are wrong, for a form with problems', async () => {
    const { full, requests } = context();

    const outcome = await submitRegistration({ ...valid, nic: '12', phone: '1' }, full);

    expect(outcome).toEqual({
      kind: 'invalid',
      codes: { nic: 'NIC_FORMAT', phone: 'PHONE_INVALID' },
    });
    expect(requests).toEqual([]);
  });

  it('registers without a marker when the phone cannot make one', async () => {
    const { full, requests } = context({ getDeviceToken: async () => undefined });

    await submitRegistration(valid, full);

    expect('deviceToken' in (requests[0] as object)).toBe(false);
  });

  it('passes on "keep my district"', async () => {
    const { full, requests } = context({ confirmDistrictMismatch: true });

    await submitRegistration(valid, full);

    expect(requests[0]?.confirmDistrictMismatch).toBe(true);
  });

  it('turns the server’s district question into a question for the citizen', async () => {
    const { full } = context({
      register: async () => {
        throw new ApiError(409, 'DISTRICT_LOCATION_MISMATCH', 'Your pin looks closer to Colombo.', {
          suggestedDistrict: 'COLOMBO',
        });
      },
    });

    expect(await submitRegistration(valid, full)).toEqual({
      kind: 'districtMismatch',
      suggested: 'COLOMBO',
    });
  });

  it('turns the server’s field errors into fields to fix', async () => {
    const { full } = context({
      register: async () => {
        throw new ApiError(409, 'PHONE_ALREADY_REGISTERED', 'taken');
      },
    });

    expect(await submitRegistration(valid, full)).toEqual({
      kind: 'fieldErrors',
      codes: { phone: 'PHONE_ALREADY_REGISTERED' },
    });
  });

  it('reports a network failure as a failure to show', async () => {
    const failure = new NetworkError();
    const { full } = context({
      register: async () => {
        throw failure;
      },
    });

    expect(await submitRegistration(valid, full)).toEqual({ kind: 'failed', error: failure });
  });
});

describe('outcomeOfFailure', () => {
  it('asks the district question only for a district the app knows', () => {
    const unknown = new ApiError(409, 'DISTRICT_LOCATION_MISMATCH', 'x', {
      suggestedDistrict: 'ATLANTIS',
    });
    const missing = new ApiError(409, 'DISTRICT_LOCATION_MISMATCH', 'x');

    expect(outcomeOfFailure(unknown)).toEqual({ kind: 'failed', error: unknown });
    expect(outcomeOfFailure(missing)).toEqual({ kind: 'failed', error: missing });
  });

  it('maps a validation error with several fields', () => {
    const error = new ApiError(400, 'VALIDATION_FAILED', 'x', {}, [
      { field: 'nic', code: 'NIC_FORMAT' },
      { field: 'homeLocation.lat', code: 'LOCATION_INVALID' },
    ]);

    expect(outcomeOfFailure(error)).toEqual({
      kind: 'fieldErrors',
      codes: { nic: 'NIC_FORMAT', location: 'LOCATION_INVALID' },
    });
  });

  it('calls an error with nothing to point at a failure', () => {
    const error = new ApiError(500, 'INTERNAL', 'x');

    expect(outcomeOfFailure(error)).toEqual({ kind: 'failed', error });
    expect(outcomeOfFailure('odd')).toEqual({ kind: 'failed', error: 'odd' });
  });
});
