import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http } from 'msw';
import { HttpResponse } from 'msw';
import { routes } from '@/routes';
import { apiError, makeCitizen, makeMe, okUser } from '@/shared/testing/fixtures';
import { renderRoutes } from '@/shared/testing/render';
import { server } from '@/shared/testing/server';

function anonymous() {
  server.use(
    http.get('/api/auth/me', () => apiError(401, 'UNAUTHENTICATED')),
    http.post('/api/auth/refresh', () => apiError(401, 'SESSION_INVALID')),
  );
}

type User = ReturnType<typeof userEvent.setup>;

async function fillValidForm(
  user: User,
  overrides: { district?: string; lat?: string; lng?: string } = {},
) {
  await user.type(await screen.findByLabelText('National Identity Card number'), '199012345678');
  await user.type(screen.getByLabelText('Full name'), 'Test Citizen');
  await user.type(screen.getByLabelText('Mobile phone number'), '077 123 4567');
  await user.type(screen.getByLabelText('Password'), 'correct horse battery');
  await user.selectOptions(screen.getByLabelText('District'), overrides.district ?? 'GAMPAHA');
  await user.type(screen.getByLabelText('Latitude'), overrides.lat ?? '7.0873');
  await user.type(screen.getByLabelText('Longitude'), overrides.lng ?? '79.9925');
}

const submit = (user: User) => user.click(screen.getByRole('button', { name: 'Register' }));

/** Captures the body of each registration request. */
function captureRegistrations(
  respond: () => Response | Promise<Response> = () =>
    okUser(makeCitizen(), 201) as unknown as Response,
) {
  const bodies: Record<string, unknown>[] = [];
  server.use(
    http.post('/api/auth/register', async ({ request }) => {
      bodies.push((await request.json()) as Record<string, unknown>);
      return respond();
    }),
  );
  return bodies;
}

function stubGeolocation(impl: Geolocation['getCurrentPosition'] | undefined) {
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: impl ? { getCurrentPosition: impl } : undefined,
  });
  if (!impl) delete (navigator as { geolocation?: unknown }).geolocation;
}

afterEach(() => {
  stubGeolocation(vi.fn());
  delete (navigator as { geolocation?: unknown }).geolocation;
});

describe('Registration page', () => {
  beforeEach(anonymous);

  it('explains why the NIC and address are asked for, before asking', async () => {
    renderRoutes(routes, { route: '/register' });

    expect(await screen.findByRole('heading', { name: 'Why we ask for this' })).toBeInTheDocument();
    expect(screen.getByText(/stored encrypted and is never shown in full/)).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Citizen registration' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
  });

  it('restores the tab title when leaving', async () => {
    const view = renderRoutes(routes, { route: '/register' });
    await screen.findByRole('heading', { level: 1, name: 'Citizen registration' });
    expect(document.title).toBe('Citizen registration · Safe Zone');

    view.unmount();

    expect(document.title).not.toBe('Citizen registration · Safe Zone');
  });

  it('shows a spinner while it checks for an existing session', () => {
    server.use(http.get('/api/auth/me', async () => (await delay(80), okUser(makeMe()))));

    renderRoutes(routes, { route: '/register' });

    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows a field’s problem once it is left, in plain words, and clears it when fixed', async () => {
    const user = userEvent.setup();
    renderRoutes(routes, { route: '/register' });
    const nic = await screen.findByLabelText('National Identity Card number');

    await user.type(nic, '12345');
    await user.tab();
    expect(
      screen.getByText('Enter a valid NIC: 9 digits and V or X, or 12 digits.'),
    ).toBeInTheDocument();
    expect(nic).toHaveAttribute('aria-invalid', 'true');

    await user.clear(nic);
    await user.type(nic, '199012345678');
    expect(
      screen.queryByText('Enter a valid NIC: 9 digits and V or X, or 12 digits.'),
    ).not.toBeInTheDocument();
  });

  it('does not nag about fields the person has not reached yet', async () => {
    renderRoutes(routes, { route: '/register' });
    await screen.findByLabelText('Full name');

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('on a premature submit lists every problem and moves focus to the first one', async () => {
    let requests = 0;
    server.use(
      http.post('/api/auth/register', () => ((requests += 1), okUser(makeCitizen(), 201))),
    );
    const user = userEvent.setup();
    renderRoutes(routes, { route: '/register' });
    await screen.findByLabelText('Full name');

    await submit(user);

    expect(
      screen.getByText('Enter a valid NIC: 9 digits and V or X, or 12 digits.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Enter your full name.')).toBeInTheDocument();
    expect(
      screen.getByText('Enter a Sri Lankan mobile number, for example 077 123 4567.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Use at least 10 characters.')).toBeInTheDocument();
    expect(screen.getByText('Choose your district.')).toBeInTheDocument();
    expect(screen.getByText('Set your home location.')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByLabelText('National Identity Card number')).toHaveFocus(),
    );
    expect(requests).toBe(0);
  });

  it('registers, sends what was typed, and lands the citizen on their home screen', async () => {
    const bodies = captureRegistrations();
    const user = userEvent.setup();
    const view = renderRoutes(routes, { route: '/register' });
    await fillValidForm(user);

    await submit(user);

    expect(await screen.findByRole('heading', { name: 'Hazard Reports' })).toBeInTheDocument();
    expect(view.router.state.location.pathname).toBe('/hazard-reports');
    expect(bodies[0]).toMatchObject({
      nic: '199012345678',
      fullName: 'Test Citizen',
      phone: '077 123 4567',
      district: 'GAMPAHA',
      homeLocation: { lat: 7.0873, lng: 79.9925 },
      preferredLanguage: 'EN',
      whatsappOptIn: false,
      emailOptIn: false,
      confirmDistrictMismatch: false,
    });
  });

  it('shows progress and blocks a second click while registering', async () => {
    captureRegistrations(
      async () => (await delay(80), okUser(makeCitizen(), 201)) as unknown as Response,
    );
    const user = userEvent.setup();
    renderRoutes(routes, { route: '/register' });
    await fillValidForm(user);

    await submit(user);

    expect(await screen.findByRole('button', { name: /Registering…/ })).toBeDisabled();
    await screen.findByRole('heading', { name: 'Hazard Reports' });
  });

  it('puts a duplicate-NIC answer from the server on the NIC field, and clears it when edited', async () => {
    captureRegistrations(() => apiError(409, 'NIC_ALREADY_REGISTERED') as unknown as Response);
    const user = userEvent.setup();
    renderRoutes(routes, { route: '/register' });
    await fillValidForm(user);

    await submit(user);

    expect(
      await screen.findByText('This NIC is already registered. Try signing in.'),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByLabelText('National Identity Card number')).toHaveFocus(),
    );
    await user.type(screen.getByLabelText('National Identity Card number'), '0');
    expect(
      screen.queryByText('This NIC is already registered. Try signing in.'),
    ).not.toBeInTheDocument();
  });

  it('maps a 400 field list from the server onto the form', async () => {
    captureRegistrations(
      () =>
        apiError(400, 'VALIDATION_FAILED', {
          fields: [{ field: 'phone', code: 'PHONE_INVALID' }],
        }) as unknown as Response,
    );
    const user = userEvent.setup();
    renderRoutes(routes, { route: '/register' });
    await fillValidForm(user);

    await submit(user);

    expect(
      await screen.findByText('Enter a Sri Lankan mobile number, for example 077 123 4567.'),
    ).toBeInTheDocument();
  });

  it('shows a general alert for a failure that is not about one field', async () => {
    captureRegistrations(() => apiError(500, 'INTERNAL_ERROR') as unknown as Response);
    const user = userEvent.setup();
    renderRoutes(routes, { route: '/register' });
    await fillValidForm(user);

    await submit(user);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Something went wrong. Please try again.',
    );
  });

  it('says so when offline, and keeps everything typed', async () => {
    server.use(http.post('/api/auth/register', () => HttpResponse.error()));
    const user = userEvent.setup();
    renderRoutes(routes, { route: '/register' });
    await fillValidForm(user);

    await submit(user);

    expect(
      await screen.findByText('You appear to be offline. Check your connection and try again.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Full name')).toHaveValue('Test Citizen');
  });
});

describe('Registration: district confirmation (master plan §7.1.2)', () => {
  beforeEach(anonymous);

  const mismatch = () =>
    apiError(422, 'DISTRICT_LOCATION_MISMATCH', {
      details: { suggestedDistrict: 'COLOMBO' },
    }) as unknown as Response;

  it('offers the nearer district when the pin and the choice disagree', async () => {
    captureRegistrations(mismatch);
    const user = userEvent.setup();
    renderRoutes(routes, { route: '/register' });
    await fillValidForm(user, { district: 'JAFFNA', lat: '6.9271', lng: '79.8612' });

    await submit(user);

    const dialog = await screen.findByRole('dialog', { name: 'Is your district correct?' });
    expect(dialog).toHaveTextContent('Your location looks closer to Colombo than to Jaffna.');
    expect(screen.getByRole('button', { name: 'Use Colombo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Keep Jaffna' })).toBeInTheDocument();
  });

  it('registers with the suggested district when the person accepts it', async () => {
    let first = true;
    const bodies = captureRegistrations(() => {
      const wasFirst = first;
      first = false;
      return wasFirst ? mismatch() : (okUser(makeCitizen(), 201) as unknown as Response);
    });
    const user = userEvent.setup();
    renderRoutes(routes, { route: '/register' });
    await fillValidForm(user, { district: 'JAFFNA', lat: '6.9271', lng: '79.8612' });
    await submit(user);

    await user.click(await screen.findByRole('button', { name: 'Use Colombo' }));

    await screen.findByRole('heading', { name: 'Hazard Reports' });
    expect(bodies.map((body) => [body.district, body.confirmDistrictMismatch])).toEqual([
      ['JAFFNA', false],
      ['COLOMBO', false],
    ]);
  });

  it('registers with their own district, confirmed, when they insist', async () => {
    let first = true;
    const bodies = captureRegistrations(() => {
      const wasFirst = first;
      first = false;
      return wasFirst ? mismatch() : (okUser(makeCitizen(), 201) as unknown as Response);
    });
    const user = userEvent.setup();
    renderRoutes(routes, { route: '/register' });
    await fillValidForm(user, { district: 'JAFFNA', lat: '6.9271', lng: '79.8612' });
    await submit(user);

    await user.click(await screen.findByRole('button', { name: 'Keep Jaffna' }));

    await screen.findByRole('heading', { name: 'Hazard Reports' });
    expect(bodies.map((body) => [body.district, body.confirmDistrictMismatch])).toEqual([
      ['JAFFNA', false],
      ['JAFFNA', true],
    ]);
  });

  it('can be dismissed to edit the form instead', async () => {
    captureRegistrations(mismatch);
    const user = userEvent.setup();
    renderRoutes(routes, { route: '/register' });
    await fillValidForm(user, { district: 'JAFFNA', lat: '6.9271', lng: '79.8612' });
    await submit(user);
    await screen.findByRole('dialog');

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('falls back to a general error if the server gave no usable suggestion', async () => {
    captureRegistrations(
      () =>
        apiError(422, 'DISTRICT_LOCATION_MISMATCH', {
          details: { suggestedDistrict: 'ATLANTIS' },
        }) as unknown as Response,
    );
    const user = userEvent.setup();
    renderRoutes(routes, { route: '/register' });
    await fillValidForm(user);

    await submit(user);

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('puts "outside Sri Lanka" on the location field', async () => {
    captureRegistrations(() => apiError(422, 'LOCATION_OUTSIDE_SRI_LANKA') as unknown as Response);
    const user = userEvent.setup();
    renderRoutes(routes, { route: '/register' });
    await fillValidForm(user);

    await submit(user);

    expect(await screen.findByText('This location is outside Sri Lanka.')).toBeInTheDocument();
  });
});

describe('Registration: location and preferences', () => {
  beforeEach(anonymous);

  it('fills in the coordinates from the device when asked', async () => {
    stubGeolocation(((success: PositionCallback) =>
      success({
        coords: { latitude: 7.087312, longitude: 79.992512 },
      } as GeolocationPosition)) as never);
    const user = userEvent.setup();
    renderRoutes(routes, { route: '/register' });

    await user.click(await screen.findByRole('button', { name: 'Use my current location' }));

    expect(screen.getByLabelText('Latitude')).toHaveValue('7.08731');
    expect(screen.getByLabelText('Longitude')).toHaveValue('79.99251');
    expect(screen.getByText('Location set: 7.08731, 79.99251')).toBeInTheDocument();
  });

  it('explains what to do when location access is refused', async () => {
    stubGeolocation(((_ok: PositionCallback, fail: PositionErrorCallback) =>
      fail({ code: 1 } as GeolocationPositionError)) as never);
    const user = userEvent.setup();
    renderRoutes(routes, { route: '/register' });

    await user.click(await screen.findByRole('button', { name: 'Use my current location' }));

    expect(await screen.findByText(/We could not read your location/)).toBeInTheDocument();
  });

  it('explains it when the device cannot share a location at all', async () => {
    stubGeolocation(undefined);
    const user = userEvent.setup();
    renderRoutes(routes, { route: '/register' });

    await user.click(await screen.findByRole('button', { name: 'Use my current location' }));

    expect(await screen.findByText(/cannot share its location/)).toBeInTheDocument();
  });

  it('shows the finding-location state while the device thinks', async () => {
    stubGeolocation((() => undefined) as never);
    const user = userEvent.setup();
    renderRoutes(routes, { route: '/register' });

    await user.click(await screen.findByRole('button', { name: 'Use my current location' }));

    expect(screen.getByRole('button', { name: /Finding your location…/ })).toBeDisabled();
  });

  it('rejects a coordinate that is not a number', async () => {
    const user = userEvent.setup();
    renderRoutes(routes, { route: '/register' });
    await user.type(await screen.findByLabelText('Latitude'), 'north');
    await user.tab();

    expect(screen.getByText('Enter a valid latitude and longitude.')).toBeInTheDocument();
  });

  it('lets the password be checked before submitting', async () => {
    const user = userEvent.setup();
    renderRoutes(routes, { route: '/register' });
    const password = await screen.findByLabelText('Password');

    await user.type(password, 'correct horse battery');
    await user.click(screen.getByRole('button', { name: 'Show' }));

    expect(password).toHaveAttribute('type', 'text');
  });

  it('asks for an email address only when email alerts are wanted, and requires it then', async () => {
    const user = userEvent.setup();
    renderRoutes(routes, { route: '/register' });
    await screen.findByLabelText('Full name');
    expect(screen.queryByLabelText('Email address')).not.toBeInTheDocument();

    await user.click(screen.getByLabelText('Also send alerts by email'));
    await user.click(screen.getByLabelText('Email address'));
    await user.tab();

    expect(screen.getByText('Enter an email address to receive email alerts.')).toBeInTheDocument();
  });

  it('sends the WhatsApp and email choices, with the address', async () => {
    const bodies = captureRegistrations();
    const user = userEvent.setup();
    renderRoutes(routes, { route: '/register' });
    await fillValidForm(user);
    await user.click(screen.getByLabelText('Also send alerts by WhatsApp'));
    await user.click(screen.getByLabelText('Also send alerts by email'));
    await user.type(screen.getByLabelText('Email address'), 'citizen@example.com');
    await user.type(screen.getByLabelText(/Home address/), '12 Temple Road');

    await submit(user);

    await screen.findByRole('heading', { name: 'Hazard Reports' });
    expect(bodies[0]).toMatchObject({
      whatsappOptIn: true,
      emailOptIn: true,
      email: 'citizen@example.com',
      addressLine: '12 Temple Road',
    });
  });

  it('keeps the alert language in step with the page language until the person chooses one', async () => {
    const user = userEvent.setup();
    renderRoutes(routes, { route: '/register' });
    await screen.findByLabelText('Full name');
    expect(screen.getByRole('radio', { name: 'English' })).toBeChecked();

    await user.selectOptions(screen.getByRole('combobox', { name: 'Language' }), 'SI');
    expect(screen.getByRole('radio', { name: 'සිංහල' })).toBeChecked();

    await user.click(screen.getByRole('radio', { name: 'தமிழ்' }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'භාෂාව' }), 'EN');
    expect(screen.getByRole('radio', { name: 'தமிழ்' })).toBeChecked();
  });

  it('can be filled in Sinhala, with district names in both scripts', async () => {
    renderRoutes(routes, { route: '/register', language: 'SI' });

    expect(
      await screen.findByRole('heading', { level: 1, name: 'පුරවැසි ලියාපදිංචිය' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'කොළඹ (Colombo)' })).toBeInTheDocument();
  });

  it('skips the form for someone who is already signed in', async () => {
    server.use(
      http.get('/api/auth/me', () => okUser(makeCitizen())),
      http.post('/api/auth/refresh', () => okUser(makeCitizen())),
    );
    const view = renderRoutes(routes, { route: '/register' });

    expect(await screen.findByRole('heading', { name: 'Hazard Reports' })).toBeInTheDocument();
    expect(view.router.state.location.pathname).toBe('/hazard-reports');
  });
});
