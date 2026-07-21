import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAuthStore } from '../useAuthStore';

beforeEach(() => {
  useAuthStore.setState({
    user: null,
    token: null,
    loading: true,
    error: null,
  });
  localStorage.clear();
});

describe('useAuthStore', () => {
  it('starts with loading true and no user', () => {
    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.token).toBeNull();
    expect(state.loading).toBe(true);
    expect(state.error).toBeNull();
  });

  it('logout clears user and token', async () => {
    useAuthStore.setState({ user: { username: 'test' }, token: 'abc' });
    await useAuthStore.getState().logout();
    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.token).toBeNull();
    expect(localStorage.getItem('token')).toBeNull();
  });

  it('login sets user and token on success', async () => {
    const fakeToken = 'test-token';
    const fakeUser = { username: 'alice', email: 'alice@test.com' };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ token: fakeToken, user: fakeUser }),
    });

    await useAuthStore.getState().login('alice', 'pass');
    const state = useAuthStore.getState();
    expect(state.user).toEqual(fakeUser);
    expect(state.token).toBe(fakeToken);
    expect(state.loading).toBe(false);
    expect(localStorage.getItem('token')).toBe(fakeToken);
  });

  it('login sets error on failure', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Invalid credentials' }),
    });

    await expect(useAuthStore.getState().login('bad', 'creds')).rejects.toThrow('Invalid credentials');
    const state = useAuthStore.getState();
    expect(state.error).toBe('Invalid credentials');
    expect(state.loading).toBe(false);
  });

  it('fetchMe sets user when token exists', async () => {
    localStorage.setItem('token', 'valid');
    const fakeUser = { username: 'bob' };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ user: fakeUser }),
    });

    await useAuthStore.getState().fetchMe();
    const state = useAuthStore.getState();
    expect(state.user).toEqual(fakeUser);
    expect(state.loading).toBe(false);
  });

  it('fetchMe logs out on failure', async () => {
    localStorage.setItem('token', 'expired');

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Unauthorized' }),
    });

    await useAuthStore.getState().fetchMe();
    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.token).toBeNull();
  });
});
