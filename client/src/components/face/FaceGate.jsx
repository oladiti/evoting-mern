import { useEffect, useRef, useState, useCallback } from 'react';
import { api } from '../../lib/api';
import FaceCamera from './FaceCamera';
import { Spinner } from '../ui/index';

function dataUrlToBlob(dataUrl) {
  const [head, body] = dataUrl.split(',');
  const mime = head.match(/:(.*?);/)?.[1] || 'image/jpeg';
  const bin = atob(body);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

// Three samples per capture, spaced far enough apart to be independent frames.
// A single frame is a noisy estimate of a face: the descriptor moves noticeably
// between two frames of the same person, and the server matcher is comparing
// that noise against a fixed ceiling. Averaging the samples is what lets the
// ceiling sit tight enough to tell two people apart.
const SAMPLE_COUNT = 3;
const SAMPLE_INTERVAL_MS = 550;

// If the samples disagree by more than this the user was moving, blinking or
// turning their head, and the average of those samples describes nobody. Better
// to ask for another attempt than to enrol a blurred template.
const MAX_SAMPLE_SPREAD = 0.25;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Same unit-length comparison the server uses, so a spread rejected here is a
// spread the server would also have treated as a different person.
function unitLength(vec) {
  let sum = 0;
  for (let i = 0; i < vec.length; i++) sum += vec[i] * vec[i];
  const norm = Math.sqrt(sum);
  return norm ? vec.map((v) => v / norm) : vec.slice();
}

function distance(a, b) {
  const ua = unitLength(a);
  const ub = unitLength(b);
  let sum = 0;
  for (let i = 0; i < ua.length; i++) {
    const d = ua[i] - ub[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

function meanDescriptor(samples) {
  const out = new Array(samples[0].descriptor.length).fill(0);
  for (const s of samples) {
    for (let i = 0; i < out.length; i++) out[i] += s.descriptor[i];
  }
  return out.map((v) => v / samples.length);
}

function maxSpread(samples) {
  let worst = 0;
  for (let i = 0; i < samples.length; i++) {
    for (let j = i + 1; j < samples.length; j++) {
      worst = Math.max(worst, distance(samples[i].descriptor, samples[j].descriptor));
    }
  }
  return worst;
}

export default function FaceGate({ onComplete, onError, skipLabel = 'Skip for now', allowSkip = true }) {
  const [phase, setPhase] = useState('loading'); // loading | enroll | verify | done
  const [preview, setPreview] = useState(null); // data URL
  const [statusMsg, setStatusMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [hint, setHint] = useState('');
  const captureRef = useRef(null);
  const [lastCapture, setLastCapture] = useState(null);
  const [sampling, setSampling] = useState(false);
  const samplingRef = useRef(false);

  // The three call sites all pass inline arrow functions, so these identities
  // change on every render. Holding them in refs keeps the status check and the
  // camera from restarting each time this component re-renders.
  const onCompleteRef = useRef(onComplete);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onCompleteRef.current = onComplete;
    onErrorRef.current = onError;
  });

  useEffect(() => {
    let alive = true;
    api
      .get('/api/face/status')
      .then((s) => {
        if (!alive) return;
        if (s.face_enrolled && s.face_verified) {
          setPhase('done');
          onCompleteRef.current?.();
        } else if (s.face_enrolled) {
          setPhase('verify');
        } else {
          setPhase('enroll');
        }
      })
      .catch((e) => {
        if (!alive) return;
        setErrorMsg(e.message);
        onErrorRef.current?.(e.message);
      });
    return () => {
      alive = false;
    };
  }, []);

  // Stable identity keeps FaceCamera's camera effect from being torn down and
  // restarted on every render of this component.
  const handleCameraStatus = useCallback((s) => {
    if (s?.type === 'face-detected') {
      setHint(s.hint || '');
      // The camera re-announces a good frame many times a second. Clearing the
      // status here is what makes the "Face detected" text disappear once the
      // framing is right, but during sampling the same signal would wipe out the
      // "sample 2 of 3" progress before it could be read.
      if (s.ready && !samplingRef.current) setStatusMsg('');
    } else if (s?.type === 'face-lost') {
      setHint(s.hint || '');
    } else if (s?.type === 'error') {
      setHint('');
    }
  }, []);

  const capture = useCallback(async () => {
    setErrorMsg('');
    setStatusMsg('Hold still — collecting your face...');
    setSampling(true);
    samplingRef.current = true;
    try {
      const samples = [];
      for (let i = 0; i < SAMPLE_COUNT; i++) {
        if (i > 0) {
          setStatusMsg(`Hold still — sample ${i + 1} of ${SAMPLE_COUNT}...`);
          await sleep(SAMPLE_INTERVAL_MS);
        }
        const result = await captureRef.current?.capture?.();
        if (!result || !result.ok) {
          setStatusMsg('');
          setErrorMsg(result?.reason || hint || 'No usable face detected. Face the camera in good light, roughly an arm’s length away.');
          return;
        }
        samples.push(result);
      }

      const spread = maxSpread(samples);
      if (spread > MAX_SAMPLE_SPREAD) {
        setStatusMsg('');
        setErrorMsg('Your face was not steady across the samples. Hold still and press Capture again.');
        return;
      }

      // Keep the brightest sample's crop for the stored photo. The descriptor
      // sent is the average, so the photo is only a human-readable record, and
      // the clearest of the three is the one worth showing an administrator.
      const best = samples.reduce((a, b) => ((b.luminance ?? 0) > (a.luminance ?? 0) ? b : a));
      setLastCapture({ descriptor: meanDescriptor(samples), imageUrl: best.imageUrl });
      setPreview(best.imageUrl);
      setStatusMsg('');
    } finally {
      samplingRef.current = false;
      setSampling(false);
    }
  }, [hint]);

  const retake = () => {
    setPreview(null);
    setStatusMsg('');
    setErrorMsg('');
  };

  const saveEnroll = async () => {
    if (!lastCapture?.descriptor) {
      setErrorMsg('Capture your face first.');
      return;
    }
    setStatusMsg('Saving your face profile...');
    const fd = new FormData();
    fd.append('descriptor', JSON.stringify(lastCapture.descriptor));
    if (lastCapture.imageUrl) fd.append('facePhoto', dataUrlToBlob(lastCapture.imageUrl), 'face.jpg');
    try {
      await api.upload('/api/face/enroll', fd);
      setPhase('verify');
      retake();
      setStatusMsg('Face profile saved. Now capture yourself again to confirm it matches.');
    } catch (e) {
      setErrorMsg(e.message);
      setStatusMsg('');
    }
  };

  const submitVerify = async () => {
    if (!lastCapture?.descriptor) {
      setErrorMsg('Capture your face first.');
      return;
    }
    setStatusMsg('Verifying your identity...');
    try {
      await api.post('/api/face/verify', { descriptor: lastCapture.descriptor });
      setPhase('done');
      retake();
      onCompleteRef.current?.();
    } catch (e) {
      setErrorMsg(e.message);
      setStatusMsg('');
      retake();
      onErrorRef.current?.(e.message);
    }
  };

  if (phase === 'loading') {
    return (
      <div className="card p-8 text-center">
        <Spinner size={32} className="text-primary-600" />
        <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">Checking your face profile...</p>
      </div>
    );
  }

  if (phase === 'done') {
    return null;
  }

  return (
    <div className="card p-6 sm:p-8">
      <div className="text-center mb-6">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-warm-gradient text-white flex items-center justify-center text-2xl mb-3">
          <i className={phase === 'enroll' ? 'fas fa-user-plus' : 'fas fa-camera'} />
        </div>
        <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100">{phase === 'enroll' ? 'Step 1: Enroll Your Face' : 'Step 2: Verify Your Identity'}</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          {phase === 'enroll' ? 'Set up your face for verification. This is a one-time setup.' : 'This is a one-time check. Once verified you can vote any time you log in.'}
        </p>
      </div>

      {errorMsg && (
        <div className="mb-4 text-sm text-danger-600 dark:text-danger-400 bg-danger-500/10 border border-danger-500/30 px-4 py-3 rounded-xl">
          <i className="fas fa-exclamation-triangle mr-2" />
          {errorMsg}
        </div>
      )}
      {statusMsg && <div className="mb-4 text-sm text-primary-700 dark:text-primary-400 bg-primary-500/10 border border-primary-500/30 px-4 py-3 rounded-xl text-center">{statusMsg}</div>}

      {/* FaceCamera stays mounted across the preview toggle on purpose. Toggling
          it out would stop the stream and immediately re-request it, which some
          browsers reject with NotReadableError ("camera already in use"). */}
      <div className="relative">
        <FaceCamera captureRef={captureRef} onStatus={handleCameraStatus} />

        {!preview && (
          <div className="min-h-[1.75rem] mt-3 text-center">
            {hint ? (
              <span className="text-sm text-warning-600 dark:text-warning-400">
                <i className="fas fa-circle-info mr-1.5" />
                {hint}
              </span>
            ) : (
              <span className="text-sm text-success-600 dark:text-success-400">
                <i className="fas fa-circle-check mr-1.5" />
                Face detected. Hold still and press Capture — {SAMPLE_COUNT} samples are taken automatically.
              </span>
            )}
          </div>
        )}

        {!preview && (
          <div className="flex flex-wrap justify-center gap-3 mt-4">
            <button className="btn-primary" onClick={capture} disabled={sampling}>
              <i className={`fas ${sampling ? 'fa-spinner fa-spin' : 'fa-camera'}`} /> {sampling ? 'Capturing...' : 'Capture'}
            </button>
            {allowSkip && phase === 'enroll' && (
              <button
                className="btn-secondary"
                onClick={() => {
                  setErrorMsg('');
                  setStatusMsg('You can enroll your face anytime from the face enrollment page.');
                }}
              >
                {skipLabel}
              </button>
            )}
          </div>
        )}

        {preview && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 rounded-2xl bg-slate-900/85 p-4 text-center backdrop-blur-sm">
            <img src={preview} alt="Captured face" className="w-44 h-44 sm:w-56 sm:h-56 object-cover rounded-2xl border-4 border-primary-500" />
            <p className="text-xs text-slate-300 max-w-sm">
              {phase === 'enroll' ? 'This is the face that will be enrolled. Make sure it is clear and unobstructed.' : 'Confirm this is you, then verify.'}
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <button className="btn-secondary" onClick={retake}>
                <i className="fas fa-redo" /> Retake
              </button>
              {phase === 'enroll' ? (
                <button className="btn-primary" onClick={saveEnroll}>
                  <i className="fas fa-check" /> Save &amp; Continue
                </button>
              ) : (
                <button className="btn-success" onClick={submitVerify}>
                  <i className="fas fa-check-circle" /> Verify Identity
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
