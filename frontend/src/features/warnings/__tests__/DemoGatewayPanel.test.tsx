import { screen } from '@testing-library/react';

import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { apiError, makeMe } from '@/shared/testing/fixtures';
import { signIn } from '@/shared/testing/auth';
import { renderWithProviders } from '@/shared/testing/render';
import { server } from '@/shared/testing/server';
import { DemoGatewayPanel, DemoTools, demoToolsEnabled } from '../DemoGatewayPanel';
import { json } from '../testing/fixtures';
import { ALL_WORKING } from '../testing/render';

beforeEach(() => signIn(makeMe()));

const select = (channel: string) => screen.getByRole('combobox', { name: `${channel} gateway` });

describe('demoToolsEnabled', () => {
  it('is on while developing', () => {
    expect(demoToolsEnabled({ DEV: true })).toBe(true);
  });

  it('is on in a build made for a demonstration', () => {
    expect(demoToolsEnabled({ DEV: false, VITE_DEMO_TOOLS: 'true' })).toBe(true);
  });

  it.each([{}, { DEV: false }, { DEV: false, VITE_DEMO_TOOLS: 'false' }, { VITE_DEMO_TOOLS: '1' }])(
    'is off otherwise (%j), so production never has it',
    (env) => {
      expect(demoToolsEnabled(env)).toBe(false);
    },
  );
});

describe('UC-1 demo: the simulated gateway controls', () => {
  it('shows each gateway with its mode, in words', async () => {
    server.use(
      http.get('/api/dev/gateways', () =>
        json({ ...ALL_WORKING, SMS: 'FAIL_SOME', EMAIL: 'DOWN' }),
      ),
    );

    renderWithProviders(<DemoGatewayPanel />);

    expect(await screen.findByRole('combobox', { name: 'Push notification gateway' })).toHaveValue(
      'OK',
    );
    expect(select('SMS')).toHaveValue('FAIL_SOME');
    expect(select('WhatsApp')).toHaveValue('OK');
    expect(select('Email')).toHaveValue('DOWN');
    expect(screen.getByText('Demo controls: simulated gateways')).toBeInTheDocument();
    expect(screen.getByText(/do not exist in production/)).toBeInTheDocument();
    expect(screen.getAllByRole('option', { name: 'Some sends fail' })).toHaveLength(4);
  });

  it('A1, E2: takes a gateway down, and shows what the server says it is now', async () => {
    let sent: unknown;
    server.use(
      http.get('/api/dev/gateways', () => json(ALL_WORKING)),
      http.put('/api/dev/gateways/:channel', async ({ request, params }) => {
        sent = { channel: params.channel, body: await request.json() };
        return json({ ...ALL_WORKING, SMS: 'DOWN' });
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<DemoGatewayPanel />);
    await screen.findByRole('combobox', { name: 'SMS gateway' });

    await user.selectOptions(select('SMS'), 'DOWN');

    expect(sent).toEqual({ channel: 'SMS', body: { mode: 'DOWN' } });
    expect(select('SMS')).toHaveValue('DOWN');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('explains a failed change, and clears the message after the next one works', async () => {
    let fail = true;
    server.use(
      http.get('/api/dev/gateways', () => json(ALL_WORKING)),
      http.put('/api/dev/gateways/:channel', () =>
        fail ? apiError(500, 'INTERNAL_ERROR') : json({ ...ALL_WORKING, EMAIL: 'DOWN' }),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<DemoGatewayPanel />);
    await screen.findByRole('combobox', { name: 'Email gateway' });

    await user.selectOptions(select('Email'), 'DOWN');
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong');
    expect(select('Email')).toHaveValue('OK');

    fail = false;
    await user.selectOptions(select('Email'), 'DOWN');
    expect(select('Email')).toHaveValue('DOWN');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('says so, and shows no controls, when the server does not have them', async () => {
    server.use(http.get('/api/dev/gateways', () => apiError(404, 'ROUTE_NOT_FOUND')));

    renderWithProviders(<DemoGatewayPanel />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong');
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });
});

describe('DemoTools', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('shows the panel while developing', async () => {
    server.use(http.get('/api/dev/gateways', () => json(ALL_WORKING)));

    renderWithProviders(<DemoTools />);

    expect(await screen.findByText('Demo controls: simulated gateways')).toBeInTheDocument();
  });

  it('shows the panel in a build made for a demonstration', async () => {
    vi.stubEnv('DEV', false);
    vi.stubEnv('VITE_DEMO_TOOLS', 'true');
    server.use(http.get('/api/dev/gateways', () => json(ALL_WORKING)));

    renderWithProviders(<DemoTools />);

    expect(await screen.findByText('Demo controls: simulated gateways')).toBeInTheDocument();
  });

  it('shows nothing at all in production', () => {
    vi.stubEnv('DEV', false);

    const { container } = renderWithProviders(<DemoTools />);

    expect(container).toBeEmptyDOMElement();
  });
});
