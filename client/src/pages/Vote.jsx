import { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useGeolocation } from '../hooks/useGeolocation';
import CandidateCard from '../components/CandidateCard';
import FaceGate from '../components/face/FaceGate';
import Recaptcha from '../components/ui/Recaptcha';
import { FullLoader } from '../components/ui/index';
import { ErrorMessage, SuccessMessage } from '../components/ui/guards';
import { useCountdown } from '../hooks/useCountdown';
import { formatDate } from '../lib/format';
import { loadPublicBootstrap } from '../lib/format';

export default function Vote() {
  const { slug } = useParams();
  const { user, refreshUser } = useAuth();
  const toast = useToast();
  const [election, setElection] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [positions, setPositions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [needsFace, setNeedsFace] = useState(false);
  const [selections, setSelections] = useState({});
  const geoState = useGeolocation();
  const [geofenceEnabled, setGeofenceEnabled] = useState(true);
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaEnabled, setCaptchaEnabled] = useState(false);
  const [siteKey, setSiteKey] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const countdown = useCountdown(election?.end_date);

  useEffect(() => {
    loadPublicBootstrap().then((b) => {
      setCaptchaEnabled(b.recaptcha_enabled);
      setSiteKey(b.recaptcha_site_key);
      setNeedsFace(Boolean(b.face_verification_enabled && !user?.face_verified));
      setGeofenceEnabled(b.geofence_enabled !== false);
    });
  }, [user]);

  useEffect(() => {
    api
      .get(`/api/elections/${encodeURIComponent(slug)}`)
      .then((data) => {
        setElection(data.election);
        setCandidates(data.election.candidates || []);
        setPositions([...new Set((data.election.candidates || []).map((c) => c.position))]);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [slug]);

  useEffect(() => {
    if (geofenceEnabled && election?.status === 'active' && !election?.already_voted && geoState.status === 'idle') {
      geoState.request();
    }
  }, [geofenceEnabled, election?.status, election?.already_voted, geoState.status, geoState.request]);

  const geoOk = useMemo(() => geoState.status === 'success', [geoState.status]);

  const selectionsCount = positions.filter((p) => selections[p]).length;

  const toggleSelect = (pos) => (candidateId) => setSelections((s) => ({ ...s, [pos]: candidateId }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (selectionsCount < positions.length) {
      setError(`You must select a candidate for all ${positions.length} position(s).`);
      return;
    }
    // Null checks rather than falsy ones: a coordinate of exactly 0 (null island,
    // or a genuine 0 latitude on the equator) is a real position, not a missing one.
    if (geofenceEnabled && (!geoOk || geoState.lat == null || geoState.lng == null)) {
      setError('Please share your location so we can verify you are within the campus area.');
      return;
    }
    if (captchaEnabled && !captchaToken) {
      setError('Please complete the captcha.');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/api/votes/cast', {
        // The ballot is addressed by slug, but the write stays id-only: the
        // server's isValidObjectId guard on this endpoint would reject a slug
        // with 400. election_id comes from the fetched election, so it is always
        // a real ObjectId regardless of which form the URL used.
        election_id: election?.election_id || election?._id,
        votes: selections,
        // Omitted entirely when the fence is off so the server never sees a
        // coordinate it has no way to act on.
        ...(geofenceEnabled ? { geo_lat: geoState.lat, geo_lng: geoState.lng } : {}),
        'g-recaptcha-response': captchaToken || undefined,
      });
      setSuccess(true);
      await refreshUser();
      toast.success('Your votes have been cast successfully!');
    } catch (err) {
      setError(err.message);
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <FullLoader text="Loading ballot..." />;

  if (success) {
    return (
      <div className="max-w-lg mx-auto py-20 text-center">
        <div className="w-20 h-20 mx-auto rounded-full bg-success-500/15 flex items-center justify-center text-success-500 text-4xl mb-6">
          <i className="fas fa-check-circle" />
        </div>
        <h1 className="text-2xl font-extrabold text-slate-800 dark:text-slate-100">Vote Cast Successfully!</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-3">Thank you for participating in this election. Your ballot has been recorded securely.</p>
        <div className="flex justify-center gap-3 mt-8">
          <Link to="/dashboard" className="btn-primary">
            <i className="fas fa-tachometer-alt" /> Back to Dashboard
          </Link>
          <Link to="/results" className="btn-secondary">
            <i className="fas fa-chart-bar" /> View Results
          </Link>
        </div>
      </div>
    );
  }

  if (error && !election) {
    return (
      <div className="max-w-md mx-auto py-20 text-center">
        <i className="fas fa-exclamation-triangle text-4xl text-danger-500 mb-4" />
        <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">{error}</h1>
        <Link to="/dashboard" className="btn-primary mt-6">
          Back to Dashboard
        </Link>
      </div>
    );
  }

  const sameDay = new Date(election.start_date).toDateString();
  const geoMessage =
    geoState.status === 'success' ? 'You are within the campus area. You may vote.' : geoState.status === 'requesting' ? 'Verifying your location...' : geoState.error || 'Verifying your location...';

  return (
    <div className="max-w-4xl mx-auto">
      <div className="card p-6 mb-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-800 dark:text-slate-100">
              <i className="fas fa-clipboard-check text-primary-600 mr-2" />
              {election.title}
            </h1>
            {election.description && <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 whitespace-pre-line">{election.description}</p>}
            <p className="text-xs text-slate-400 mt-2">
              <i className="fas fa-calendar-alt mr-1" /> {formatDate(election.start_date)} — {formatDate(election.end_date)} (same day: {sameDay})
              {countdown.text && election.status === 'active' && <span className="ml-2 badge bg-primary-500/15 text-primary-700 dark:text-primary-400">{countdown.text}</span>}
            </p>
          </div>
          {election.already_voted ? (
            <span className="badge bg-success-500/15 text-success-600 text-sm py-1 px-3">
              <i className="fas fa-check-double mr-1" /> Already voted
            </span>
          ) : null}
        </div>
      </div>

      <ErrorMessage message={error} />

      {/* Geo banner - only meaningful while the fence is switched on */}
      {geofenceEnabled && (
        <div
          className={`mb-5 px-4 py-3 rounded-xl text-sm flex items-center gap-3 ${
            geoOk
              ? 'bg-success-500/10 text-success-600 dark:text-success-400 border border-success-500/30'
              : geoState.status === 'error'
                ? 'bg-danger-500/10 text-danger-600 dark:text-danger-400 border border-danger-500/30'
                : 'bg-info-500/10 text-info-600 dark:text-info-400 border border-info-500/30'
          }`}
        >
          <i className={`fas ${geoOk ? 'fa-check-circle' : 'fa-location-crosshairs'}${geoState.status === 'requesting' ? ' animate-pulse' : ''}`} />
          <span>{geoOk ? 'Verified: you are within the campus area and eligible to vote.' : geoMessage}</span>
          {!geoOk && (
            <button onClick={() => geoState.request()} className="ml-auto btn-secondary !px-3 !py-1 text-xs">
              Retry
            </button>
          )}
        </div>
      )}

      {/* Face gate */}
      {needsFace && !election.already_voted && (
        <div className="mb-6">
          <FaceGate
            onComplete={() => {
              setNeedsFace(false);
              refreshUser();
            }}
            onError={(msg) => setError(msg)}
            allowSkip={false}
          />
        </div>
      )}

      {election.already_voted ? (
        <div className="card p-8 text-center">
          <i className="fas fa-lock text-4xl text-success-500 mb-4" />
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">You have already voted in this election.</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">Each voter may cast only one ballot per position.</p>
          <Link to="/dashboard" className="btn-primary mt-6">
            <i className="fas fa-tachometer-alt" /> Back to Dashboard
          </Link>
        </div>
      ) : needsFace ? (
        <div className="card p-8 text-center">
          <i className="fas fa-user-shield text-4xl text-primary-600 dark:text-primary-400 mb-4" />
          <p className="text-slate-500 dark:text-slate-400">Complete the face verification above to unlock the ballot.</p>
        </div>
      ) : election.status === 'active' ? (
        <form onSubmit={submit} className="space-y-8">
          {positions.map((position) => (
            <section key={position} className="card p-6">
              <div className="mb-4">
                <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">
                  <i className="fas fa-bullseye text-secondary-500 mr-2" />
                  {position}
                </h2>
                <p className="text-xs text-slate-400">{candidates.filter((c) => c.position === position).length} candidate(s) — pick one</p>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                {candidates
                  .filter((c) => c.position === position)
                  .map((c) => (
                    <CandidateCard
                      key={String(c.candidate_id || c._id)}
                      candidate={c}
                      position={position}
                      selected={selections[position] === String(c.candidate_id || c._id)}
                      onSelect={toggleSelect(position)}
                    />
                  ))}
              </div>
            </section>
          ))}

          <div className="card p-6">
            <Recaptcha siteKey={siteKey} enabled={captchaEnabled} onChange={setCaptchaToken} />
            <div className="mt-4 flex items-center justify-between gap-4 flex-wrap">
              <div className="text-sm text-slate-500 dark:text-slate-400">
                <strong>Selections:</strong>{' '}
                <span className="text-slate-800 dark:text-slate-100">
                  {selectionsCount} / {positions.length} positions
                </span>
              </div>
              <button className="btn-success" disabled={submitting || selectionsCount < positions.length}>
                {submitting ? (
                  <>
                    <span className="animate-spin">
                      <i className="fas fa-circle-notch" />
                    </span>{' '}
                    Submitting...
                  </>
                ) : (
                  <>
                    <i className="fas fa-check-circle" /> Submit All Votes
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      ) : (
        <div className="card p-8 text-center">
          <i className={`fas ${election.status === 'upcoming' ? 'fa-hourglass-half' : 'fa-calendar-times'} text-4xl text-warning-500 mb-4`} />
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">{election.status === 'upcoming' ? 'This election has not started yet.' : 'This election has ended.'}</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
            {election.status === 'upcoming' ? `Voting opens on ${formatDate(election.start_date)}.` : 'You can view the results instead.'}
          </p>
          <Link to="/dashboard" className="btn-primary mt-6">
            Back to Dashboard
          </Link>
        </div>
      )}
    </div>
  );
}
