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
