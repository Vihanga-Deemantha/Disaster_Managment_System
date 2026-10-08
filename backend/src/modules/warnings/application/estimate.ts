import { CHANNELS, type Channel } from '@shared/contracts/enums';
import type { Recipient } from '../domain/Recipient';
import type { ChannelSelector } from './ChannelSelector';

/** UC-1 step 2 (SD1-03): how many citizens each channel could reach, shown before the officer decides. */
export interface RecipientEstimate {
  total: number;
  /** Push and SMS: citizens with a device token or a phone. WhatsApp and Email: those who opted in. */
  byChannel: Record<Channel, number>;
  /** Citizens no channel can reach. They will appear in the follow-up list. */
  unreachable: number;
}

const OPTIONAL: readonly Channel[] = ['WHATSAPP', 'EMAIL'];

export function estimateRecipients(
  recipients: readonly Recipient[],
  selector: ChannelSelector,
): RecipientEstimate {
  const byChannel = Object.fromEntries(CHANNELS.map((channel) => [channel, 0])) as Record<
    Channel,
    number
  >;
  let unreachable = 0;
  for (const recipient of recipients) {
    const channels = selector.select(recipient, OPTIONAL);
    if (channels.length === 0) unreachable += 1;
    for (const channel of channels) byChannel[channel] += 1;
  }
  return { total: recipients.length, byChannel, unreachable };
}
