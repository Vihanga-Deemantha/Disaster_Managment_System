import { z } from 'zod';
import { LANGUAGES, SEVERITIES, type Severity } from '@contracts/enums';
import { SMS_MAX_LENGTH, fromLocalInput, smsLength, toLocalInput } from './format';
import type { Messages, WarningDto } from './types';

/** What the edit form holds. The two times are `datetime-local` text, in the officer's own clock. */
export interface EditValues {
  severity: Severity;
  validFrom: string;
  validTo: string;
  messages: Messages;
}

const validDate = z.string().refine((value) => !Number.isNaN(Date.parse(value)), 'DATE_INVALID');

/** Each language's text must exist and fit one SMS (E1; the server checks it again before issuing). */
const text = z
  .string()
  .refine((value) => value.trim() !== '', 'MESSAGE_REQUIRED')
  .refine((value) => smsLength(value) <= SMS_MAX_LENGTH, 'SMS_TOO_LONG');

export const editSchema = z
  .object({
    severity: z.enum(SEVERITIES),
    validFrom: validDate,
    validTo: validDate,
    messages: z.object({ SI: text, TA: text, EN: text }),
  })
  // A time that is not a date is reported as such; it is not also called "before the start".
  .refine((value) => !(Date.parse(value.validTo) <= Date.parse(value.validFrom)), {
    path: ['validTo'],
    message: 'VALIDITY_WINDOW_INVALID',
  });

/** Error *codes* by field (`severity`, `validFrom`, `validTo`, `messages.SI`…), for the page to translate. */
export type EditErrors = Record<string, string>;

export function validateEdit(values: EditValues): EditErrors {
  const result = editSchema.safeParse(values);
  const errors: EditErrors = {};
  if (!result.success) {
    for (const issue of result.error.issues) errors[issue.path.join('.')] = issue.message;
  }
  return errors;
}

export const initialValues = (warning: WarningDto): EditValues => ({
  severity: warning.severity,
  validFrom: toLocalInput(warning.validFrom),
  validTo: toLocalInput(warning.validTo),
  messages: { ...warning.messages },
});

/** Only what the officer changed goes to the server, so the audit trail names the fields that really moved. */
export interface EditBody {
  severity?: Severity;
  validFrom?: string;
  validTo?: string;
  messages?: Partial<Messages>;
}

export function changesFrom(warning: WarningDto, values: EditValues): EditBody {
  const original = initialValues(warning);
  const messages = Object.fromEntries(
    LANGUAGES.filter((language) => values.messages[language] !== original.messages[language]).map(
      (language) => [language, values.messages[language]],
    ),
  ) as Partial<Messages>;
  return {
    ...(Object.keys(messages).length > 0 ? { messages } : {}),
    ...(values.severity === original.severity ? {} : { severity: values.severity }),
    ...(values.validFrom === original.validFrom
      ? {}
      : { validFrom: fromLocalInput(values.validFrom) }),
    ...(values.validTo === original.validTo ? {} : { validTo: fromLocalInput(values.validTo) }),
  };
}
