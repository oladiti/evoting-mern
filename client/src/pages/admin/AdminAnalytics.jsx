import { useEffect, useState } from 'react';
import { Chart as ChartJS, BarElement, LineElement, PointElement, ArcElement, CategoryScale, LinearScale, Tooltip, Legend, Filler } from 'chart.js';
import { Bar, Line, Doughnut } from 'react-chartjs-2';
import { api } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import { useTheme } from '../../context/ThemeContext';
import { FullLoader, EmptyState, Badge, StatCard, PageHeader } from '../../components/ui/index';
import { formatDateShort } from '../../lib/format';

ChartJS.register(BarElement, LineElement, PointElement, ArcElement, CategoryScale, LinearScale, Tooltip, Legend, Filler);

const RANGES = [
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
  { days: 365, label: '1 year' },
];

const ACTIVITY_COLORS = ['#4f46e5', '#0891b2', '#059669', '#d97706', '#dc2626', '#7c3aed', '#db2777', '#0d9488', '#c026d3', '#475569'];

// Bucket keys arrive as YYYY-MM-DD strings computed in UTC by the server. Parsing
// them back with `new Date(iso)` would read a bare YYYY-MM-DD as UTC midnight in
// modern engines but as local midnight in older ones, and even in the good case a
// reader west of Greenwich would see the tick label a day earlier than the data.
// Pinning the zone on both ends makes the label match the bucket the server chose.
function bucketLabel(iso) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function hourLabel(hour) {
  if (hour === 0) return '12am';
  if (hour === 12) return '12pm';
  return hour < 12 ? `${hour}am` : `${hour - 12}pm`;
}

function percent(n) {
  return `${Number(n || 0).toFixed(1)}%`;
}

export default function AdminAnalytics() {
  const toast = useToast();
  const { theme } = useTheme();
  const [data, setData] = useState(null);
  const [days, setDays] = useState(30);
  const [electionId, setElectionId] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ days });
      if (electionId) qs.set('election_id', electionId);
      setData(await api.get(`/api/admin/analytics?${qs}`));
    } catch (e) {
      toast.error(e.message);
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, electionId]);

  const gridColor = theme === 'dark' ? '#1e293b' : '#f1f5f9';
  const labelColor = theme === 'dark' ? '#94a3b8' : '#475569';

  const axis = (extra = {}) => ({
    grid: { color: gridColor, drawTicks: false },
    border: { display: false },
    ticks: { color: labelColor, precision: 0, ...extra },
  });

  const exportCsv = () => {
    if (!data) return;
    const header = ['metric', 'value'];
    const rows = [
      ['range_from', data.range.from],
      ['range_to', data.range.to],
      ['election_scope', data.election?.title || 'All elections'],
      ['registered_voters', data.totals.voters],
      ['votes_cast', data.totals.votes_cast],
      ['turnout_percentage', data.turnout.percentage],
      ['accreditations', data.totals.accreditations],
      ['faces_enrolled', data.totals.faces_enrolled],
      ['failed_logins', data.security.failed_logins],
      ['failed_face_checks', data.security.failed_face_checks],
      ['locked_voters', data.security.locked_voters],
    ];
    data.by_position.forEach((p) => rows.push([`position:${p.position}`, `${p.votes} votes / ${p.candidates} candidates`]));
    data.elections.forEach((e) => rows.push([`election:${e.title}`, `${e.votes} votes / ${e.voters} voters`]));
    const csv = [header, ...rows].map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `analytics-${data.range.from}-to-${data.range.to}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (loading && !data) return <FullLoader text="Crunching analytics..." />;

  if (!data) {
    return (
      <div className="space-y-6">
        <PageHeader title="Analytics" subtitle="Voting trends, turnout and system activity." />
        <EmptyState icon="fas fa-chart-line" title="Analytics unavailable" subtitle="The report could not be loaded. Try again." />
      </div>
    );
  }

  const labels = data.series.votes.map((d) => bucketLabel(d.date));

  const trendData = {
    labels,
    datasets: [
      {
        label: 'Votes',
        data: data.series.votes.map((d) => d.count),
        borderColor: '#4f46e5',
        backgroundColor: 'rgba(79, 70, 229, 0.12)',
        pointBackgroundColor: '#4f46e5',
        pointRadius: 0,
        pointHoverRadius: 4,
        borderWidth: 2,
        tension: 0.3,
        fill: true,
      },
      {
        label: 'Registrations',
        data: data.series.registrations.map((d) => d.count),
        borderColor: '#059669',
        backgroundColor: 'rgba(5, 150, 105, 0.12)',
        pointBackgroundColor: '#059669',
        pointRadius: 0,
        pointHoverRadius: 4,
        borderWidth: 2,
        tension: 0.3,
        fill: true,
      },
      {
        label: 'Sign-ins',
        data: data.series.logins.map((d) => d.count),
        borderColor: '#0891b2',
        backgroundColor: 'transparent',
        pointBackgroundColor: '#0891b2',
        pointRadius: 0,
        pointHoverRadius: 4,
        borderWidth: 2,
        borderDash: [4, 4],
        tension: 0.3,
        fill: false,
      },
    ],
  };

  const hourlyData = {
    labels: data.hourly.map((h) => hourLabel(h.hour)),
    datasets: [
      {
        label: 'Votes',
        data: data.hourly.map((h) => h.votes),
        backgroundColor: '#0891b2',
        borderRadius: 6,
        maxBarThickness: 28,
      },
    ],
  };

  const positionData = {
    labels: data.by_position.map((p) => p.position),
    datasets: [
      {
        label: 'Votes',
        data: data.by_position.map((p) => p.votes),
        backgroundColor: '#059669',
        borderRadius: 8,
        maxBarThickness: 56,
      },
    ],
  };

  const activityData = {
    labels: data.activity.map((a) => a.action),
    datasets: [
      {
        data: data.activity.map((a) => a.count),
        backgroundColor: data.activity.map((_, i) => ACTIVITY_COLORS[i % ACTIVITY_COLORS.length]),
        borderWidth: 0,
      },
    ],
  };

  const hasVotes = data.totals.votes_cast > 0;
  const hasTrend = data.series.votes.some((d) => d.count > 0) || data.series.registrations.some((d) => d.count > 0);

  return (
    <div className="space-y-6">
      <PageHeader title="Analytics" subtitle={data.election ? `Scoped to ${data.election.title}` : 'All elections, system-wide.'}>
        <label className="sr-only" htmlFor="analytics-election-scope">
          Election scope
        </label>
        <select id="analytics-election-scope" name="election_id" className="input !py-2" value={electionId} onChange={(e) => setElectionId(e.target.value)}>
          <option value="">All elections</option>
          {data.elections.map((e) => (
            <option key={e._id} value={e._id}>
              {e.title}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="analytics-range">
          Date range
        </label>
        <select id="analytics-range" name="days" className="input !py-2" value={days} onChange={(e) => setDays(Number(e.target.value))}>
          {RANGES.map((r) => (
            <option key={r.days} value={r.days}>
              {r.label}
            </option>
          ))}
        </select>
        <button className="btn-secondary" onClick={exportCsv}>
          <i className="fas fa-file-csv" /> Export
        </button>
      </PageHeader>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5">
        <StatCard icon="fas fa-users" label="Registered Voters" value={data.totals.voters} gradient="bg-success-gradient" />
        <StatCard icon="fas fa-check-double" label="Votes Cast" value={data.totals.votes_cast} gradient="bg-accent-gradient" />
        <StatCard icon="fas fa-user-check" label="Accreditations" value={data.totals.accreditations} gradient="bg-brand-gradient" />
        <StatCard icon="fas fa-user-clock" label="Voters Who Signed In" value={data.turnout.voted} gradient="bg-warm-gradient" />
      </div>

      <div className="grid lg:grid-cols-3 gap-5 min-w-0">
        <div className="card card-pad min-w-0 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-bold text-slate-800 dark:text-slate-100">Turnout</h2>
            <span className="text-2xl font-extrabold text-slate-800 dark:text-slate-100">{percent(data.turnout.percentage)}</span>
          </div>
          <div className="mt-3 h-3 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
            <div
              className="h-full rounded-full bg-brand-gradient transition-all duration-700"
              style={{ width: `${Math.min(100, Math.max(data.turnout.percentage, data.turnout.percentage > 0 ? 2 : 0))}%` }}
            />
          </div>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            {data.turnout.voted} of {data.turnout.eligible} eligible voters have cast a ballot
            {data.election && data.election.title ? ` in ${data.election.title}` : ''}.{data.election ? '' : ' Eligibility is the full voter register.'}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
            {[
              { label: 'Elections', value: data.totals.elections, icon: 'fa-poll' },
              { label: 'Candidates', value: data.totals.candidates, icon: 'fa-user-tie' },
              { label: 'Faces Enrolled', value: data.totals.faces_enrolled, icon: 'fa-face-smile' },
              { label: 'Verified Emails', value: data.totals.email_verified, icon: 'fa-envelope-circle-check' },
            ].map((s) => (
              <div key={s.label} className="min-w-0">
                <div className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500 truncate">
                  <i className={`fas ${s.icon} mr-1`} />
                  {s.label}
                </div>
                <div className="text-lg font-bold text-slate-800 dark:text-slate-100">{s.value}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="card card-pad min-w-0">
          <h2 className="font-bold text-slate-800 dark:text-slate-100 mb-1">Security Signals</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Failures in the last {data.range.days} days.</p>
          <div className="space-y-3">
            {[
              { label: 'Failed sign-ins', value: data.security.failed_logins, tone: data.security.failed_logins > 10 ? 'red' : 'amber' },
              { label: 'Failed face checks', value: data.security.failed_face_checks, tone: data.security.failed_face_checks > 0 ? 'amber' : 'green' },
              { label: 'Voters locked out', value: data.security.locked_voters, tone: data.security.locked_voters > 0 ? 'red' : 'green' },
              { label: 'Messages received', value: data.totals.messages, tone: 'blue' },
            ].map((row) => (
              <div key={row.label} className="list-row !py-2 !border-0 border-b border-slate-100 dark:border-slate-800">
                <span className="text-sm text-slate-600 dark:text-slate-300 min-w-0 flex-1 truncate">{row.label}</span>
                <Badge tone={row.tone}>{row.value}</Badge>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card card-pad min-w-0">
        <h2 className="font-bold text-slate-800 dark:text-slate-100">Activity Over Time</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
          Daily counts, {formatDateShort(`${data.range.from}T00:00:00Z`)} to {formatDateShort(`${data.range.to}T00:00:00Z`)}.
        </p>
        {hasTrend ? (
          <div className="chart-box">
            <Line
              data={trendData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 400 },
                interaction: { mode: 'index', intersect: false },
                plugins: { legend: { position: 'bottom', labels: { color: labelColor, usePointStyle: true, boxWidth: 8 } } },
                scales: { x: axis({ maxTicksLimit: 10, autoSkip: true, maxRotation: 0 }), y: axis({ beginAtZero: true, maxTicksLimit: 6 }) },
              }}
            />
          </div>
        ) : (
          <EmptyState icon="fas fa-chart-line" title="No activity in this range" subtitle="Widen the date range or pick another election." />
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-5 min-w-0">
        <div className="card card-pad min-w-0">
          <h2 className="font-bold text-slate-800 dark:text-slate-100">When People Vote</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Ballots by hour of day (UTC).</p>
          {hasVotes ? (
            <div className="chart-box">
              <Bar
                data={hourlyData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  animation: { duration: 400 },
                  plugins: { legend: { display: false } },
                  scales: { x: axis({ maxTicksLimit: 8 }), y: axis({ beginAtZero: true, maxTicksLimit: 5 }) },
                }}
              />
            </div>
          ) : (
            <EmptyState icon="fas fa-clock" title="No ballots yet" />
          )}
        </div>

        <div className="card card-pad min-w-0">
          <h2 className="font-bold text-slate-800 dark:text-slate-100">Votes by Position</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Ballots cast in this range.</p>
          {data.by_position.length ? (
            <div className="chart-box">
              <Bar
                data={positionData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  animation: { duration: 400 },
                  plugins: { legend: { display: false } },
                  scales: {
                    x: axis({
                      autoSkip: false,
                      maxRotation: 45,
                      maxWidth: 96,
                      callback: (value, index) => {
                        const raw = data.by_position[index]?.position ?? String(value);
                        return raw.length > 14 ? `${raw.slice(0, 13)}…` : raw;
                      },
                    }),
                    y: axis({ beginAtZero: true, maxTicksLimit: 5 }),
                  },
                }}
              />
            </div>
          ) : (
            <EmptyState icon="fas fa-user-tie" title="No positions recorded" />
          )}
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-5 min-w-0">
        <div className="card card-pad min-w-0">
          <h2 className="font-bold text-slate-800 dark:text-slate-100">Top Activity</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Most frequent events, last {data.range.days} days.</p>
          {data.activity.length ? (
            <div className="chart-box">
              <Doughnut
                data={activityData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  animation: { duration: 400 },
                  cutout: '58%',
                  plugins: { legend: { position: 'bottom', labels: { color: labelColor, usePointStyle: true, boxWidth: 8, font: { size: 11 } } } },
                }}
              />
            </div>
          ) : (
            <EmptyState icon="fas fa-inbox" title="No activity logged" />
          )}
        </div>

        <div className="card card-pad min-w-0">
          <h2 className="font-bold text-slate-800 dark:text-slate-100">Elections</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Turnout measured against the voter register.</p>
          {data.elections.length ? (
            <div className="divide-y divide-slate-100 dark:divide-slate-800 -mx-1">
              {data.elections.map((e) => (
                <div key={e._id} className="list-row !py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{e.title}</p>
                      <Badge tone={e.status === 'active' ? 'green' : e.status === 'upcoming' ? 'blue' : 'gray'}>{e.status}</Badge>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {e.votes} ballots from {e.voters} voters
                      {e.requires_accreditation ? ' - accreditation required' : ''}
                    </p>
                    <div className="mt-1.5 h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-brand-gradient transition-all duration-700"
                        style={{ width: `${Math.min(100, Math.max(e.turnout_percentage, e.turnout_percentage > 0 ? 2 : 0))}%` }}
                      />
                    </div>
                  </div>
                  <div className="list-row-actions shrink-0 text-sm font-bold text-slate-600 dark:text-slate-300">{percent(e.turnout_percentage)}</div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon="fas fa-poll" title="No elections yet" />
          )}
        </div>
      </div>
    </div>
  );
}
