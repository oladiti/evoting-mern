import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { StatCard, FullLoader, Badge, EmptyState, PageHeader } from '../../components/ui/index';
import { formatDateShort } from '../../lib/format';

export default function AdminOverview() {
  const [stats, setStats] = useState(null);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.get('/api/admin/stats'), api.get('/api/admin/logs?per_page=8')])
      .then(([s, l]) => {
        setStats(s.stats);
        setLogs(l.logs);
      })
      .catch((e) => console.error(e))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <FullLoader text="Loading admin overview..." />;

  const toneFor = (action = '') => {
    if (/FAIL|LOCKED/.test(action)) return 'red';
    if (/DELETE|CLEAR/.test(action)) return 'amber';
    if (/VOTE|ACCREDIT|CREATE/.test(action)) return 'green';
    if (/LOGIN|REGISTER/.test(action)) return 'cyan';
    return 'blue';
  };

  return (
    <div className="space-y-6 sm:space-y-8">
      <PageHeader title="Admin Overview" subtitle="System-wide statistics at a glance." />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5">
        <StatCard icon="fas fa-poll" label="Elections" value={stats?.elections ?? 0} gradient="bg-brand-gradient" />
        <StatCard icon="fas fa-fire" label="Active Elections" value={stats?.active_elections ?? 0} gradient="bg-warm-gradient" />
        <StatCard icon="fas fa-users" label="Registered Voters" value={stats?.voters ?? 0} gradient="bg-success-gradient" />
        <StatCard icon="fas fa-check-double" label="Votes Cast" value={stats?.votes_cast ?? 0} gradient="bg-accent-gradient" />
        <StatCard icon="fas fa-user-tag" label="Candidates" value={stats?.candidates ?? 0} gradient="bg-info-500" />
        <StatCard icon="fas fa-face-smile" label="Faces Enrolled" value={stats?.faces_enrolled ?? 0} gradient="bg-warning-500" />
        <StatCard icon="fas fa-envelope-open" label="Unread Messages" value={stats?.unread_contacts ?? 0} gradient="bg-danger-500" />
      </div>

      <div className="card card-pad">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <h2 className="font-bold text-slate-800 dark:text-slate-100">
            <i className="fas fa-bolt text-primary-600 mr-2" /> Recent Activity
          </h2>
          <Link to="/admin/logs" className="text-sm text-primary-600 hover:underline">
            View all logs
          </Link>
        </div>
        {logs.length === 0 ? (
          <EmptyState icon="fas fa-clipboard" title="No activity yet" />
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {logs.map((l) => (
              <div key={l._id} className="list-row !py-3">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <Badge tone={toneFor(l.action)}>{l.action}</Badge>
                  <p className="text-sm text-slate-600 dark:text-slate-300 min-w-0 truncate">{l.description}</p>
                </div>
                <div className="list-row-actions">
                  <span className="text-xs text-slate-400">{formatDateShort(l.created_at)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
