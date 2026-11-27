import axios, { AxiosError } from 'axios';

export const TOKEN_KEY = 'mp_token';

/** Shared axios instance. `/api` is proxied to the Express server in development. */
export const api = axios.create({ baseURL: '/api', timeout: 10000 });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

/** 401 codes the API sends when the JWT itself is missing, expired, invalid or revoked. */
const SESSION_CODES = new Set(['NO_TOKEN', 'TOKEN_EXPIRED', 'TOKEN_INVALID', 'TOKEN_REVOKED']);
let onSessionEnded: ((message: string) => void) | null = null;

/** AuthService registers here to sign the user out when the API rejects their token. */
export function setSessionEndedHandler(handler: (message: string) => void): void {
  onSessionEnded = handler;
}

// A rejected session token (not a wrong password, which has no code) ends the session.
api.interceptors.response.use(undefined, (error: unknown) => {
  if (error instanceof AxiosError && error.response?.status === 401) {
    const data = error.response.data as { code?: string; message?: string } | undefined;
    if (data?.code && SESSION_CODES.has(data.code)) {
      onSessionEnded?.(data.message ?? 'Your session has ended. Please log in again.');
    }
  }
  return Promise.reject(error);
});

/** Turns any axios/network error into a message suitable for the UI. */
export function errorMessage(err: unknown): string {
  if (err instanceof AxiosError) {
    const data = err.response?.data as { message?: string } | undefined;
    if (data?.message) return data.message;
    if (!err.response) return 'Cannot reach the server. Is the backend running?';
  }
  return 'Something went wrong. Please try again.';
}
