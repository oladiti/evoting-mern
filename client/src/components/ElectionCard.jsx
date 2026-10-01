import { useAuth } from '../context/AuthContext';
import { useCountdown } from '../hooks/useCountdown';
import { formatDate } from '../lib/format';
import { Badge } from './ui/index';

function StatusBadge({ election }) {
  if (election.status === 'active') return <Badge tone="green">Active</Badge>;
  if (election.status === 'upcoming') return <Badge tone="amber">Upcoming</Badge>;
  return <Badge tone="gray">Ended</Badge>;
}

export default function ElectionCard({ election, onVote, onViewResults }) {
  const { user } = useAuth();
  const countdown = useCountdown(election.end_date);
  const canVote = election.status === 'active' && !election.has_voted && (!election.requires_accreditation || election.is_accredited);

  return (
    <div className="card p-6 flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-bold text-slate-800 dark:text-slate-100 text-lg leading-tight">
            <i className="fas fa-clipboard-check text-primary-600 mr-2" />
            {election.title}
          </h3>
          {election.description && <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">{election.description}</p>}
        </div>
        <StatusBadge election={election} />
      </div>

      <div className="text-sm text-slate-600 dark:text-slate-300 space-y-1.5">
        <div>
          <i className="fas fa-calendar-alt text-primary-500 mr-2" />
          <span className="text-slate-400">Starts:</span> {formatDate(election.start_date)}
        </div>
        <div>
          <i className="fas fa-calendar-check text-secondary-500 mr-2" />
          <span className="text-slate-400">Ends:</span> {formatDate(election.end_date)}
          {countdown.text && election.status === 'active' && <span className="ml-2 badge bg-primary-500/15 text-primary-700 dark:text-primary-400">{countdown.text}</span>}
        </div>
      </div>

      {election.requires_accreditation && (
        <div>
          {election.is_accredited ? (
            <Badge tone="green">
              <i className="fas fa-user-check mr-1" /> Accredited
            </Badge>
          ) : user?.is_admin ? (
            <Badge tone="amber">Accreditation required</Badge>
          ) : (
            <Badge tone="red">
              <i className="fas fa-user-clock mr-1" /> Not accredited
            </Badge>
          )}
        </div>
      )}

      {election.has_voted && (
        <Badge tone="cyan">
          <i className="fas fa-check-double mr-1" /> You have voted
        </Badge>
      )}

      <div className="mt-auto flex gap-3">
        {election.status === 'active' && !election.has_voted && (
          <button onClick={() => onVote(election)} disabled={!canVote && !user?.is_admin} className={`${user?.is_admin ? 'btn-outline' : 'btn-primary'} flex-1`}>
            <i className="fas fa-vote-yea" /> Vote Now
          </button>
        )}
        {election.status === 'active' && election.has_voted && (
          <span className="flex-1 text-center text-sm text-slate-400 py-2.5">
            <i className="fas fa-lock mr-1" /> Vote recorded
          </span>
        )}
        <button onClick={() => onViewResults(election)} className="btn-secondary flex-1">
          <i className="fas fa-chart-bar" /> Results
        </button>
      </div>
    </div>
  );
}
