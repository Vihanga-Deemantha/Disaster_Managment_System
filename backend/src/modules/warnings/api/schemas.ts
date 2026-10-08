import { z } from 'zod';
import { CHANNELS, SEVERITIES } from '@shared/contracts/enums';
import { GATEWAY_MODES } from '../infrastructure/GatewaySimulator';

/**
 * Request shapes for the warnings API. As everywhere in this project, a problem is reported as a
 * machine code in `message`, so the screen can translate it (E1).
 */

const isoDate = z
  .string('DATE_INVALID')
  .refine((value) => !Number.isNaN(Date.parse(value)), 'DATE_INVALID')
  .transform((value) => new Date(value));

/** Generous on purpose: the 160-character SMS rule is checked when issuing, not when saving a draft. */
const message = z.string('MESSAGE_INVALID').max(2000, 'MESSAGE_TOO_LONG');

export const listQuerySchema = z.object({
  status: z.enum(['PENDING_APPROVAL', 'ISSUED', 'REJECTED'], 'STATUS_INVALID').optional(),
});

/** A2. The version the officer was looking at travels in the body (the offline outbox keeps no headers) or in `If-Match`. */
export const updateWarningSchema = z.object({
  expectedVersion: z
    .number('VERSION_INVALID')
    .int('VERSION_INVALID')
    .min(1, 'VERSION_INVALID')
    .optional(),
  messages: z
    .object({ SI: message.optional(), TA: message.optional(), EN: message.optional() })
    .optional(),
  severity: z.enum(SEVERITIES, 'SEVERITY_INVALID').optional(),
  validFrom: isoDate.optional(),
  validTo: isoDate.optional(),
});

/** A3: the reason is mandatory. */
export const rejectSchema = z.object({
  reason: z.string('REASON_REQUIRED').trim().min(1, 'REASON_REQUIRED').max(500, 'REASON_TOO_LONG'),
});

/** Push and SMS always go; only the two opt-in channels can be switched on (D1, step 11). */
export const issueSchema = z.object({
  optionalChannels: z.array(z.enum(['WHATSAPP', 'EMAIL'], 'CHANNEL_INVALID')).default([]),
});

export const channelParamSchema = z.enum(CHANNELS, 'CHANNEL_INVALID');

export const gatewayModeSchema = z.object({ mode: z.enum(GATEWAY_MODES, 'MODE_INVALID') });
