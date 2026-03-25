export interface ExternalSearchQuery {
  query: string;
  sources?: string;
  from?: string;
  to?: string;
  language?: string;
  sortBy?: string;
  pageSize?: number;
}

export interface ExternalArticle {
  externalId?: string;
  title: string;
  sourceName?: string;
  author?: string;
  description?: string;
  contentSnippet?: string;
  url: string;
  publishedAt?: string;
  language?: string;
  rawPayload?: unknown;
}

export interface ExternalSearchResponse {
  provider: string;
  totalResults?: number;
  articles: ExternalArticle[];
  rawResponse?: unknown;
}

export interface ExternalSearchProvider {
  providerName: string;
  searchArticles(query: ExternalSearchQuery): Promise<ExternalSearchResponse>;
}
