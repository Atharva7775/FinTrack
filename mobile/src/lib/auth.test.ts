import { serializeAuthState, parseStoredAuthState } from './auth';

describe('auth storage helpers', () => {
  it('serializes and parses a user payload', () => {
    const payload = serializeAuthState({
      name: 'Alice',
      email: 'alice@example.com',
      picture: 'https://example.com/a.png',
    }, 'demo-token');

    expect(payload.user.email).toBe('alice@example.com');
    expect(payload.idToken).toBe('demo-token');

    const parsed = parseStoredAuthState(JSON.stringify(payload));
    expect(parsed?.user.name).toBe('Alice');
    expect(parsed?.idToken).toBe('demo-token');
  });
});
