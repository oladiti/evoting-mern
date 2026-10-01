import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Chart as ChartJS, BarElement, CategoryScale, LinearScale, Tooltip, Legend } from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { EmptyState, FullLoader, Badge } from '../components/ui/index';
import { photoUrl } from '../lib/format';
import { FadeUp, Stagger, StaggerItem } from '../components/ui/motion';

ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip, Legend);

function ResultSection({ position, data }) {
  return (
    <FadeUp className="card p-6 h-full">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">
          <i className="fas fa-bullseye text-secondary-500 mr-2" />
          {position}
        </h2>
        <Badge tone="blue">
          {data.total_votes} vote{data.total_votes === 1 ? '' : 's'}
        </Badge>
      </div>
      <div className="space-y-4">
        {data.candidates.map((c) => (
          <div key={String(c.candidate_id)} className="flex items-center gap-4">
            {c.photo ? (
              <img src={photoUrl(c.photo)} alt={c.name} className="w-11 h-11 rounded-full object-cover" />
            ) : (
              <div className="w-11 h-11 rounded-full bg-brand-gradient flex items-center justify-center text-white font-bold">{(c.name || '?').charAt(0).toUpperCase()}</div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="font-medium text-sm text-slate-700 dark:text-slate-200 truncate">{c.name}</span>
                <div className="flex items-center gap-2 shrink-0">
                  {c.is_winner && (
                    <Badge tone="green">
                      <i className="fas fa-trophy mr-1" /> Winner
                    </Badge>
                  )}
                  <span className="text-sm font-bold text-slate-800 dark:text-slate-100">{c.votes}</span>
                  <span className="text-xs text-slate-400 w-10 text-right">{c.percentage.toFixed(1)}%</span>
                </div>
              </div>
              <div className="mt-1.5 h-2.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <div className={`h-full rounded-full transition-all duration-700 ${c.is_winner ? 'bg-success-gradient' : 'bg-brand-gradient'}`} style={{ width: `${Math.max(c.percentage, 1.5)}%` }} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </FadeUp>
  );
}

export default function Results() {
  const { slug } = useParams();
  const { user } = useAuth();
  const { theme } = useTheme();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        if (slug) {
          const d = await api.get(`/api/results/${encodeURIComponent(slug)}`);
          setData(d);
        } else {
          const d = await api.get('/api/results/all');
          setData(d);
        }
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [slug]);

  if (loading) return <FullLoader text="Loading results..." />;

  if (error) {
    return (
      <div className="max-w-md mx-auto py-20 text-center">
        <i className="fas fa-lock text-4xl text-danger-500 mb-4" />
        <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">{error}</h1>
        <Link to="/dashboard" className="btn-primary mt-6">
          Back to Dashboard
        </Link>
      </div>
    );
  }

  const gridColor = theme === 'dark' ? '#1e293b' : '#f1f5f9';
  const labelColor = theme === 'dark' ? '#94a3b8' : '#475569';

  const chart = (position, sectionData) => {
    const labels = sectionData.candidates.map((c) => c.name);
    const values = sectionData.candidates.map((c) => c.votes);
    const colors = sectionData.candidates.map((c) => (c.is_winner ? '#10b981' : '#0891b2'));
    const graphData = {
      labels,
      datasets: [
        {
          label: 'Votes',
          data: values,
          backgroundColor: colors,
          borderRadius: 8,
          maxBarThickness: 56,
        },
      ],
    };
    return (
      <div className="card p-4 sm:p-6 min-w-0 overflow-hidden" key={position}>
        <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-2 break-words">{position}</h3>
        <div className="chart-box">
          <Bar
            data={graphData}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              animation: { duration: 400 },
              plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: (ctx) => ` ${ctx.parsed.y} vote(s)` } },
              },
              layout: { padding: { top: 4, right: 4 } },
              scales: {
                x: {
                  border: { display: false },
                  grid: { color: gridColor, drawTicks: false },
                  ticks: {
                    color: labelColor,
                    autoSkip: false,
                    maxRotation: 45,
                    minRotation: 0,
                    maxWidth: 96,
                    callback: (value, index) => {
                      const raw = labels[index] ?? String(value);
                      return raw.length > 14 ? `${raw.slice(0, 13)}…` : raw;
                    },
                  },
                },
                y: {
                  beginAtZero: true,
                  border: { display: false },
                  grid: { color: gridColor, drawTicks: false },
                  ticks: { color: labelColor, precision: 0, maxTicksLimit: 5 },
                },
              },
            }}
          />
        </div>
      </div>
    );
  };

  const list = slug ? [{ ...data.election, by_position: data.by_position, total_votes_cast: data.total_votes_cast }] : data.elections;

  return (
    <div className="max-w-5xl mx-auto w-full min-w-0">
      <FadeUp className="mb-8">
        <h1 className="text-2xl font-extrabold text-slate-800 dark:text-slate-100">
          <i className="fas fa-chart-bar text-primary-600 mr-2" /> Election Results
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{user?.is_admin ? 'Admin view — all elections and live standings.' : 'Official results for completed elections.'}</p>
      </FadeUp>

      {!list.length && <EmptyState icon="fas fa-chart-pie" title="No results available" />}

      {list.map((election, index) => (
        <FadeUp key={String(election._id || election.election_id || index)} className="mb-14">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">{election.title || election.election?.title}</h2>
              <p className="text-xs text-slate-400">Total votes cast: {election.total_votes_cast}</p>
            </div>
            <Badge tone="gray">Closed</Badge>
          </div>
          <div className="grid lg:grid-cols-2 gap-5">
            {Object.entries(election.by_position || {}).map(([position, sectionData]) => (
              <ResultSection key={position} position={position} data={sectionData} />
            ))}
          </div>
          {/* Charts */}
          <div className="grid lg:grid-cols-2 gap-5 mt-6 min-w-0">
            {Object.entries(election.by_position || {}).map(([position, sectionData]) => (sectionData.total_votes > 0 ? chart(position, sectionData) : null))}
          </div>
        </FadeUp>
      ))}

      {!slug && list.length > 0 && (
        <div className="text-center">
          <Link to="/dashboard" className="btn-secondary">
            <i className="fas fa-tachometer-alt" /> Back to Dashboard
          </Link>
        </div>
      )}
    </div>
  );
}
