export interface StartJobPayload {
  query: string;
  lang: string;
  countries?: string;
  fromDate?: string;
  limit: number;
}

function clampLimit(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : parseInt(String(raw), 10);
  if (!Number.isFinite(n)) return 10;
  return Math.min(Math.max(Math.floor(n), 1), 25);
}

function fromFlatObject(obj: Record<string, unknown>): StartJobPayload | null {
  const query = typeof obj.query === 'string' ? obj.query.trim() : '';
  if (!query) return null;

  const lang =
    typeof obj.lang === 'string' && obj.lang.trim() ? obj.lang.trim() : 'en';

  const countries =
    typeof obj.countries === 'string' && obj.countries.trim()
      ? obj.countries.trim()
      : undefined;

  const fromDate =
    typeof obj.from_date === 'string' && obj.from_date.trim()
      ? obj.from_date.trim()
      : typeof obj.fromDate === 'string' && obj.fromDate.trim()
        ? obj.fromDate.trim()
        : undefined;

  const limit = clampLimit(obj.limit ?? 10);
  return { query, lang, countries, fromDate, limit };
}

function fromKeyValueArray(arr: unknown[]): StartJobPayload | null {
  const map: Record<string, string> = {};
  for (const row of arr) {
    if (row && typeof row === 'object' && 'key' in row && 'value' in row) {
      const k = String((row as { key: unknown }).key);
      const v = (row as { value: unknown }).value;
      map[k] = v == null ? '' : String(v);
    }
  }
  return fromFlatObject(map);
}

export function parseInputData(inputData: unknown): StartJobPayload | null {
  if (Array.isArray(inputData)) {
    return fromKeyValueArray(inputData);
  }
  if (inputData && typeof inputData === 'object') {
    return fromFlatObject(inputData as Record<string, unknown>);
  }
  return null;
}
