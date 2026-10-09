import { vi } from 'vitest';
import { createApiClient } from '@/shared/api/apiClient';
import { exportReport, downloadFile } from '../exportReport';
import { dashboard } from '../testing/fixtures';
import { analyticsNav } from '../nav';
const options = { format: 'CSV', audience: 'EXTERNAL', datasets: ['alerts'] } as const;
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});
describe('UC-4 binary report adapter', () => {
  it('UC-4 navigation: three primary analytics actors share one route', () => {
    expect(analyticsNav.roles).toEqual(['DMC_OFFICER', 'NGO_MANAGER', 'DONOR']);
    expect(analyticsNav.to).toBe('/analytics');
  });
  it('UC-4 session refresh: expired token refreshed once and binary request retried', async () => {
    const api = createApiClient();
    const refresh = vi.spyOn(api, 'refreshSession').mockResolvedValue(true);
    const send = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { code: 'UNAUTHENTICATED', message: 'Sign in' } }), {
          status: 401,
        }),
      )
      .mockResolvedValueOnce(
        new Response('csv', {
          headers: {
            'Content-Disposition': 'attachment; filename="file.csv"',
            'X-Report-Checksum': 'hash',
            'X-Report-Attempts': '1',
          },
        }),
      );
    const result = await exportReport(api, dashboard.filter, { ...options, datasets: ['alerts'] });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledTimes(2);
    expect(result.filename).toBe('file.csv');
    expect(result.generatedAt).toBe('');
  });
  it('UC-4 session refresh failure: throws error without issuing a second export', async () => {
    const api = createApiClient();
    vi.spyOn(api, 'refreshSession').mockResolvedValue(false);
    const send = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 'UNAUTHENTICATED', message: 'Sign in' } }), {
        status: 401,
      }),
    );
    await expect(
      exportReport(api, dashboard.filter, { ...options, datasets: ['alerts'] }),
    ).rejects.toMatchObject({ status: 401 });
    expect(send).toHaveBeenCalledTimes(1);
  });
  it('UC-4 binary metadata: absent headers get safe fallback values', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('csv'));
    const result = await exportReport(createApiClient(), dashboard.filter, {
      ...options,
      datasets: ['alerts'],
    });
    expect(result).toMatchObject({
      filename: 'impact-report.csv',
      checksum: '',
      generatedAt: '',
      attempts: 1,
    });
  });
  it('UC-4 download: object URL is released after browser download', () => {
    vi.useFakeTimers();
    Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:file'), revokeObjectURL: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    downloadFile({
      blob: new Blob(['csv']),
      filename: 'file.csv',
      checksum: 'h',
      generatedAt: 't',
      attempts: 1,
    });
    vi.advanceTimersByTime(1000);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:file');
  });
});
