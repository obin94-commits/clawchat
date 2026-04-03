import Constants from 'expo-constants';

const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string | undefined>;

function detectServerUrl(): string {
  // If running in browser, detect from current hostname
  if (typeof window !== 'undefined' && window.location) {
    const host = window.location.hostname;
    if (host.includes('c1aim.com')) {
      return 'https://clawchat-api.c1aim.com';
    }
    if (host === '100.78.90.51') {
      return 'http://100.78.90.51:3001';
    }
  }
  return extra['SERVER_URL'] ?? process.env['EXPO_PUBLIC_SERVER_URL'] ?? 'http://100.78.90.51:3001';
}

/** Base HTTP URL for the ClawChat server */
export const SERVER_URL: string = detectServerUrl();

/** WebSocket URL derived from SERVER_URL */
export const WS_URL: string = SERVER_URL.replace(/^http/, 'ws');

/**
 * Bearer token for authenticated servers.
 */
export const API_KEY: string =
  extra['API_KEY'] ??
  process.env['EXPO_PUBLIC_API_KEY'] ??
  'clawchat-dev-2026';

/** Build Authorization header value, or undefined if no key configured */
export function authHeader(): { Authorization: string } | Record<string, never> {
  return API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {};
}
