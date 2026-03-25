import { Link } from 'react-router-dom';
import { Signal } from '../types/signal';

const statusColors: Record<string, string> = {
  new: 'bg-blue-100 text-blue-800',
  triaged: 'bg-yellow-100 text-yellow-800',
  under_review: 'bg-orange-100 text-orange-800',
  published: 'bg-green-100 text-green-800',
  archived: 'bg-slate-100 text-slate-600',
  rejected: 'bg-red-100 text-red-800',
};

const signalTypeColors: Record<string, string> = {
  weak: 'bg-slate-100 text-slate-700',
  strong: 'bg-purple-100 text-purple-800',
  emerging: 'bg-teal-100 text-teal-800',
  established: 'bg-indigo-100 text-indigo-800',
};

interface Props {
  signal: Signal;
}

export default function SignalCard({ signal }: Props) {
  const tags: string[] = signal.tags ? JSON.parse(signal.tags) : [];

  return (
    <Link to={`/signals/${signal.id}`} className="block">
      <div className="bg-white border border-slate-200 rounded-lg p-4 hover:border-indigo-300 hover:shadow-sm transition-all">
        <div className="flex items-start justify-between gap-2 mb-2">
          <h3 className="text-sm font-semibold text-slate-900 line-clamp-2 flex-1">{signal.title}</h3>
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${statusColors[signal.status] || 'bg-slate-100 text-slate-600'}`}>
            {signal.status.replace('_', ' ')}
          </span>
        </div>
        {signal.summary && (
          <p className="text-xs text-slate-500 line-clamp-2 mb-3">{signal.summary}</p>
        )}
        <div className="flex items-center gap-2 flex-wrap">
          {signal.signal_type && (
            <span className={`text-xs px-2 py-0.5 rounded-full ${signalTypeColors[signal.signal_type] || 'bg-slate-100 text-slate-600'}`}>
              {signal.signal_type}
            </span>
          )}
          {signal.topic_area && (
            <span className="text-xs text-slate-500 bg-slate-50 px-2 py-0.5 rounded-full border border-slate-200">
              {signal.topic_area}
            </span>
          )}
          {signal.potential_impact && (
            <span className="text-xs text-slate-400 ml-auto">Impact: {signal.potential_impact}/5</span>
          )}
        </div>
        {tags.length > 0 && (
          <div className="flex gap-1 flex-wrap mt-2">
            {tags.slice(0, 3).map(tag => (
              <span key={tag} className="text-xs text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">#{tag}</span>
            ))}
            {tags.length > 3 && <span className="text-xs text-slate-400">+{tags.length - 3}</span>}
          </div>
        )}
      </div>
    </Link>
  );
}
