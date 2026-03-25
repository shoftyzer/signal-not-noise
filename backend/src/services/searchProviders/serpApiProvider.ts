import { ExternalSearchProvider, ExternalSearchQuery, ExternalSearchResponse } from './types';

interface SerpApiNewsResult {
  position?: number;
  title?: string;
  source?: {
    name?: string;
    icon?: string;
    authors?: string[];
  };
  link?: string;
  snippet?: string;
  date?: string;
  thumbnail?: string;
}

interface SerpApiResponse {
  search_metadata?: {
    id?: string;
    status?: string;
  };
  search_information?: {
    total_results?: number;
  };
  news_results?: SerpApiNewsResult[];
  error?: string;
}

function parseSerpDate(raw?: string): string | undefined {
  if (!raw) return undefined;
  const parsed = Date.parse(raw);
  if (!Number.isNaN(parsed)) {
    return new Date(parsed).toISOString();
  }
  return undefined;
}

export class SerpApiProvider implements ExternalSearchProvider {
  providerName = 'serpapi';

  private readonly apiKey: string;
  private readonly baseUrl = 'https://serpapi.com/search.json';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async searchArticles(query: ExternalSearchQuery): Promise<ExternalSearchResponse> {
    const params = new URLSearchParams({
      api_key: this.apiKey,
      engine: 'google_news',
      q: query.query,
      num: String(Math.min(100, Math.max(10, query.pageSize || 50)))
    });

    if (query.language) params.set('hl', query.language);

    // SerpAPI date/sort filters are passed via tbs for Google News.
    // qdr:* = relative date, cdr:1,... = custom date range.
    if (query.from && query.to) {
      params.set('tbs', `cdr:1,cd_min:${query.from},cd_max:${query.to}`);
    } else if (query.sortBy === 'publishedAt') {
      params.set('tbs', 'sbd:1');
    }

    if (query.sources) {
      params.set('q', `${query.query} site:${query.sources.split(',').map((s) => s.trim()).filter(Boolean).join(' OR site:')}`);
    }

    const response = await fetch(`${this.baseUrl}?${params.toString()}`);

    if (!response.ok) {
      const bodyText = await response.text();
      const err = new Error(`SerpAPI error (${response.status}): ${bodyText}`);
      (err as Error & { status?: number }).status = response.status;
      throw err;
    }

    const data = await response.json() as SerpApiResponse;
    if (data.error) {
      throw new Error(`SerpAPI error: ${data.error}`);
    }

    const articles = (data.news_results || [])
      .filter((item) => item.link && item.title)
      .map((item) => ({
        externalId: `${data.search_metadata?.id || 'search'}:${item.position || item.link}`,
        title: item.title || 'Untitled',
        sourceName: item.source?.name,
        author: item.source?.authors?.join(', '),
        description: item.snippet,
        contentSnippet: item.snippet,
        url: item.link || '',
        publishedAt: parseSerpDate(item.date),
        language: query.language,
        rawPayload: item
      }));

    return {
      provider: this.providerName,
      totalResults: data.search_information?.total_results,
      articles,
      rawResponse: data
    };
  }
}
