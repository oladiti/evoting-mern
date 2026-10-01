import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import { FullLoader, Modal, EmptyState, Badge, Spinner, PageHeader } from '../../components/ui/index';
import { formatDateShort, photoUrl, slugify } from '../../lib/format';
import { Stagger, StaggerItem } from '../../components/ui/motion';

const emptyElection = {
  title: '',
  slug: '',
  description: '',
  position: 'General Election',
  start_date: '',
  end_date: '',
  accreditation_start_date: '',
  accreditation_end_date: '',
  requires_accreditation: false,
};

export default function AdminElections() {
  const toast = useToast();
  const [elections, setElections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [electionModalOpen, setElectionModalOpen] = useState(false);
  const [editingElection, setEditingElection] = useState(null);
  const [electionForm, setElectionForm] = useState({ ...emptyElection });
  const [savingElection, setSavingElection] = useState(false);
  const [selectedElection, setSelectedElection] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [candidateModalOpen, setCandidateModalOpen] = useState(false);
  const [editingCandidate, setEditingCandidate] = useState(null);
  const [candidateForm, setCandidateForm] = useState({ name: '', position: '', bio: '', photo: null });
  const [savingCandidate, setSavingCandidate] = useState(false);
  const [deleting, setDeleting] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const { elections } = await api.get('/api/elections');
      setElections(elections);
      if (selectedElection) {
        const fresh = elections.find((e) => String(e.election_id || e._id) === String(selectedElection.election_id || selectedElection._id));
        if (fresh) {
          setSelectedElection(fresh);
          await loadCandidates(fresh);
        }
      }
    } catch (e) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  const loadCandidates = async (election) => {
    const id = String(election.election_id || election._id);
    try {
      const { candidates } = await api.get(`/api/admin/candidates/${id}`);
      setCandidates(candidates);
    } catch (e) {
      toast.error(e.message);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openCreateElection = () => {
    setEditingElection(null);
    setElectionForm({ ...emptyElection });
    setElectionModalOpen(true);
  };

  const openEditElection = (e) => {
    setEditingElection(e);
    setElectionForm({
      title: e.title || '',
      slug: e.slug || '',
      description: e.description || '',
      position: e.position || 'General Election',
      start_date: toInput(e.start_date),
      end_date: toInput(e.end_date),
      accreditation_start_date: toInput(e.accreditation_start_date),
      accreditation_end_date: toInput(e.accreditation_end_date),
      requires_accreditation: Boolean(e.requires_accreditation),
    });
    setElectionModalOpen(true);
  };

  const saveElection = async (ev) => {
    ev.preventDefault();
    setSavingElection(true);
    try {
      if (editingElection) {
        await api.put(`/api/admin/elections/${editingElection.election_id || editingElection._id}`, electionForm);
        toast.success('Election updated.');
      } else {
        await api.post('/api/admin/elections', electionForm);
        toast.success('Election created.');
      }
      setElectionModalOpen(false);
      await load();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSavingElection(false);
    }
  };

  const deleteElection = async (e) => {
    if (!window.confirm(`Delete election "${e.title}" and all its candidates/votes?`)) return;
    setDeleting(e.election_id || e._id);
    try {
      await api.del(`/api/admin/elections/${e.election_id || e._id}`);
      toast.success('Election deleted.');
      setSelectedElection(null);
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setDeleting(null);
    }
  };

  const selectElection = async (e) => {
    setSelectedElection(e);
    await loadCandidates(e);
  };

  const openCreateCandidate = () => {
    setEditingCandidate(null);
    setCandidateForm({ name: '', position: '', bio: '', photo: null });
    setCandidateModalOpen(true);
  };

  const openEditCandidate = (c) => {
    setEditingCandidate(c);
    setCandidateForm({ name: c.name, position: c.position, bio: c.bio || '', photo: null });
    setCandidateModalOpen(true);
  };

  const saveCandidate = async (ev) => {
    ev.preventDefault();
    setSavingCandidate(true);
    const fd = new FormData();
    fd.append('election_id', selectedElection.election_id || selectedElection._id);
    fd.append('name', candidateForm.name);
    fd.append('position', candidateForm.position);
    fd.append('bio', candidateForm.bio);
    if (candidateForm.photo) fd.append('photo', candidateForm.photo);
    try {
      if (editingCandidate) {
        await api.uploadPut(`/api/admin/candidates/${editingCandidate.candidate_id || editingCandidate._id}`, fd);
        toast.success('Candidate updated.');
      } else {
        await api.upload('/api/admin/candidates', fd);
        toast.success('Candidate added.');
      }
      setCandidateModalOpen(false);
      await loadCandidates(selectedElection);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSavingCandidate(false);
    }
  };

  const deleteCandidate = async (c) => {
    if (!window.confirm(`Delete candidate "${c.name}"?`)) return;
    try {
      await api.del(`/api/admin/candidates/${c.candidate_id || c._id}`);
      toast.success('Candidate deleted.');
      await loadCandidates(selectedElection);
    } catch (e) {
      toast.error(e.message);
    }
  };

  const statusBadge = (e) => (e.status === 'active' ? <Badge tone="green">Active</Badge> : e.status === 'upcoming' ? <Badge tone="amber">Upcoming</Badge> : <Badge tone="gray">Ended</Badge>);

  if (loading) return <FullLoader text="Loading elections..." />;

  return (
    <div className="space-y-6 sm:space-y-8">
      <PageHeader title="Elections & Candidates" subtitle="Manage election schedules and ballot candidates.">
        <button className="btn-primary" onClick={openCreateElection}>
          <i className="fas fa-plus" /> New Election
        </button>
      </PageHeader>

      {elections.length === 0 ? (
        <EmptyState icon="fas fa-poll" title="No elections yet" subtitle="Create your first election to get started." />
      ) : (
        <Stagger className="grid gap-4 sm:gap-5 md:grid-cols-2 xl:grid-cols-3" amount={0.08}>
          {elections.map((e) => (
            <StaggerItem key={String(e.election_id || e._id)}>
              <div
                className={`card p-4 sm:p-5 h-full cursor-pointer hover:shadow-lg transition ${selectedElection && String(selectedElection.election_id || selectedElection._id) === String(e.election_id || e._id) ? 'ring-2 ring-primary-500' : ''}`}
                onClick={() => selectElection(e)}
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-bold text-slate-800 dark:text-slate-100 min-w-0 break-anywhere">{e.title}</h3>
                  <span className="shrink-0">{statusBadge(e)}</span>
                </div>
                <p className="text-xs text-slate-400 mt-2 break-anywhere">
                  {formatDateShort(e.start_date)} → {formatDateShort(e.end_date)}
                </p>
                {e.requires_accreditation && (
                  <span className="inline-block mt-2">
                    <Badge tone="cyan">
                      <i className="fas fa-check-circle mr-1" /> Accreditation required
                    </Badge>
                  </span>
                )}
                <div className="page-actions mt-4" onClick={(ev) => ev.stopPropagation()}>
                  <button className="btn-secondary !py-1.5 !px-3 text-xs btn-compact" onClick={() => openEditElection(e)}>
                    <i className="fas fa-edit" /> Edit
                  </button>
                  <button className="btn-danger !py-1.5 !px-3 text-xs btn-compact" disabled={deleting === (e.election_id || e._id)} onClick={() => deleteElection(e)}>
                    {deleting === (e.election_id || e._id) ? (
                      <Spinner size={14} />
                    ) : (
                      <>
                        <i className="fas fa-trash" /> Delete
                      </>
                    )}
                  </button>
                </div>
              </div>
            </StaggerItem>
          ))}
        </Stagger>
      )}

      {selectedElection && (
        <div className="card card-pad">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between mb-5">
            <div className="min-w-0">
              <h2 className="text-lg sm:text-xl font-bold text-slate-800 dark:text-slate-100 break-anywhere">
                <i className="fas fa-users text-primary-600 mr-2" /> Candidates — {selectedElection.title}
              </h2>
              <p className="text-xs text-slate-400 mt-1">{candidates.length} candidate(s)</p>
            </div>
            <div className="page-actions shrink-0">
              <button className="btn-success" onClick={openCreateCandidate}>
                <i className="fas fa-user-plus" /> Add Candidate
              </button>
            </div>
          </div>

          {candidates.length === 0 ? (
            <EmptyState icon="fas fa-user-slash" title="No candidates yet" />
          ) : (
            <Stagger className="grid gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3" amount={0.06}>
              {candidates.map((c) => (
                <StaggerItem key={String(c.candidate_id || c._id)}>
                  <div className="border border-slate-200 dark:border-slate-700 rounded-xl p-4 h-full">
                    <div className="flex items-center gap-3 min-w-0">
                      {c.photo ? (
                        <img src={photoUrl(c.photo)} alt={c.name} className="w-12 h-12 shrink-0 rounded-full object-cover" />
                      ) : (
                        <div className="w-12 h-12 shrink-0 rounded-full bg-brand-gradient flex items-center justify-center text-white font-bold">{(c.name || '?').charAt(0)}</div>
                      )}
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-800 dark:text-slate-100 truncate">{c.name}</p>
                        <span className="inline-block mt-0.5 max-w-full">
                          <Badge tone="blue" className="max-w-full truncate">
                            {c.position}
                          </Badge>
                        </span>
                      </div>
                    </div>
                    <div className="page-actions mt-3">
                      <button className="btn-secondary !py-1 !px-3 text-xs btn-compact" onClick={() => openEditCandidate(c)}>
                        <i className="fas fa-edit" /> Edit
                      </button>
                      <button className="btn-danger !py-1 !px-3 text-xs btn-compact" onClick={() => deleteCandidate(c)}>
                        <i className="fas fa-trash" /> Remove
                      </button>
                    </div>
                  </div>
                </StaggerItem>
              ))}
            </Stagger>
          )}
        </div>
      )}

      {/* Election modal */}
      <Modal
        open={electionModalOpen}
        onClose={() => setElectionModalOpen(false)}
        title={editingElection ? 'Edit Election' : 'Create Election'}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setElectionModalOpen(false)}>
              Cancel
            </button>
            <button className="btn-primary" disabled={savingElection} onClick={saveElection}>
              {savingElection ? <Spinner size={16} /> : 'Save'}
            </button>
          </>
        }
      >
        <form onSubmit={saveElection} className="space-y-4">
          <ElectionFields form={electionForm} setForm={setElectionForm} />
        </form>
      </Modal>

      {/* Candidate modal */}
      <Modal
        open={candidateModalOpen}
        onClose={() => setCandidateModalOpen(false)}
        title={editingCandidate ? 'Edit Candidate' : 'Add Candidate'}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setCandidateModalOpen(false)}>
              Cancel
            </button>
            <button className="btn-primary" disabled={savingCandidate} onClick={saveCandidate}>
              {savingCandidate ? <Spinner size={16} /> : 'Save'}
            </button>
          </>
        }
      >
        <form onSubmit={saveCandidate} className="space-y-4">
          <div>
            <label className="label" htmlFor="candidate-name">
              Candidate Name *
            </label>
            <input id="candidate-name" name="name" className="input" required value={candidateForm.name} onChange={(e) => setCandidateForm({ ...candidateForm, name: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="candidate-position">
              Position *
            </label>
            <input
              id="candidate-position"
              name="position"
              className="input"
              required
              value={candidateForm.position}
              onChange={(e) => setCandidateForm({ ...candidateForm, position: e.target.value })}
              placeholder="e.g. President"
            />
          </div>
          <div>
            <label className="label" htmlFor="candidate-bio">
              Bio
            </label>
            <textarea id="candidate-bio" name="bio" className="input" rows={3} value={candidateForm.bio} onChange={(e) => setCandidateForm({ ...candidateForm, bio: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="candidate-photo">
              Photo (jpg/png/gif/webp, max 2MB)
            </label>
            <input
              id="candidate-photo"
              name="photo"
              className="input !p-1.5"
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              onChange={(e) => setCandidateForm({ ...candidateForm, photo: e.target.files[0] || null })}
            />
            {editingCandidate?.photo && !candidateForm.photo && <p className="text-xs text-slate-400 mt-1">Current photo is kept if none selected.</p>}
          </div>
        </form>
      </Modal>
    </div>
  );
}

function toInput(d) {
  if (!d) return '';
  const dt = new Date(d);
  const pad = (n) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}

function ElectionFields({ form, setForm }) {
  const set = (k) => (e) => setForm({ ...form, [k]: k === 'requires_accreditation' ? e.target.checked : e.target.value });

  // An empty slug field means "derive it from the title", which is what the
  // server does on create. Mirroring that here keeps the preview honest.
  const isNew = !form.slug;
  const effectiveSlug = slugify(isNew ? form.title : form.slug);

  return (
    <>
      <div>
        <label className="label" htmlFor="election-title">
          Title *
        </label>
        <input id="election-title" name="title" className="input" required value={form.title} onChange={set('title')} />
      </div>
      <div>
        <label className="label" htmlFor="election-slug">
          URL Slug
        </label>
        <input id="election-slug" name="slug" className="input font-mono text-sm" value={form.slug} onChange={set('slug')} placeholder={slugify(form.title)} maxLength={120} />
        <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 break-anywhere">
          Public link: <span className="font-mono">/results/{effectiveSlug}</span>
        </p>
        {isNew && <p className="mt-1 text-xs text-slate-400">Leave blank to generate this from the title automatically.</p>}
        {!isNew && form.slug !== effectiveSlug && (
          <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">Changing this repoints the election&apos;s public URL. Existing shared links will stop working.</p>
        )}
      </div>
      <div>
        <label className="label" htmlFor="election-description">
          Description
        </label>
        <textarea id="election-description" name="description" className="input" rows={3} value={form.description} onChange={set('description')} />
      </div>
      <div>
        <label className="label" htmlFor="election-position">
          Position Label
        </label>
        <input id="election-position" name="position" className="input" value={form.position} onChange={set('position')} />
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="label" htmlFor="election-start-date">
            Start Date/Time *
          </label>
          <input id="election-start-date" name="start_date" className="input" type="datetime-local" required value={form.start_date} onChange={set('start_date')} />
        </div>
        <div>
          <label className="label" htmlFor="election-end-date">
            End Date/Time *
          </label>
          <input id="election-end-date" name="end_date" className="input" type="datetime-local" required value={form.end_date} onChange={set('end_date')} />
        </div>
        <div>
          <label className="label" htmlFor="election-accreditation-start">
            Accreditation Start
          </label>
          <input
            id="election-accreditation-start"
            name="accreditation_start_date"
            className="input"
            type="datetime-local"
            value={form.accreditation_start_date}
            onChange={set('accreditation_start_date')}
          />
        </div>
        <div>
          <label className="label" htmlFor="election-accreditation-end">
            Accreditation End
          </label>
          <input id="election-accreditation-end" name="accreditation_end_date" className="input" type="datetime-local" value={form.accreditation_end_date} onChange={set('accreditation_end_date')} />
        </div>
      </div>
      <label className="flex items-start gap-3 cursor-pointer" htmlFor="election-requires-accreditation">
        <input
          id="election-requires-accreditation"
          name="requires_accreditation"
          type="checkbox"
          className="mt-0.5 h-4 w-4 shrink-0 rounded"
          checked={form.requires_accreditation}
          onChange={set('requires_accreditation')}
        />
        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Requires admin accreditation to vote</span>
      </label>
    </>
  );
}
