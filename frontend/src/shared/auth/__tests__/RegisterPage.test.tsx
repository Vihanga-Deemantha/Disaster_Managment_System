import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
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

const NIC_ERROR = 'Enter a valid NIC: 9 digits and V or X, or 12 digits.';
const PHONE_ERROR = 'Enter a Sri Lankan mobile number, for example 077 123 4567.';

const goOn = (user: User) => user.click(screen.getByRole('button', { name: 'Continue' }));
const submit = (user: User) => user.click(screen.getByRole('button', { name: 'Create account' }));
const heading = (name: string) => screen.findByRole('heading', { level: 1, name });

/** Step 1: who the person is. The phone box already shows "+94", so the number is typed without it. */
async function fillAbout(user: User, phone = '77 123 4567') {
  await user.type(await screen.findByLabelText('Full name'), 'Test Citizen');
  await user.type(screen.getByLabelText('National Identity Card number'), '199012345678');
  await user.type(screen.getByLabelText('Mobile phone number'), phone);
  await user.type(screen.getByLabelText('Create a password'), 'correct horse battery');
}

/** Step 2: the district and the home location (typed by hand: the fallback every device has). */
async function fillLocation(
  user: User,
  { district = 'GAMPAHA', lat = '7.0873', lng = '79.9925' } = {},
) {
  await user.selectOptions(await screen.findByLabelText('District'), district);
  await user.type(screen.getByLabelText('Latitude'), lat);
  await user.type(screen.getByLabelText('Longitude'), lng);
}

/** Walks steps 1 and 2 and stops on step 3, ready for "Create account". */
async function reachLastStep(
  user: User,
  options: { district?: string; lat?: string; lng?: string; phone?: string } = {},
) {
  await fillAbout(user, options.phone);
  await goOn(user);
  await heading('Where you live');
  await fillLocation(user, options);
  await goOn(user);
  await heading('How we alert you');
}

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

describe('Registration page: the three steps', () => {
  beforeEach(anonymous);

  it('opens on step 1 with a counter, a title, the step list, and a way to sign in instead', async () => {
    renderRoutes(routes, { route: '/register' });

    expect(await heading('About you')).toBeInTheDocument();
    expect(screen.getByText('Step 1 of 3')).toBeInTheDocument();
    expect(screen.getByText('We use these details to confirm who you are.')).toBeInTheDocument();
    const steps = within(screen.getByRole('list', { name: 'Registration steps' }));
    expect(steps.getAllByRole('listitem')).toHaveLength(3);
    expect(steps.getByRole('listitem', { current: 'step' })).toHaveTextContent('About you');
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
  });

  it('frames the form with the photo panel for citizens', async () => {
    renderRoutes(routes, { route: '/register' });
    await heading('About you');

    expect(screen.getByText('Get warnings for the place you live')).toBeInTheDocument();
    expect(screen.getByText('Report hazards, even offline')).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: /Family arriving at a school safety centre/ }),
    ).toHaveAttribute('src', '/images/school-relief-check-in.webp');
    expect(screen.getByRole('link', { name: 'Back to home' })).toHaveAttribute('href', '/');
  });

  it('restores the tab title when leaving', async () => {
    const view = renderRoutes(routes, { route: '/register' });
    await heading('About you');
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
    expect(screen.getByText(NIC_ERROR)).toBeInTheDocument();
    expect(nic).toHaveAttribute('aria-invalid', 'true');

    await user.clear(nic);
    await user.type(nic, '199012345678');
    expect(screen.queryByText(NIC_ERROR)).not.toBeInTheDocument();
  });

  it('does not nag about fields the person has not reached yet', async () => {
    renderRoutes(routes, { route: '/register' });
    await screen.findByLabelText('Full name');

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('on "Continue" with gaps, lists that step’s problems, stays put and moves focus to the first', async () => {
    let requests = 0;
    server.use(
      http.post('/api/auth/register', () => ((requests += 1), okUser(makeCitizen(), 201))),
    );
    const user = userEvent.setup();
    renderRoutes(routes, { route: '/register' });
    await screen.findByLabelText('Full name');

    await goOn(user);

    expect(screen.getByText('Enter your full name.')).toBeInTheDocument();
    expect(screen.getByText(NIC_ERROR)).toBeInTheDocument();
    expect(screen.getByText(PHONE_ERROR)).toBeInTheDocument();
    expect(screen.getAllByText('Use at least 10 characters.').length).toBeGreaterThan(0);
    await waitFor(() => expect(screen.getByLabelText('Full name')).toHaveFocus());
    expect(screen.getByText('Step 1 of 3')).toBeInTheDocument();
    expect(screen.queryByText('Choose your district.')).not.toBeInTheDocument();
    expect(requests).toBe(0);
  });

  it('moves on to step 2 and puts the cursor on the new heading, so a screen reader announces it', async () => {
    const user = userEvent.setup();
    renderRoutes(routes, { route: '/register' });
    await fillAbout(user);

    await goOn(user);

    const title = await heading('Where you live');
    expect(screen.getByText('Step 2 of 3')).toBeInTheDocument();
    await waitFor(() => expect(title).toHaveFocus());
  });

  it('goes back a step and keeps what was typed', async () => {
    const user = userEvent.setup();
    renderRoutes(routes, { route: '/register' });
    await fillAbout(user);
    await goOn(user);
    await heading('Where you live');

    await user.click(screen.getByRole('button', { name: 'Back' }));

    await heading('About you');
    expect(screen.getByLabelText('Full name')).toHaveValue('Test Citizen');
    expect(screen.getByLabelText('Mobile phone number')).toHaveValue('77 123 4567');
  });

  it('lets a finished step be reopened from the step list, but never a step not yet reached', async () => {
    const user = userEvent.setup();
    renderRoutes(routes, { route: '/register' });
    await fillAbout(user);
    await goOn(user);
    await heading('Where you live');
    expect(screen.queryByRole('button', { name: /Go back to step 3/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Go back to step 1: About you' }));

    expect(await heading('About you')).toBeInTheDocument();
    expect(screen.getByLabelText('Full name')).toHaveValue('Test Citizen');
  });

  it('treats Enter in a field like "Continue"', async () => {
    const user = userEvent.setup();
    renderRoutes(routes, { route: '/register' });
    await fillAbout(user);

    await user.type(screen.getByLabelText('Create a password'), '{Enter}');

    expect(await heading('Where you live')).toBeInTheDocument();
  });

  it('describes the "+94" prefix and the SMS note together with the phone box', async () => {
    renderRoutes(routes, { route: '/register' });

    const phone = await screen.findByLabelText('Mobile phone number');

    expect(phone).toHaveAccessibleDescription('+94 SMS warnings are sent to this number.');
    expect(phone).toHaveAttribute('placeholder', '77 123 4567');
  });
});

describe('Registration page: submitting', () => {
  beforeEach(anonymous);

  it('registers, completes the number with +94, and lands the citizen on their home screen', async () => {
    const bodies = captureRegistrations();
    const user = userEvent.setup();
    const view = renderRoutes(routes, { route: '/register' });
    await reachLastStep(user);

    await submit(user);

    expect(await screen.findByRole('heading', { name: 'Hazard Reports' })).toBeInTheDocument();
    expect(view.router.state.location.pathname).toBe('/hazard-reports');
    expect(bodies[0]).toMatchObject({
      nic: '199012345678',
      fullName: 'Test Citizen',
      phone: '+94771234567',
      district: 'GAMPAHA',
      homeLocation: { lat: 7.0873, lng: 79.9925 },
      preferredLanguage: 'EN',
      whatsappOptIn: false,
      emailOptIn: false,
      confirmDistrictMismatch: false,
    });
  });

  it('also accepts a number typed in full, and sends it just as typed', async () => {
    const bodies = captureRegistrations();
    const user = userEvent.setup();
    renderRoutes(routes, { route: '/register' });
    await reachLastStep(user, { phone: '077 123 4567' });

    await submit(user);

    await screen.findByRole('heading', { name: 'Hazard Reports' });
    expect(bodies[0]).toMatchObject({ phone: '077 123 4567' });
  });

  it('shows progress and blocks a second click while registering', async () => {
    captureRegistrations(
      async () => (await delay(80), okUser(makeCitizen(), 201)) as unknown as Response,
    );
    const user = userEvent.setup();
    renderRoutes(routes, { route: '/register' });
    await reachLastStep(user);

    await submit(user);

    expect(await screen.findByRole('button', { name: /Creating account…/ })).toBeDisabled();
    await screen.findByRole('heading', { name: 'Hazard Reports' });
  });

  it('puts a duplicate-NIC answer on the NIC field, takes the person back to step 1, and clears it when edited', async () => {
    captureRegistrations(() => apiError(409, 'NIC_ALREADY_REGISTERED') as unknown as Response);
    const user = userEvent.setup();
    renderRoutes(routes, { route: '/register' });
    await reachLastStep(user);

    await submit(user);

    expect(await heading('About you')).toBeInTheDocument();
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

  it('maps a 400 field list from the server onto the step that owns the field', async () => {
    captureRegistrations(
      () =>
        apiError(400, 'VALIDATION_FAILED', {
          fields: [{ field: 'phone', code: 'PHONE_INVALID' }],
        }) as unknown as Response,
    );
    const user = userEvent.setup();
    renderRoutes(routes, { route: '/register' });
    await reachLastStep(user);

    await submit(user);

    expect(await heading('About you')).toBeInTheDocument();
    expect(await screen.findByText(PHONE_ERROR)).toBeInTheDocument();
  });

  it('shows a general alert for a failure that is not about one field', async () => {
    captureRegistrations(() => apiError(500, 'INTERNAL_ERROR') as unknown as Response);
    const user = userEvent.setup();
    renderRoutes(routes, { route: '/register' });
    await reachLastStep(user);

    await submit(user);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Something went wrong. Please try again.',
    );
    expect(screen.getByText('Step 3 of 3')).toBeInTheDocument();
  });

  it('says so when offline, and keeps everything typed', async () => {
    server.use(http.post('/api/auth/register', () => HttpResponse.error()));
    const user = userEvent.setup();
    renderRoutes(routes, { route: '/register' });
    await reachLastStep(user);

    await submit(user);

    expect(
      await screen.findByText('You appear to be offline. Check your connection and try again.'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Go back to step 1: About you' }));
    expect(await screen.findByLabelText('Full name')).toHaveValue('Test Citizen');
  });

  it('asks for an email address only when email alerts are wanted, and requires it then', async () => {
    const user = userEvent.setup();
    renderRoutes(routes, { route: '/register' });
    await reachLastStep(user);
    expect(screen.queryByLabelText('Email address')).not.toBeInTheDocument();

    await user.click(screen.getByRole('switch', { name: 'Also send by email' }));
    await user.click(screen.getByLabelText('Email address'));
    await user.tab();

    expect(screen.getByText('Enter an email address to receive email alerts.')).toBeInTheDocument();
  });

  it('on "Create account" with email wanted but missing, stays on step 3 and focuses the email box', async () => {
    let requests = 0;
    server.use(
      http.post('/api/auth/register', () => ((requests += 1), okUser(makeCitizen(), 201))),
    );
    const user = userEvent.setup();
    renderRoutes(routes, { route: '/register' });
    await reachLastStep(user);
    await user.click(screen.getByRole('switch', { name: 'Also send by email' }));

    await submit(user);

    expect(screen.getByText('Step 3 of 3')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Email address')).toHaveFocus());
    expect(requests).toBe(0);
  });

  it('sends the WhatsApp and email choices, with the address', async () => {
    const bodies = captureRegistrations();
    const user = userEvent.setup();
    renderRoutes(routes, { route: '/register' });
    await fillAbout(user);
    await goOn(user);
    await heading('Where you live');
    await fillLocation(user);
    await user.type(screen.getByLabelText(/Home address/), '12 Temple Road');
    await goOn(user);
    await heading('How we alert you');
    await user.click(screen.getByRole('switch', { name: 'Also send by WhatsApp' }));
    await user.click(screen.getByRole('switch', { name: 'Also send by email' }));
    await user.type(screen.getByLabelText('Email address'), 'citizen@example.com');

    await submit(user);

    await screen.findByRole('heading', { name: 'Hazard Reports' });
    expect(bodies[0]).toMatchObject({
      whatsappOptIn: true,
      emailOptIn: true,
      email: 'citizen@example.com',
      addressLine: '12 Temple Road',
    });
  });

  it('offers SMS and push as a switch that is always on', async () => {
    const user = userEvent.setup();
    renderRoutes(routes, { route: '/register' });
    await reachLastStep(user);

    const always = screen.getByRole('switch', { name: 'SMS and push notification' });

    expect(always).toBeChecked();
    expect(always).toBeDisabled();
    expect(always).toHaveAccessibleDescription('Always on for warnings');
  });

  it('keeps the alert language in step with the page language until the person chooses one', async () => {
    const user = userEvent.setup();
    renderRoutes(routes, { route: '/register' });
    await reachLastStep(user);
    expect(screen.getByRole('radio', { name: 'English' })).toBeChecked();

    await user.click(screen.getByRole('button', { name: 'සිංහල' }));
    expect(screen.getByRole('radio', { name: 'සිංහල' })).toBeChecked();

    await user.click(screen.getByRole('radio', { name: 'தமிழ்' }));
    await user.click(screen.getByRole('button', { name: 'English' }));
    expect(screen.getByRole('radio', { name: 'தமிழ்' })).toBeChecked();
  });

  it('marks each language choice with its own language', async () => {
    const user = userEvent.setup();
    renderRoutes(routes, { route: '/register' });
    await reachLastStep(user);

    expect(screen.getByText('සිංහල', { selector: 'span' })).toHaveAttribute('lang', 'si');
    expect(screen.getByText('தமிழ்', { selector: 'span' })).toHaveAttribute('lang', 'ta');
  });
});

describe('Registration: district confirmation (master plan §7.1.2)', () => {
  beforeEach(anonymous);

  const mismatch = () =>
    apiError(422, 'DISTRICT_LOCATION_MISMATCH', {
      details: { suggestedDistrict: 'COLOMBO' },
    }) as unknown as Response;
  const jaffnaWithColomboPin = { district: 'JAFFNA', lat: '6.9271', lng: '79.8612' };

  it('offers the nearer district when the pin and the choice disagree', async () => {
    captureRegistrations(mismatch);
    const user = userEvent.setup();
    renderRoutes(routes, { route: '/register' });
    await reachLastStep(user, jaffnaWithColomboPin);

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
    await reachLastStep(user, jaffnaWithColomboPin);
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
    await reachLastStep(user, jaffnaWithColomboPin);
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
    await reachLastStep(user, jaffnaWithColomboPin);
    await submit(user);
    await screen.findByRole('dialog');

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('Step 3 of 3')).toBeInTheDocument();
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
    await reachLastStep(user);

    await submit(user);

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('puts "outside Sri Lanka" on the location field, back on step 2', async () => {
    captureRegistrations(() => apiError(422, 'LOCATION_OUTSIDE_SRI_LANKA') as unknown as Response);
    const user = userEvent.setup();
    renderRoutes(routes, { route: '/register' });
    await reachLastStep(user);

    await submit(user);

    expect(await heading('Where you live')).toBeInTheDocument();
    expect(await screen.findByText('This location is outside Sri Lanka.')).toBeInTheDocument();
  });
});

describe('Registration: the home location', () => {
  beforeEach(anonymous);

  async function reachLocationStep(user: User) {
    await fillAbout(user);
    await goOn(user);
    await heading('Where you live');
  }

  it('fills in the coordinates from the device when asked, and shows them on the button', async () => {
    stubGeolocation(((success: PositionCallback) =>
      success({
        coords: { latitude: 7.087312, longitude: 79.992512 },
      } as GeolocationPosition)) as never);
    const user = userEvent.setup();
    renderRoutes(routes, { route: '/register' });
    await reachLocationStep(user);

    await user.click(screen.getByRole('button', { name: /Use my current location/ }));

    expect(screen.getByLabelText('Latitude')).toHaveValue('7.08731');
    expect(screen.getByLabelText('Longitude')).toHaveValue('79.99251');
    expect(screen.getByRole('button', { name: /Location set/ })).toHaveTextContent(
      '7.08731, 79.99251',
    );
    expect(screen.getByText('Location set: 7.08731, 79.99251')).toBeInTheDocument();
  });

  it('keeps the by-hand coordinates tucked away until they are needed', async () => {
    const user = userEvent.setup();
    renderRoutes(routes, { route: '/register' });
    await reachLocationStep(user);

    const details = screen.getByText('Enter coordinates by hand').closest('details');

    expect(details).not.toHaveAttribute('open');
    expect(screen.getByText('Or type the coordinates below')).toBeInTheDocument();
  });

  it('explains what to do when location access is refused, and opens the by-hand boxes', async () => {
    stubGeolocation(((_ok: PositionCallback, fail: PositionErrorCallback) =>
      fail({ code: 1 } as GeolocationPositionError)) as never);
    const user = userEvent.setup();
    renderRoutes(routes, { route: '/register' });
    await reachLocationStep(user);

    await user.click(screen.getByRole('button', { name: /Use my current location/ }));

    expect(await screen.findByText(/We could not read your location/)).toBeInTheDocument();
    expect(screen.getByText('Enter coordinates by hand').closest('details')).toHaveAttribute(
      'open',
    );
  });

  it('explains it when the device cannot share a location at all', async () => {
    stubGeolocation(undefined);
    const user = userEvent.setup();
    renderRoutes(routes, { route: '/register' });
    await reachLocationStep(user);

    await user.click(screen.getByRole('button', { name: /Use my current location/ }));

    expect(await screen.findByText(/cannot share its location/)).toBeInTheDocument();
    expect(screen.getByText('Enter coordinates by hand').closest('details')).toHaveAttribute(
      'open',
    );
  });

  it('shows the finding-location state while the device thinks', async () => {
    stubGeolocation((() => undefined) as never);
    const user = userEvent.setup();
    renderRoutes(routes, { route: '/register' });
    await reachLocationStep(user);

    await user.click(screen.getByRole('button', { name: /Use my current location/ }));

    expect(screen.getByRole('button', { name: /Finding your location…/ })).toBeDisabled();
  });

  it('rejects a coordinate that is not a number, and opens the by-hand boxes to show it', async () => {
    const user = userEvent.setup();
    renderRoutes(routes, { route: '/register' });
    await reachLocationStep(user);
    await user.type(screen.getByLabelText('Latitude'), 'north');
    await user.tab();

    expect(screen.getByText('Enter a valid latitude and longitude.')).toBeInTheDocument();
    expect(screen.getByText('Enter coordinates by hand').closest('details')).toHaveAttribute(
      'open',
    );
  });

  it('refuses to continue without a district or a location, and says so', async () => {
    const user = userEvent.setup();
    renderRoutes(routes, { route: '/register' });
    await reachLocationStep(user);

    await goOn(user);

    expect(screen.getByText('Choose your district.')).toBeInTheDocument();
    expect(screen.getByText('Set your home location.')).toBeInTheDocument();
    expect(screen.getByText('Step 2 of 3')).toBeInTheDocument();
  });

  it('says why the NIC and address are asked for, next to the address box', async () => {
    const user = userEvent.setup();
    renderRoutes(routes, { route: '/register' });
    await reachLocationStep(user);

    expect(screen.getByText(/stored encrypted and never shown in full/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Home address/)).toBeInTheDocument();
  });
});

describe('Registration: the password', () => {
  beforeEach(anonymous);

  const meter = () => screen.getByRole('meter', { name: 'Password strength' });

  it('can be revealed and hidden again, to check a typo on a phone keyboard', async () => {
    const user = userEvent.setup();
    renderRoutes(routes, { route: '/register' });
    const password = await screen.findByLabelText('Create a password');
    await user.type(password, 'correct horse battery');

    await user.click(screen.getByRole('button', { name: 'Show' }));
    expect(password).toHaveAttribute('type', 'text');

    await user.click(screen.getByRole('button', { name: 'Hide' }));
    expect(password).toHaveAttribute('type', 'password');
  });

  it.each([
    ['', 0, 'At least 10 characters. A few words in a row make a strong password.'],
    ['abc', 1, 'Too short. Use at least 10 characters.'],
    ['abcdefgh', 2, 'Too short. Use at least 10 characters.'],
    ['password123', 2, 'This password is too easy to guess. Choose another.'],
    ['x'.repeat(129), 2, 'Use at most 128 characters.'],
    ['correcthorse', 3, 'Strong enough.'],
    ['correct horse battery', 4, 'Strong enough.'],
  ])('rates %j as level %i and says "%s"', async (typed, level, message) => {
    renderRoutes(routes, { route: '/register' });
    const password = await screen.findByLabelText('Create a password');

    if (typed) await userEvent.type(password, typed, { delay: null });

    expect(meter()).toHaveAttribute('aria-valuenow', String(level));
    expect(meter()).toHaveAttribute('aria-valuetext', message);
    expect(screen.getByText(message)).toBeInTheDocument();
  });

  it('is described together with its strength note for screen readers', async () => {
    renderRoutes(routes, { route: '/register' });

    const password = await screen.findByLabelText('Create a password');

    expect(password).toHaveAccessibleDescription(/At least 10 characters/);
  });
});

describe('Registration: other languages and signed-in visitors', () => {
  beforeEach(anonymous);

  it('can be filled in Sinhala, with the step counter and title in Sinhala', async () => {
    renderRoutes(routes, { route: '/register', language: 'SI' });

    expect(await heading('ඔබ ගැන')).toBeInTheDocument();
    expect(screen.getByText('පියවර 1 / 3')).toBeInTheDocument();
    expect(screen.getByLabelText('සම්පූර්ණ නම')).toBeInTheDocument();
  });

  it('shows district names in both scripts once the page is switched to Sinhala', async () => {
    const user = userEvent.setup();
    renderRoutes(routes, { route: '/register' });
    await fillAbout(user);
    await goOn(user);
    await heading('Where you live');

    await user.click(screen.getByRole('button', { name: 'සිංහල' }));

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
