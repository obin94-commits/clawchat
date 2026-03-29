import Constants from 'expo-constants';

const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string | undefined>;

/** Base HTTP URL for the ClawChat server */
export const SERVER_URL: string =
  extra['SERVER_URL'] ??
  process.env['EXPO_PUBLIC_SERVER_URL'] ??
  'http://localhost:3001';

/** WebSocket URL derived from SERVER_URL */
export const WS_URL: string = SERVER_URL.replace(/^http/, 'ws');

/**
 * Bearer token for authenticated servers (set CLAWCHAT_API_KEY on server).
 * Leave blank in dev — server will accept all requests when CLAWCHAT_API_KEY is unset.
 */
export const API_KEY: string =
  extra['API_KEY'] ??
  process.env['EXPO_PUBLIC_API_KEY'] ??
  '';

/** Build Authorization header value, or undefined if no key configured */
export function authHeader(): { Authorization: string } | Record<string, never> {
  return API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {};
}
