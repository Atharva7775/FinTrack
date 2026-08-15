import { buildTransactionPayload, getApiBaseUrl, submitTransaction } from './transactions';

jest.mock('react-native', () => ({
  Platform: {
    OS: 'android',
  },
}));

describe('buildTransactionPayload', () => {
  it('includes the user email, source, and pending status', () => {
    const payload = buildTransactionPayload(
      {
        amount: 24.5,
        type: 'expense',
        category: 'Food',
        note: 'Lunch',
        date: '2026-08-08',
      },
      'demo@fintrack.app'
    );

    expect(payload.user_email).toBe('demo@fintrack.app');
    expect(payload.source).toBe('mobile');
    expect(payload.isPending).toBe(true);
    expect(payload.id).toContain('mobile-');
  });
});

describe('getApiBaseUrl', () => {
  it('uses the Android emulator host for Android builds', () => {
    expect(getApiBaseUrl()).toBe('http://10.0.2.2:3001');
  });
});

describe('submitTransaction', () => {
  it('includes a bearer token header when one is available', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ ok: true }),
    });

    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await submitTransaction(
      {
        id: 'mobile-test',
        user_email: 'demo@fintrack.app',
        amount: 24.5,
        type: 'expense',
        category: 'Food',
        note: 'Lunch',
        date: '2026-08-08',
        source: 'mobile',
        isPending: true,
      },
      'demo-token'
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'http://10.0.2.2:3001/api/transactions',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer demo-token',
        }),
      })
    );
  });
});
