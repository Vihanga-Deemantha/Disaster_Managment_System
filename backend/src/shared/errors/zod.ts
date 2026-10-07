import type { z } from 'zod';
import type { FieldError } from '../contracts/api';
import { ValidationError } from './DomainError';

const MACHINE_CODE = /^[A-Z][A-Z0-9_]+$/;

/** Our schemas put a machine code in `message`; built-in Zod issues fall back to their issue type. */
function toFieldError(issue: z.core.$ZodIssue): FieldError {
  const field = issue.path.map(String).join('.');
  if (MACHINE_CODE.test(issue.message)) return { field, code: issue.message };
  return { field, code: issue.code.toUpperCase(), message: issue.message };
}

export const toFieldErrors = (error: z.ZodError): FieldError[] => error.issues.map(toFieldError);

/**
 * Parses untrusted input with a schema, or throws a `ValidationError` listing every bad field.
 * HTTP handlers use this so they never contain validation logic themselves.
 */
export function parseOrThrow<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input);
  if (!result.success) throw new ValidationError(toFieldErrors(result.error));
  return result.data;
}
