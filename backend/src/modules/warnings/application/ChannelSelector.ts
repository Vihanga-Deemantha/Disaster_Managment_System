import type { Channel } from '@shared/contracts/enums';
import type { Recipient } from '../domain/Recipient';

interface ChannelRule {
  channel: Channel;
  applies(recipient: Recipient, optional: readonly Channel[]): boolean;
}

/** Push and SMS always go together (D1); WhatsApp and Email only when ticked AND the citizen opted in. */
const RULES: readonly ChannelRule[] = [
  { channel: 'PUSH', applies: (recipient) => Boolean(recipient.deviceToken) },
  { channel: 'SMS', applies: (recipient) => Boolean(recipient.phone) },
  {
    channel: 'WHATSAPP',
    applies: (recipient, optional) =>
      optional.includes('WHATSAPP') && recipient.whatsappOptIn && Boolean(recipient.phone),
  },
  {
    channel: 'EMAIL',
    applies: (recipient, optional) =>
      optional.includes('EMAIL') && recipient.emailOptIn && Boolean(recipient.email),
  },
];

/** The report's `selectChannels(citizen)`: one place for the "who gets what" rules (a policy object). */
export class ChannelSelector {
  /** UC-1 steps 10 and 11. An empty answer means the citizen cannot be reached and is followed up. */
  select(recipient: Recipient, optional: readonly Channel[]): Channel[] {
    return RULES.filter((rule) => rule.applies(recipient, optional)).map((rule) => rule.channel);
  }
}
