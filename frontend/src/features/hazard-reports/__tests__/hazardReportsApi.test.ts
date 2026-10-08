import { createApiClient } from '@/shared/api/apiClient';
import { hazardReportsApi } from '../api/hazardReportsApi';

const response = { marker: 'server response' };

function fixture() {
  const requests: { path: string; method: string; body: unknown }[] = [];
  const api = createApiClient({
    baseUrl: 'http://localhost',
    fetchImpl: async (input, init) => {
      requests.push({
        path: String(input).replace('http://localhost', ''),
        method: String(init?.method),
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      });
      return new Response(JSON.stringify(response), { status: 200 });
    },
  });
  return { client: hazardReportsApi(api), requests };
}

describe('UC-3 A2: web API contract', () => {
  it.each([
    ['queue', '/api/hazard-reports/clusters?status=OPEN,ESCALATION_RECOMMENDED'],
    ['escalated', '/api/hazard-reports/clusters?status=ESCALATED'],
    ['mine', '/api/hazard-reports'],
  ] as const)('UC-3 A2: %s returns the server response', async (method, path) => {
    const { client, requests } = fixture();
    expect(await client[method]()).toEqual(response);
    expect(requests).toEqual([{ path, method: 'GET', body: undefined }]);
  });

  it.each([
    ['cluster', '/api/hazard-reports/clusters/a%2Fb%20%3F', 'GET'],
    ['report', '/api/hazard-reports/a%2Fb%20%3F', 'GET'],
    ['verify', '/api/hazard-reports/a%2Fb%20%3F/verify', 'POST'],
    ['escalate', '/api/hazard-reports/clusters/a%2Fb%20%3F/escalate', 'POST'],
  ] as const)('UC-3 A2: %s encodes the identifier', async (method, path, verb) => {
    const { client, requests } = fixture();
    expect(await client[method]('a/b ?')).toEqual(response);
    expect(requests).toEqual([{ path, method: verb, body: undefined }]);
  });

  it.each([
    [{}, ''],
    [{ q: '' }, ''],
    [{ status: 'REJECTED' as const }, '?status=REJECTED'],
    [{ q: 'bridge & road' }, '?q=bridge+%26+road'],
    [{ status: 'REJECTED' as const, q: 'bridge road' }, '?status=REJECTED&q=bridge+road'],
  ])('UC-3 A2: history serializes filters %j', async (filter, suffix) => {
    const { client, requests } = fixture();
    expect(await client.history(filter)).toEqual(response);
    expect(requests).toEqual([
      { path: `/api/hazard-reports${suffix}`, method: 'GET', body: undefined },
    ]);
  });

  it('UC-3 A2: rejection sends the reason with an encoded identifier', async () => {
    const { client, requests } = fixture();
    expect(await client.reject('a/b', 'Not a hazard')).toEqual(response);
    expect(requests).toEqual([
      {
        path: '/api/hazard-reports/a%2Fb/reject',
        method: 'POST',
        body: { reason: 'Not a hazard' },
      },
    ]);
  });

  it('UC-3 A2: preserves server errors for the translated UI', async () => {
    const api = createApiClient({
      baseUrl: 'http://localhost',
      fetchImpl: async () =>
        new Response(
          JSON.stringify({ error: { code: 'REPORT_ALREADY_REVIEWED', message: 'Reviewed' } }),
          { status: 409 },
        ),
    });
    await expect(hazardReportsApi(api).verify('r1')).rejects.toMatchObject({
      code: 'REPORT_ALREADY_REVIEWED',
      status: 409,
    });
  });
});
