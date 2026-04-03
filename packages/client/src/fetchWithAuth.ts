export function fetchWithAuth(
  url: string,
  options: RequestInit = {},
  apiKey?: string,
): Promise<Response> {
  const headers: HeadersInit = { ...options.headers };

  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  return fetch(url, { ...options, headers });
}
