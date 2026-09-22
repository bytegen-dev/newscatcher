export type NewsInput = {
  query: string;
  lang?: string;
  countries?: string;
  from_date?: string;
  limit?: number;
};

/**
 * Turns a task title + description into News catcher input_data.
 * Supports JSON in the description or plain-text briefs.
 */
export function parseTaskBrief(
  name: string,
  description: string | null | undefined,
  defaultLimit: number,
): NewsInput {
  const text = (description ?? '').trim();
  if (text.startsWith('{')) {
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      const query =
        typeof parsed.query === 'string'
          ? parsed.query.trim()
          : typeof parsed.input_data === 'object' &&
              parsed.input_data !== null &&
              typeof (parsed.input_data as Record<string, unknown>).query ===
                'string'
            ? String(
                (parsed.input_data as Record<string, unknown>).query,
              ).trim()
            : '';
      if (query) {
        return {
          query,
          lang: optionalString(parsed.lang),
          countries: optionalString(parsed.countries),
          from_date: optionalString(parsed.from_date),
          limit: optionalLimit(parsed.limit, defaultLimit),
        };
      }
    } catch {
      // fall through
    }
  }

  const queryLine = text.match(/^\s*query\s*:\s*(.+)$/im);
  if (queryLine?.[1]) {
    return {
      query: queryLine[1].trim(),
      limit: parseLimitFromText(text, defaultLimit),
    };
  }

  const combined = [name.trim(), text].filter(Boolean).join('\n').trim();
  if (!combined) {
    throw new Error('Task has no usable query in name or description');
  }

  return {
    query: combined.slice(0, 500),
    limit: parseLimitFromText(text, defaultLimit),
  };
}

function optionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function optionalLimit(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return clampLimit(value);
  }
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    return clampLimit(Number.parseInt(value, 10));
  }
  return fallback;
}

function parseLimitFromText(text: string, fallback: number): number {
  const match = text.match(/\blimit\s*:\s*(\d{1,2})\b/i);
  if (match?.[1]) {
    return clampLimit(Number.parseInt(match[1], 10));
  }
  return fallback;
}

function clampLimit(n: number): number {
  return Math.min(25, Math.max(1, n));
}
