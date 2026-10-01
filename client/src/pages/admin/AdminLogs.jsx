import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import { FullLoader, EmptyState, Badge, Spinner, PageHeader } from '../../components/ui/index';
import { formatDateShort } from '../../lib/format';

export default function AdminLogs() {
  const toast = useToast();
  const [logs, setLogs] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, per_page: 50, total_count: 0, total_pages: 0 });
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);

  const load = async (page = pagination.page) => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ page, per_page: pagination.per_page });
      if (filter.trim()) qs.set('action', filter.trim());
      const d = await api.get(`/api/admin/logs?${qs}`);
      setLogs(d.logs);
      setPagination({ ...pagination, ...d.pagination });
    } catch (e) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const clearLogs = async () => {
    if (!window.confirm('Delete ALL activity logs? This cannot be undone.')) return;
    setClearing(true);
    try {
      await api.post('/api/admin/logs/clear');
      toast.success('All logs cleared.');
      setLogs([]);
      setPagination({ ...pagination, total_count: 0, total_pages: 0 });
    } catch (e) {
      toast.error(e.message);
    } finally {
      setClearing(false);
    }
  };

  const exportLogs = () => {
    const header = ['date', 'user', 'action', 'description', 'ip'];
    const rows = logs.map((l) => [l.created_at, l.username || 'system', l.action, l.description, l.ip_address]);
    const csv = [header, ...rows].map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `activity-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const toneFor = (action = '') => {
    if (/FAIL|LOCKED/.test(action)) return 'red';
    if (/DELETE|CLEAR/.test(action)) return 'amber';
    if (/VOTE|ACCREDIT|CREATE/.test(action)) return 'green';
    if (/LOGIN|REGISTER/.test(action)) return 'cyan';
    return 'blue';
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Activity Logs" subtitle={`${pagination.total_count} total entries`} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="w-full sm:w-56">
          <label className="label" htmlFor="log-action">
            Action
          </label>
          <select id="log-action" name="action" className="input" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">All actions</option>
            {[
              'LOGIN',
              'LOGIN_FAILED',
              'LOGOUT',
              'REGISTER',
              'EMAIL_RESEND',
              'EMAIL_VERIFY',
              'PASSWORD_RESET_REQUEST',
              'PASSWORD_RESET_COMPLETED',
              'VOTE_CAST',
              'ACCREDIT',
              'DEACCREDIT',
              'ELECTION_CREATE',
              'ELECTION_UPDATE',
              'ELECTION_DELETE',
              'CANDIDATE_CREATE',
              'CANDIDATE_UPDATE',
              'CANDIDATE_DELETE',
              'FACE_ENROLL',
              'FACE_VERIFY',
              'FACE_VERIFY_FAILED',
              'SETTINGS_UPDATED',
              'BACKUP',
              'RESTORE',
              'LOGS_CLEAR',
              'EXPORT_CSV',
              'CONTACT',
              'CONTACT_REPLY',
            ].map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
        <div className="page-actions sm:flex-1 sm:justify-end">
          <button className="btn-secondary" onClick={exportLogs}>
            <i className="fas fa-file-csv" /> Export CSV
          </button>
          <button className="btn-danger" disabled={clearing} onClick={clearLogs}>
            {clearing ? (
              <Spinner size={16} />
            ) : (
              <>
                <i className="fas fa-trash" /> Clear All
              </>
            )}
          </button>
        </div>
      </div>

      {loading ? (
        <FullLoader text="Loading logs..." />
      ) : logs.length === 0 ? (
        <EmptyState icon="fas fa-clipboard-list" title="No log entries" />
      ) : (
        <div className="card card-pad">
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {logs.map((l) => (
              <div key={l._id} className="list-row !py-3">
                <div className="flex flex-wrap items-center gap-2 min-w-0 flex-1 sm:flex-nowrap">
                  <Badge tone={toneFor(l.action)} className="shrink-0">
                    {l.action}
                  </Badge>
                  <p className="text-sm text-slate-600 dark:text-slate-300 min-w-0 flex-1 truncate">{l.description}</p>
                </div>
                <div className="list-row-actions text-xs text-slate-400">
                  <span className="break-anywhere">{l.username || 'system'}</span>
                  <span className="shrink-0">{formatDateShort(l.created_at)}</span>
                  {l.ip_address && <span className="break-anywhere">{l.ip_address}</span>}
                </div>
              </div>
            ))}
          </div>
          {pagination.total_pages > 1 && (
            <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3 mt-6">
              <button className="btn-secondary !py-1.5 !px-3 text-xs btn-compact flex-1 sm:flex-none" disabled={pagination.page <= 1} onClick={() => load(pagination.page - 1)}>
                <i className="fas fa-chevron-left" /> Previous
              </button>
              <span className="text-sm text-slate-500 w-full sm:w-auto text-center">
                Page {pagination.page} of {pagination.total_pages}
              </span>
              <button className="btn-secondary !py-1.5 !px-3 text-xs btn-compact flex-1 sm:flex-none" disabled={pagination.page >= pagination.total_pages} onClick={() => load(pagination.page + 1)}>
                Next <i className="fas fa-chevron-right" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
