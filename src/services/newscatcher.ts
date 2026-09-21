import type { StartJobPayload } from '../parse_input.js';
import { logError } from '../logger.js';

export interface NewsArticleSummary {
  title: string;
  link: string;
  source: string | null;
  published_at: string | null;
  summary: string | null;
  country: string | null;
}

export interface NewsSearchOutput {
  query: string;
  total_hits: number | null;
  articles: NewsArticleSummary[];
  summary_markdown: string;
}

type RawArticle = {
  title?: string | null;
  link?: string | null;
  published_date?: string | null;
  published_date_precision?: string | null;
  summary?: string | null;
  excerpt?: string | null;
  clean_url?: string | null;
  source_url?: string | null;
  country?: string | null;
  name_source?: string | null;
};

function articleSource(article: RawArticle): string | null {
  if (article.name_source) return article.name_source;
  if (article.clean_url) return article.clean_url;
  if (article.source_url) {
    try {
      return new URL(article.source_url).hostname;
    } catch {
      return article.source_url;
    }
  }
  return null;
}

function articleSummary(article: RawArticle): string | null {
  const s = article.summary ?? article.excerpt;
  if (typeof s === 'string' && s.trim()) {
    return s.trim().slice(0, 500);
  }
  return null;
}

function buildMarkdown(query: string, articles: NewsArticleSummary[]): string {
  const lines = [`# News brief: ${query}`, ''];
  if (articles.length === 0) {
    lines.push('No articles matched this query.');
    return lines.join('\n');
  }
  for (const [i, a] of articles.entries()) {
    lines.push(`${i + 1}. **${a.title}**`);
    if (a.source) lines.push(`   - Source: ${a.source}`);
    if (a.published_at) lines.push(`   - Published: ${a.published_at}`);
    lines.push(`   - Link: ${a.link}`);
    if (a.summary) lines.push(`   - ${a.summary}`);
    lines.push('');
  }
  return lines.join('\n');
}

export async function searchNews(payload: StartJobPayload): Promise<NewsSearchOutput> {
  const apiKey = process.env.NEWSCATCHER_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('NEWSCATCHER_API_KEY is not set');
  }

  const base =
    process.env.NEWSCATCHER_API_BASE_URL?.trim() ||
    'https://v3-api.newscatcherapi.com/api';
  const url = `${base.replace(/\/$/, '')}/search`;

  const body: Record<string, unknown> = {
    q: payload.query,
    lang: payload.lang,
    page_size: payload.limit,
    page: 1,
    sort_by: 'relevancy',
  };

  if (payload.countries) {
    body.countries = payload.countries;
  }
  if (payload.fromDate) {
    body.from_ = payload.fromDate;
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-token': apiKey,
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(text) as unknown;
  } catch {
    logError('NewsCatcher non-JSON response', new Error(text.slice(0, 200)));
    throw new Error(`NewsCatcher returned invalid JSON (HTTP ${res.status})`);
  }

  if (!res.ok) {
    const msg =
      data && typeof data === 'object' && 'message' in data
        ? String((data as { message: unknown }).message)
        : text.slice(0, 300);
    throw new Error(`NewsCatcher HTTP ${res.status}: ${msg}`);
  }

  const record = data as {
    total_hits?: number;
    articles?: RawArticle[];
  };

  const rawArticles = Array.isArray(record.articles) ? record.articles : [];
  const articles: NewsArticleSummary[] = rawArticles
    .filter((a) => a.title && a.link)
    .map((a) => ({
      title: String(a.title),
      link: String(a.link),
      source: articleSource(a),
      published_at: a.published_date ?? null,
      summary: articleSummary(a),
      country: a.country ?? null,
    }));

  const output: NewsSearchOutput = {
    query: payload.query,
    total_hits: typeof record.total_hits === 'number' ? record.total_hits : null,
    articles,
    summary_markdown: buildMarkdown(payload.query, articles),
  };

  return output;
}
