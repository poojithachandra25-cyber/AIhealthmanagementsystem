import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { AxiosError, AxiosHeaders } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, TOKEN_KEY } from './api';
import { AuthService } from './auth.service';

const USER_KEY = 'mp_user';
const user = { id: 1, name: 'Test Patient', email: 'p@x.com', role: 'patient', createdAt: '2026-11-19' };

/** An unsigned JWT-shaped token; the frontend only reads `exp`, the API checks the signature. */
function fakeToken(expSecondsFromNow: number): string {
  const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  const exp = Math.floor(Date.now() / 1000) + expSecondsFromNow;
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: '1', role: 'patient', exp })}.signature`;
}

function create(): AuthService {
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  return TestBed.inject(AuthService);
}

/** Runs the response interceptors' error handler the way axios would for a failed request. */
async function reject401(data: object): Promise<void> {
  const handlers = (api.interceptors.response as unknown as {
    handlers: { rejected?: (e: unknown) => Promise<unknown> }[];
  }).handlers;
  const error = new AxiosError('401', 'ERR_BAD_REQUEST', undefined, undefined, {
    status: 401,
    statusText: 'Unauthorized',
    data,
    headers: {},
    config: { headers: new AxiosHeaders() },
  });
  for (const h of handlers) await h.rejected?.(error).catch(() => undefined);
}

describe('AuthService (JWT session)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(api, 'get').mockResolvedValue({ data: { user } });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  it('drops an expired token on load and explains why', () => {
    localStorage.setItem(TOKEN_KEY, fakeToken(-60));
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    const auth = create();
    expect(auth.isLoggedIn()).toBe(false);
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(auth.takeSessionNotice()).toContain('expired');
  });

  it('restores a valid token and confirms it with the API', () => {
    localStorage.setItem(TOKEN_KEY, fakeToken(3600));
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    const auth = create();
    expect(auth.isLoggedIn()).toBe(true);
    expect(api.get).toHaveBeenCalledWith('/auth/me');
  });

  it('ends the session when the API rejects the token', async () => {
    localStorage.setItem(TOKEN_KEY, fakeToken(3600));
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    const auth = create();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    await reject401({ code: 'TOKEN_REVOKED', message: 'Your password was changed. Please log in again.' });

    expect(auth.isLoggedIn()).toBe(false);
    expect(navigate).toHaveBeenCalledWith(['/login']);
    expect(auth.takeSessionNotice()).toContain('password was changed');
  });

  it('keeps the session on a 401 that is not about the token (e.g. wrong password)', async () => {
    localStorage.setItem(TOKEN_KEY, fakeToken(3600));
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    const auth = create();
    await reject401({ message: 'Invalid email or password.' });
    expect(auth.isLoggedIn()).toBe(true);
  });

  it('stores the refreshed token after a password change', () => {
    localStorage.setItem(TOKEN_KEY, fakeToken(3600));
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    const auth = create();
    const fresh = fakeToken(7200);
    auth.setToken(fresh);
    expect(localStorage.getItem(TOKEN_KEY)).toBe(fresh);
  });
});
