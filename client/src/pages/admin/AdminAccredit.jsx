import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import { FullLoader, EmptyState, Badge, PageHeader } from '../../components/ui/index';

export default function AdminAccredit() {
  const toast = useToast();
  const [elections, setElections] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [data, setData] = useState(null);
  const [q, setQ] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get('/api/elections')
      .then((res) => setElections(res.elections))
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, []);

  const loadVoters = async (id, query = q) => {
    if (!id) return;
    try {
      const d = await api.get(`/api/admin/accredit/${id}${query ? `?q=${encodeURIComponent(query)}` : ''}`);
      setData(d);
    } catch (e) {
      toast.error(e.message);
    }
  };

  useEffect(() => {
    if (selectedId) loadVoters(selectedId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const toggle = async (user, accredited) => {
    setBusyId(String(user.user_id));
    try {
      if (accredited) {
        await api.post('/api/admin/deaccredit', { election_id: selectedId, user_id: user.user_id });
        toast.info(`${user.full_name || user.username} de-accredited.`);
      } else {
        // The server distinguishes a fresh accreditation from a repeat and only
        // mails the voter on the former, so the toast has to use its wording
        // rather than asserting success unconditionally.
        const res = await api.post('/api/admin/accredit', { election_id: selectedId, user_id: user.user_id });
        if (res.already_accredited) toast.info(res.message);
        else toast.success(res.message);
      }
      await loadVoters(selectedId);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusyId(null);
    }
  };

  // Recovery path for accounts stranded by a broken mail server: login is
  // blocked until the address is verified, so an admin has to be able to do it
  // by hand. Every use is written to the activity log.
  const verifyEmail = async (user) => {
    const name = user.full_name || user.username || user.email;
    const ok = window.confirm(
      `Mark the email for ${name} (${user.email}) as verified?\n\nOnly do this if you have confirmed the address by another means. This bypasses the emailed code and is recorded in the activity log.`
    );
    if (!ok) return;
    setBusyId(String(user.user_id));
    try {
      const res = await api.post(`/api/admin/users/${user.user_id}/verify-email`);
      toast.success(res.message || `Email verified for ${name}.`);
      await loadVoters(selectedId);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusyId(null);
    }
  };

  const bulkAccredit = async () => {
    const unaccredited = data?.voters.filter((v) => !v.is_accredited && v.email_verified).map((v) => v.user_id);
    if (!unaccredited?.length) {
      toast.info('No eligible unaccredited voters.');
      return;
    }
    if (!window.confirm(`Accredit all ${unaccredited.length} verified voter(s)?`)) return;
    try {
      const res = await api.post('/api/admin/accredit/bulk', { election_id: selectedId, user_ids: unaccredited });
      toast.success(res.message);
      await loadVoters(selectedId);
    } catch (e) {
      toast.error(e.message);
    }
  };

  if (loading) return <FullLoader text="Loading accreditation module..." />;

  return (
    <div className="space-y-6">
      <PageHeader title="Accredit Voters" subtitle="Approve which registered voters may participate in each election." />

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="w-full sm:w-80">
          <label className="label" htmlFor="accredit-election">
            Select Election
          </label>
          <select id="accredit-election" name="election_id" className="input" value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
            <option value="">-- Choose election --</option>
            {elections.map((e) => (
              <option key={String(e.election_id || e._id)} value={String(e.election_id || e._id)}>
                {e.title} {e.requires_accreditation ? '(accreditation)' : ''}
              </option>
            ))}
          </select>
        </div>
        <div className="w-full sm:flex-1 sm:min-w-[12rem]">
          <label className="label" htmlFor="accredit-search">
            Search voters
          </label>
          <input
            id="accredit-search"
            name="q"
            className="input"
            placeholder="Name, username, email or matric no..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && loadVoters(selectedId, q)}
          />
        </div>
        <div className="page-actions">
          <button className="btn-secondary" onClick={() => loadVoters(selectedId, q)}>
            <i className="fas fa-search" /> Search
          </button>
          <button className="btn-success" onClick={bulkAccredit} disabled={!data}>
            <i className="fas fa-users" /> Bulk Accredit
          </button>
        </div>
      </div>

      {!selectedId ? (
        <EmptyState icon="fas fa-hand-pointer" title="Choose an election to manage accreditation" />
      ) : !data ? (
        <EmptyState icon="fas fa-users" title="No voter data" />
      ) : (
        <div className="card card-pad">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <h2 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2 min-w-0 break-anywhere">
              {data.election.title}
              <Badge tone={data.accreditation_open ? 'green' : 'amber'} className="shrink-0">
                {data.accreditation_open ? 'Window open' : 'Window closed'}
              </Badge>
            </h2>
            <span className="text-sm text-slate-400 shrink-0">{data.voters.length} voter(s)</span>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {data.voters.map((v) => (
              <div key={String(v.user_id)} className="list-row">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="w-9 h-9 rounded-full bg-primary-500/15 text-primary-600 dark:text-primary-400 flex items-center justify-center font-bold shrink-0">
                    {(v.full_name || v.username || '?').charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-slate-800 dark:text-slate-100 truncate text-sm">{v.full_name || v.username}</p>
                    <p className="text-xs text-slate-400 truncate break-anywhere">
                      {v.email}
                      {v.matric_no ? ` · ${v.matric_no}` : ''}
                    </p>
                  </div>
                </div>
                <div className="list-row-actions">
                  {!v.email_verified && (
                    <>
                      <Badge tone="amber" className="shrink-0">
                        Unverified email
                      </Badge>
                      <button
                        className="btn-outline !py-1.5 !px-3 text-xs btn-compact"
                        disabled={busyId === String(v.user_id)}
                        onClick={() => verifyEmail(v)}
                        title="Mark this email as verified without an emailed code"
                      >
                        <i className="fas fa-envelope-circle-check" /> Verify
                      </button>
                    </>
                  )}
                  <button
                    className={`${v.is_accredited ? 'btn-danger' : 'btn-success'} !py-1.5 !px-3 text-xs btn-compact`}
                    disabled={busyId === String(v.user_id)}
                    onClick={() => toggle(v, v.is_accredited)}
                  >
                    {v.is_accredited ? (
                      <>
                        <i className="fas fa-user-minus" /> De-accredit
                      </>
                    ) : (
                      <>
                        <i className="fas fa-user-check" /> Accredit
                      </>
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
