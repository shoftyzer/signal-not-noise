export type SourceType = 'article' | 'paper' | 'announcement' | 'regulatory' | 'patent' | 'event' | 'other';
export type SignalType = 'weak' | 'strong' | 'emerging' | 'established';
export type TimeHorizon = 'now' | '1-2yr' | '3-5yr' | '5+yr';
export type SignalStatus = 'new' | 'triaged' | 'under_review' | 'published' | 'archived' | 'rejected';

export interface Signal {
  id: number;
  title: string;
  summary?: string;
  source_name?: string;
  source_type?: SourceType;
  url?: string;
  publication_date?: string;
  scan_date?: string;
  topic_area?: string;
  focus_area?: string;
  technology_area?: string;
  driver_trend?: string;
  signal_type?: SignalType;
  geographic_relevance?: string;
  industry_relevance?: string;
  confidence_level?: number;
  novelty?: number;
  potential_impact?: number;
  relevance_score?: number;
  relevance_narrative?: string;
  time_horizon?: TimeHorizon;
  status: SignalStatus;
  tags?: string;
  analyst_notes?: string;
  created_at: string;
  updated_at: string;
}

export interface SignalFormData {
  title: string;
  summary: string;
  source_name: string;
  source_type: string;
  url: string;
  publication_date: string;
  scan_date: string;
  topic_area: string;
  focus_area: string;
  technology_area: string;
  driver_trend: string;
  signal_type: string;
  geographic_relevance: string;
  industry_relevance: string;
  confidence_level: number;
  novelty: number;
  potential_impact: number;
  time_horizon: string;
  status: string;
  tags: string;
  analyst_notes: string;
}

export interface PaginatedSignals {
  data: Signal[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    pages: number;
  };
}

export interface DashboardStats {
  summary: {
    totalSignals: number;
    newThisWeek: number;
    published: number;
    underReview: number;
  };
  byStatus: { status: string; count: number }[];
  byTopicArea: { topic_area: string; count: number }[];
  byTechnologyArea: { technology_area: string; count: number }[];
  bySourceType: { source_type: string; count: number }[];
  signalsOverTime: { week: string; count: number }[];
  recentSignals: Partial<Signal>[];
}

export type WatchListStatus = 'active' | 'paused' | 'archived';

export interface WatchListEntry {
  id: number;
  name: string;
  search_query: string;
  description?: string;
  topic_area?: string;
  focus_area?: string;
  technology_area?: string;
  driver_trend?: string;
  geographic_relevance?: string;
  industry_relevance?: string;
  language?: string;
  source_filter?: string;
  from_date?: string;
  to_date?: string;
  sort_by?: string;
  priority: number;
  status: WatchListStatus;
  tags?: string;
  notes?: string;
  created_by?: string;
  updated_by?: string;
  created_at: string;
  updated_at: string;
  last_searched_at?: string;
}

export interface NewsReviewCandidate {
  id: number;
  review_status: 'new' | 'imported' | 'dismissed';
  search_term: string;
  scan_timestamp: string;
  imported_signal_id?: number;
  watchlist_entry_id?: number;
  watchlist_name?: string;
  title: string;
  source_name?: string;
  author?: string;
  description?: string;
  content_snippet?: string;
  url: string;
  publication_date?: string;
  scan_id: number;
  provider: string;
  scan_status: 'success' | 'error';
  error_message?: string;
}

export interface NewsSearchRun {
  scanId: number;
  provider: string;
  searchTerm: string;
  resultCount: number;
  importedCount: number;
}
