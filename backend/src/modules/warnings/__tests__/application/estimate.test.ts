import { ChannelSelector } from '../../application/ChannelSelector';
import { estimateRecipients } from '../../application/estimate';
import { aRecipient } from '../../testing/builders';

const selector = new ChannelSelector();

describe('UC-1 step 2 / SD1-03: estimateRecipients', () => {
  it('UC-1 step 2: with nobody in the area, everything is zero', () => {
    expect(estimateRecipients([], selector)).toEqual({
      total: 0,
      unreachable: 0,
      byChannel: { PUSH: 0, SMS: 0, WHATSAPP: 0, EMAIL: 0 },
    });
  });

  it('UC-1 step 2: counts how many citizens each channel could reach', () => {
    const recipients = [
      aRecipient({ citizenId: 'a' }),
      aRecipient({ citizenId: 'b', deviceToken: undefined }),
      aRecipient({ citizenId: 'c', phone: undefined, whatsappOptIn: true }),
      aRecipient({
        citizenId: 'd',
        whatsappOptIn: true,
        emailOptIn: true,
        email: 'd@example.test',
      }),
    ];

    expect(estimateRecipients(recipients, selector)).toEqual({
      total: 4,
      unreachable: 0,
      byChannel: { PUSH: 3, SMS: 3, WHATSAPP: 1, EMAIL: 1 },
    });
  });

  it('UC-1 E2: counts the citizens no channel can reach, so the officer knows before issuing', () => {
    const recipients = [
      aRecipient({ citizenId: 'a' }),
      aRecipient({ citizenId: 'b', deviceToken: undefined, phone: undefined }),
    ];

    const estimate = estimateRecipients(recipients, selector);

    expect(estimate.unreachable).toBe(1);
    expect(estimate.total).toBe(2);
  });

  it('UC-1 step 11: the optional channels count only citizens who opted in', () => {
    const recipients = [
      aRecipient({ whatsappOptIn: false, emailOptIn: false, email: 'x@example.test' }),
    ];

    expect(estimateRecipients(recipients, selector).byChannel).toEqual({
      PUSH: 1,
      SMS: 1,
      WHATSAPP: 0,
      EMAIL: 0,
    });
  });
});
