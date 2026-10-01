import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ErrorMessage, SuccessMessage } from '../components/ui/guards';
import { api } from '../lib/api';
import { PageTransition, FadeUp } from '../components/ui/motion';

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    setOk('');
    if (password !== confirm) {
      setErr('Passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      const res = await api.post('/api/auth/reset-password', { token, password });
      setOk(res.message);
      setTimeout(() => navigate('/login'), 1600);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  // Without a token the form can only ever post an empty one, so say so plainly
  // instead of letting the user fill it in only to be rejected by the server.
  if (!token) {
    return (
      <PageTransition className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center px-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-warm-gradient flex items-center justify-center text-white text-2xl mb-4">
              <i className="fas fa-link-slash" />
            </div>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Invalid Reset Link</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">This page needs a reset token. Open the link from your email, or request a new one.</p>
          </div>
          <div className="card p-6 space-y-3">
            <ErrorMessage message="No reset token was provided in the link." />
            <Link to="/forgot-password" className="btn-primary w-full">
              <i className="fas fa-envelope mr-2" /> Request a New Link
            </Link>
            <Link to="/login" className="btn-outline w-full">
              Back to Login
            </Link>
          </div>
        </div>
      </PageTransition>
    );
  }

  return (
    <PageTransition className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-warm-gradient flex items-center justify-center text-white text-2xl mb-4">
            <i className="fas fa-lock" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Set a New Password</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Choose a strong password to continue.</p>
        </div>
        <form onSubmit={submit} className="card p-6 space-y-4">
          <FadeUp delay={0.15}>
            <ErrorMessage message={err} />
            <SuccessMessage message={ok} />
          </FadeUp>
          <div>
            <label className="label" htmlFor="reset-password-new">
              New Password
            </label>
            <input
              id="reset-password-new"
              name="password"
              className="input"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="8+ chars, upper/lower/digit"
            />
          </div>
          <div>
            <label className="label" htmlFor="reset-password-confirm">
              Confirm Password
            </label>
            <input id="reset-password-confirm" name="confirm_password" className="input" type="password" required minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </div>
          <p className="text-xs text-slate-400">Password must be at least 8 characters and contain uppercase, lowercase and a number.</p>
          <button type="submit" className="btn-primary w-full" disabled={busy}>
            {busy ? (
              'Updating...'
            ) : (
              <>
                <i className="fas fa-check" /> Update Password
              </>
            )}
          </button>
        </form>
        <p className="text-center text-sm text-slate-500 dark:text-slate-400 mt-6">
          Changed your mind?{' '}
          <Link to="/login" className="text-primary-600 dark:text-primary-400 font-semibold hover:underline">
            Back to login
          </Link>
        </p>
      </div>
    </PageTransition>
  );
}
