import { ApiError } from '@/shared/api/errors';
import type { RegisterRequest } from '@/shared/contracts/auth';
import { DISTRICTS, type District } from '@/shared/contracts/enums';
import {
  buildRequest,
  serverFieldCodes,
  validate,
  type FieldCodes,
  type RegisterFormValues,
} from './registerForm';

export type SubmitOutcome =
  | { kind: 'invalid'; codes: FieldCodes }
  | { kind: 'registered' }
  /** The pin sits nearer another district than the one chosen: ask which is right. */
  | { kind: 'districtMismatch'; suggested: District }
  /** The server found a problem in particular fields (a phone already registered, say). */
  | { kind: 'fieldErrors'; codes: FieldCodes }
  | { kind: 'failed'; error: unknown };

export interface SubmitContext {
  register: (request: RegisterRequest) => Promise<unknown>;
  getDeviceToken: () => Promise<string | undefined>;
  currentYear: number;
  /** True once the citizen has said "keep my district" to the mismatch question. */
  confirmDistrictMismatch: boolean;
}

function suggestedDistrict(error: ApiError): District | undefined {
  const value = error.details.suggestedDistrict;
  return DISTRICTS.find((district) => district === value);
}

/** What a failed registration means for the screen: a question, a field to fix, or a plain failure. */
export function outcomeOfFailure(error: unknown): SubmitOutcome {
  if (!(error instanceof ApiError)) return { kind: 'failed', error };
  const suggested =
    error.code === 'DISTRICT_LOCATION_MISMATCH' ? suggestedDistrict(error) : undefined;
  if (suggested) return { kind: 'districtMismatch', suggested };
  const codes = serverFieldCodes(error.code, error.fields);
  return Object.keys(codes).length > 0 ? { kind: 'fieldErrors', codes } : { kind: 'failed', error };
}

/**
 * Registers the citizen: checks the form with the server's own rules first, then sends it. Nothing
 * here is about screens, so every way it can end is a plain value the screen turns into words.
 */
export async function submitRegistration(
  values: RegisterFormValues,
  context: SubmitContext,
): Promise<SubmitOutcome> {
  const deviceToken = await context.getDeviceToken();
  const request = buildRequest(values, {
    currentYear: context.currentYear,
    confirmDistrictMismatch: context.confirmDistrictMismatch,
    ...(deviceToken === undefined ? {} : { deviceToken }),
  });
  if (!request) return { kind: 'invalid', codes: validate(values, context.currentYear) };
  try {
    await context.register(request);
    return { kind: 'registered' };
  } catch (error) {
    return outcomeOfFailure(error);
  }
}
