import { computed, inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { api, setSessionEndedHandler, TOKEN_KEY } from './api';

export type Role = 'patient' | 'doctor' | 'admin';

export interface User {
  id: number;
  name: string;
  email: string;
  phone?: string;
  role: Role;
  specialization?: string;
  createdAt: string;
}

export interface RegisterPayload {
  name: string;
  email: string;
  phone?: string;
  password: string;
  role: Role;
}

interface AuthResponse {
  token: string;
  user: User;
}

const USER_KEY = 'mp_user';
/** setTimeout can't wait longer than ~24.8 days. */
const MAX_TIMER_MS = 2_147_483_647;

/** Expiry (ms since epoch) from a JWT's `exp` claim, or null if it can't be read. */
function tokenExpiry(token: string): number | null {
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const { exp } = JSON.parse(atob(payload)) as { exp?: number };
    return typeof exp === 'number' ? exp * 1000 : null;
  } catch {
    return null;
  }
}

/**
 * JWT session (Specs/login.md): the API issues a signed token at login/sign-up, the axios
 * instance sends it as a Bearer token, and this service keeps the session in step with it:
 * expired tokens are dropped on load, the user is signed out when the token expires, and any
 * 401 that says the token is no longer valid ends the session and returns to Login.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly router = inject(Router);
  /** Why the last session ended (shown once on the Login page). Declared before restore() runs. */
  readonly sessionNotice = signal('');
  private readonly currentUser = signal<User | null>(this.restore());
  private expiryTimer?: ReturnType<typeof setTimeout>;

  readonly user = this.currentUser.asReadonly();
  readonly isLoggedIn = computed(() => this.currentUser() !== null);

  constructor() {
    setSessionEndedHandler((message) => this.endSession(message));
    if (this.currentUser()) {
      this.scheduleExpiry(localStorage.getItem(TOKEN_KEY));
      // Confirm the stored token with the API and refresh the user's details.
      api
        .get<{ user: User }>('/auth/me')
        .then(({ data }) => this.updateUser(data.user))
        .catch(() => undefined); // a rejected token is handled by the 401 interceptor
    }
  }

  async login(email: string, password: string, role: Role): Promise<User> {
    const { data } = await api.post<AuthResponse>('/auth/login', { email, password, role });
    return this.persist(data);
  }

  async register(payload: RegisterPayload): Promise<User> {
    const { data } = await api.post<AuthResponse>('/auth/register', payload);
    return this.persist(data);
  }

  logout(): void {
    clearTimeout(this.expiryTimer);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    this.currentUser.set(null);
  }

  /** Replaces the token, e.g. the fresh one the API returns after a password change. */
  setToken(token: string): void {
    localStorage.setItem(TOKEN_KEY, token);
    this.scheduleExpiry(token);
  }

  /** Merges changes into the signed-in user, e.g. a doctor's new specialization. */
  updateUser(patch: Partial<User>): void {
    const user = this.currentUser();
    if (!user) return;
    const next = { ...user, ...patch };
    localStorage.setItem(USER_KEY, JSON.stringify(next));
    this.currentUser.set(next);
  }

  /** Reads and clears the notice for the Login page. */
  takeSessionNotice(): string {
    const notice = this.sessionNotice();
    this.sessionNotice.set('');
    return notice;
  }

  /** Signs out because the token expired or the API rejected it, then shows Login. */
  private endSession(message: string): void {
    if (!this.currentUser()) return;
    this.logout();
    this.sessionNotice.set(message);
    this.router.navigate(['/login']);
  }

  private persist({ token, user }: AuthResponse): User {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    this.currentUser.set(user);
    this.sessionNotice.set('');
    this.scheduleExpiry(token);
    return user;
  }

  /** Signs the user out the moment their token expires. */
  private scheduleExpiry(token: string | null): void {
    clearTimeout(this.expiryTimer);
    const expiresAt = token ? tokenExpiry(token) : null;
    if (!expiresAt) return;
    const wait = Math.min(Math.max(expiresAt - Date.now(), 0), MAX_TIMER_MS);
    this.expiryTimer = setTimeout(
      () => this.endSession('Your session has expired. Please log in again.'),
      wait,
    );
  }

  /** The stored user, only while their token exists and hasn't expired. */
  private restore(): User | null {
    try {
      const raw = localStorage.getItem(USER_KEY);
      const token = localStorage.getItem(TOKEN_KEY);
      const expiresAt = token ? tokenExpiry(token) : null;
      if (!raw || !token || !expiresAt || expiresAt <= Date.now()) {
        if (raw || token) {
          localStorage.removeItem(TOKEN_KEY);
          localStorage.removeItem(USER_KEY);
          this.sessionNotice.set('Your session has expired. Please log in again.');
        }
        return null;
      }
      return JSON.parse(raw) as User;
    } catch {
      return null;
    }
  }
}
