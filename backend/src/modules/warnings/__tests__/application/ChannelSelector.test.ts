import type { Channel } from '@shared/contracts/enums';
import { ChannelSelector } from '../../application/ChannelSelector';
import { aRecipient } from '../../testing/builders';

const selector = new ChannelSelector();
const NONE: Channel[] = [];

describe('UC-1 step 10 / D1: Push and SMS together', () => {
  it('UC-1 step 10: a citizen with a device token and a phone gets both Push and SMS', () => {
    expect(selector.select(aRecipient(), NONE)).toEqual(['PUSH', 'SMS']);
  });

  it('UC-1 step 10: without a device token, SMS alone', () => {
    expect(selector.select(aRecipient({ deviceToken: undefined }), NONE)).toEqual(['SMS']);
  });

  it('UC-1 step 10: without a phone, Push alone', () => {
    expect(selector.select(aRecipient({ phone: undefined }), NONE)).toEqual(['PUSH']);
  });

  it('UC-1 E2: with neither, nothing, so the citizen is counted as unreachable', () => {
    const nobody = aRecipient({ deviceToken: undefined, phone: undefined });

    expect(selector.select(nobody, NONE)).toEqual([]);
  });
});

describe('UC-1 step 11: WhatsApp and Email are opt-in on both sides', () => {
  const optedIn = aRecipient({ whatsappOptIn: true, emailOptIn: true, email: 'a@example.test' });

  it.each([
    ['ticked and opted in', ['WHATSAPP'], true, true],
    ['ticked but not opted in', ['WHATSAPP'], false, false],
    ['opted in but not ticked', [], true, false],
    ['neither ticked nor opted in', [], false, false],
  ] as const)('UC-1 step 11: WhatsApp %s', (_case, ticked, optIn, expected) => {
    const channels = selector.select(aRecipient({ whatsappOptIn: optIn }), ticked);

    expect(channels.includes('WHATSAPP')).toBe(expected);
  });

  it.each([
    ['ticked and opted in', ['EMAIL'], true, true],
    ['ticked but not opted in', ['EMAIL'], false, false],
    ['opted in but not ticked', [], true, false],
    ['neither ticked nor opted in', [], false, false],
  ] as const)('UC-1 step 11: Email %s', (_case, ticked, optIn, expected) => {
    const channels = selector.select(
      aRecipient({ emailOptIn: optIn, email: 'a@example.test' }),
      ticked,
    );

    expect(channels.includes('EMAIL')).toBe(expected);
  });

  it('UC-1 step 11: WhatsApp needs a phone number to send to', () => {
    const channels = selector.select({ ...optedIn, phone: undefined }, ['WHATSAPP']);

    expect(channels).not.toContain('WHATSAPP');
  });

  it('UC-1 step 11: Email needs an address to send to', () => {
    const channels = selector.select({ ...optedIn, email: undefined }, ['EMAIL']);

    expect(channels).not.toContain('EMAIL');
  });

  it('UC-1 step 11: a ticked box for one optional channel does not switch on the other', () => {
    expect(selector.select(optedIn, ['EMAIL'])).toEqual(['PUSH', 'SMS', 'EMAIL']);
    expect(selector.select(optedIn, ['WHATSAPP'])).toEqual(['PUSH', 'SMS', 'WHATSAPP']);
  });

  it('UC-1 steps 10 and 11: every channel, in a fixed order', () => {
    expect(selector.select(optedIn, ['EMAIL', 'WHATSAPP'])).toEqual([
      'PUSH',
      'SMS',
      'WHATSAPP',
      'EMAIL',
    ]);
  });
});
