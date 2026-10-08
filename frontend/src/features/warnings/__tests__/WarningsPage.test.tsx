import { screen } from '@testing-library/react';
import { makeMe } from '@/shared/testing/fixtures';
import { signIn } from '@/shared/testing/auth';
import { renderWarnings, serveWarnings } from '../testing/render';

vi.mock('react-leaflet', async () => (await import('../testing/mockMap')).reactLeafletMock);

beforeEach(() => {
  signIn(makeMe({ userId: 'user-1' }));
  serveWarnings();
});

const heading = (name: string) => screen.findByRole('heading', { level: 1, name });

describe('the warnings routes (mounted by the app at /warnings/*)', () => {
  it('opens Pending Approvals at /warnings', async () => {
    renderWarnings('/warnings');

    expect(await heading('Pending Approvals')).toBeInTheDocument();
  });

  it('opens Issued Warnings at /warnings/issued, not a review of a warning called "issued"', async () => {
    renderWarnings('/warnings/issued');

    expect(await heading('Issued Warnings')).toBeInTheDocument();
  });

  it('opens Rejected Warnings at /warnings/rejected', async () => {
    renderWarnings('/warnings/rejected');

    expect(await heading('Rejected Warnings')).toBeInTheDocument();
  });

  it('opens Review Warning at /warnings/:warningId', async () => {
    renderWarnings('/warnings/W-102');

    expect(await heading('Review Warning')).toBeInTheDocument();
  });

  it('opens the delivery summary at /warnings/:warningId/delivery', async () => {
    renderWarnings('/warnings/W-102/delivery');

    expect(await heading('Warning Issued')).toBeInTheDocument();
  });

  it('answers anything deeper with the not-found page', async () => {
    renderWarnings('/warnings/W-102/delivery/extra');

    expect(await heading('Page not found')).toBeInTheDocument();
  });

  it('sets the browser tab title for each screen and puts it back afterwards', async () => {
    const before = document.title;
    const view = renderWarnings('/warnings');
    await heading('Pending Approvals');

    expect(document.title).toBe('Pending Approvals');
    view.unmount();
    expect(document.title).toBe(before);
  });

  it('gives the two sister lists their own tab titles', async () => {
    const issued = renderWarnings('/warnings/issued');
    await heading('Issued Warnings');
    expect(document.title).toBe('Issued Warnings');
    issued.unmount();

    renderWarnings('/warnings/rejected');
    await heading('Rejected Warnings');
    expect(document.title).toBe('Rejected Warnings');
  });
});
