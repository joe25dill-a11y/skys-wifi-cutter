function resolveApiBase(): string {
  if (typeof window !== 'undefined' && window.location.protocol === 'file:') {
    return 'http://127.0.0.1:3001/api';
  }

  const configured = import.meta.env.VITE_API_URL;

  if (!configured) {
    return '/api';
  }

  const trimmed = String(configured).replace(/\/$/, '');
  if (trimmed.endsWith('/api')) {
    return trimmed;
  }

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return `${trimmed}/api`;
  }

  if (trimmed.startsWith('/')) {
    return trimmed === '/' ? '/api' : trimmed;
  }

  return '/api';
}

const API_BASE = resolveApiBase();

export class ApiError extends Error {
  status: number;
  data: unknown;

  constructor(message: string, status: number, data?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

async function parseJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text) {
    return {} as T;
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiError(
      text.length > 200 ? `${text.slice(0, 200)}…` : text,
      response.status,
      { raw: text }
    );
  }
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const response = await fetch(`${API_BASE}${normalizedPath}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  const data = await parseJson<T & { error?: string; success?: boolean; message?: string }>(
    response
  );

  if (!response.ok) {
    throw new ApiError(data.error || data.message || response.statusText, response.status, data);
  }

  if (data && typeof data === 'object' && 'success' in data && data.success === false) {
    throw new ApiError(data.message || data.error || 'Request failed', response.status, data);
  }

  return data;
}

export function encodeMac(mac: string): string {
  return encodeURIComponent(mac);
}

export const API_BASE_URL = API_BASE;
