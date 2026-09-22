import { log } from './logger.js';

export class SokosumiApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown,
  ) {
    super(message);
    this.name = 'SokosumiApiError';
  }
}

type ApiEnvelope<T> = {
  data?: T;
  meta?: unknown;
  error?: string;
  message?: string;
};

export class SokosumiClient {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
  ) {}

  async get<T>(path: string, query?: Record<string, string>): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        url.searchParams.set(key, value);
      }
    }
    return this.request<T>(url.toString(), { method: 'GET' });
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    return this.request<T>(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  private async request<T>(url: string, init: RequestInit): Promise<T> {
    const response = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: 'application/json',
        ...(init.headers as Record<string, string> | undefined),
      },
    });

    const text = await response.text();
    let parsed: ApiEnvelope<T> | null = null;
    if (text) {
      try {
        parsed = JSON.parse(text) as ApiEnvelope<T>;
      } catch {
        parsed = null;
      }
    }

    if (!response.ok) {
      const message =
        parsed?.message ||
        parsed?.error ||
        `HTTP ${response.status} ${response.statusText}`;
      log('API error', { url, status: response.status, message });
      throw new SokosumiApiError(message, response.status, parsed ?? text);
    }

    if (parsed && 'data' in parsed) {
      return parsed.data as T;
    }

    return (parsed ?? text) as T;
  }
}
