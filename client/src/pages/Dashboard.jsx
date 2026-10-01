import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import ElectionCard from '../components/ElectionCard';
import { StatCard, EmptyState, FullLoader, Badge } from '../components/ui/index';
import { formatDateShort } from '../lib/format';
import { FadeUp, Stagger, StaggerItem } from '../components/ui/motion';

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [elections, setElections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [voteHistory, setVoteHistory] = useState([]);

  const load = useCallback(async () => {
    try {
      const data = await api.get('/api/elections');
      setElections(data.elections);
      const history = [];
      for (const e of data.elections) {
        if (e.has_voted) {
          history.push({ title: e.title, ended: e.status === 'completed' });
        }
      }
      setVoteHistory(history);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <FullLoader text="Loading your dashboard..." />;

  const active = elections.filter((e) => e.status === 'active');
  const upcoming = elections.filter((e) => e.status === 'upcoming');
  const completed = elections.filter((e) => e.status === 'completed');

  // Prefer the slug for the public-facing URL; fall back to the id so an
  // election whose slug is somehow missing still gets a working link.
  const goVote = (election) => navigate(`/vote/${election.slug || election.election_id || election._id}`);
  const goResults = (election) => navigate(`/results/${election.slug || election.election_id || election._id}`);

  const renderElectionGrid = (list) => {
    if (!list.length) return <EmptyState icon="fa fa-box-open" title="No elections here" />;
    return (
      <Stagger className="grid md:grid-cols-2 xl:grid-cols-3 gap-5" amount={0.1}>
        {list.map((e) => (
          <StaggerItem key={String(e.election_id || e._id)}>
            <ElectionCard election={e} onVote={goVote} onViewResults={goResults} />
          </StaggerItem>
        ))}
      </Stagger>
    );
  };

  return (
    <div className="space-y-10">
      <FadeUp>
        <h1 className="text-2xl font-extrabold text-slate-800 dark:text-slate-100">Welcome, {user?.username}</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Here's what's happening with your elections.</p>
        {error && <div className="mt-4 text-sm text-danger-600 bg-danger-500/10 border border-danger-500/30 px-4 py-3 rounded-xl">{error}</div>}
      </FadeUp>

      <Stagger className="grid sm:grid-cols-3 gap-5" amount={0.12}>
        <StaggerItem>
          <StatCard icon="fas fa-vote-yea" label="Active Elections" value={active.length} gradient="bg-success-gradient" />
        </StaggerItem>
        <StaggerItem>
          <StatCard icon="fas fa-clock" label="Upcoming" value={upcoming.length} gradient="bg-warm-gradient" />
        </StaggerItem>
        <StaggerItem>
          <StatCard icon="fas fa-check-double" label="You've Voted In" value={voteHistory.length} gradient="bg-accent-gradient" />
        </StaggerItem>
      </Stagger>

      {voteHistory.length > 0 && (
        <FadeUp className="card p-5">
          <h2 className="font-bold text-slate-800 dark:text-slate-100 mb-3">
            <i className="fas fa-history text-primary-600 mr-2" /> Your Vote History
          </h2>
          <div className="flex flex-wrap gap-2">
            {voteHistory.map((v) => (
              <Badge key={v.title} tone={v.ended ? 'gray' : 'green'}>
                {v.title} {v.ended ? '(ended)' : '(voted)'}
              </Badge>
            ))}
          </div>
        </FadeUp>
      )}

      <FadeUp>
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">
              <i className="fas fa-fire text-secondary-500 mr-2" /> Active Elections
            </h2>
          </div>
          {active.length === 0 ? <EmptyState icon="fas fa-calendar-times" title="No active elections right now" subtitle="Check back during election periods." /> : renderElectionGrid(active)}
        </section>
      </FadeUp>

      <FadeUp>
        <section>
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-4">
            <i className="fas fa-calendar-plus text-primary-500 mr-2" /> Upcoming
          </h2>
          {renderElectionGrid(upcoming)}
        </section>
      </FadeUp>

      <FadeUp>
        <section>
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-4">
            <i className="fas fa-archive text-slate-400 mr-2" /> Completed
          </h2>
          {renderElectionGrid(completed)}
        </section>
      </FadeUp>

      <div className="text-sm text-slate-400 text-center">Registered on {user && user.created_at ? formatDateShort(user.created_at) : ''}</div>
    </div>
  );
}
