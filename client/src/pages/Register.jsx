import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Recaptcha from '../components/ui/Recaptcha';
import { ErrorMessage, SuccessMessage } from '../components/ui/guards';
import { api } from '../lib/api';
import { loadPublicBootstrap } from '../lib/format';
import { PageTransition, Stagger, StaggerItem, FadeUp } from '../components/ui/motion';

export default function Register() {
  const navigate = useNavigate();
  const [bootstrap, setBootstrap] = useState({ voter_registration_enabled: true, recaptcha_enabled: false, recaptcha_site_key: null });
  const [form, setForm] = useState({ username: '', email: '', password: '', full_name: '', matric_no: '' });
  const [confirm, setConfirm] = useState('');
  const [captchaToken, setCaptchaToken] = useState('');
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    loadPublicBootstrap()
      .then(setBootstrap)
      .catch(() => {});
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    setOk('');
    if (form.password !== confirm) {
      setErr('Passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      const res = await api.post('/api/auth/register', {
        ...form,
        'g-recaptcha-response': captchaToken || undefined,
      });
      // The account exists either way, so we always continue to the verify step.
      // "sent=0" tells that page the code never left the server, instead of
      // letting it imply a code is on its way.
      const q = new URLSearchParams({ email: form.email });
      if (res.emailSent === false) q.set('sent', '0');
      navigate(`/verify-email?${q.toString()}`);
    } catch (e) {
      // Re-registering an unverified account returns 502 with resend: true when
      // the mail server rejects the new code. Land on the verify page so the
      // user can retry rather than showing a dead-end error.
      if (e.data?.resend) {
        const q = new URLSearchParams({ email: form.email, sent: '0' });
        navigate(`/verify-email?${q.toString()}`);
        return;
      }
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (!bootstrap.voter_registration_enabled) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center px-4">
        <div className="card max-w-md w-full p-8 text-center">
          <i className="fas fa-user-slash text-4xl text-warning-500 mb-4" />
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Registration Disabled</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">Voter registration is currently closed. Please check back later.</p>
          <Link to="/" className="btn-primary mt-6">
            Back to Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <PageTransition className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg">
        <Stagger className="text-center mb-8" amount={0.12}>
          <StaggerItem>
            <div className="w-14 h-14 mx-auto rounded-2xl bg-brand-gradient flex items-center justify-center text-white text-2xl mb-4">
              <i className="fas fa-user-plus" />
            </div>
          </StaggerItem>
          <StaggerItem>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Create an Account</h1>
          </StaggerItem>
          <StaggerItem>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Register to participate in elections</p>
          </StaggerItem>
        </Stagger>
        <form onSubmit={submit} className="card p-6 space-y-4">
          <FadeUp delay={0.15}>
            <ErrorMessage message={err} />
            <SuccessMessage message={ok} />
          </FadeUp>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="label" htmlFor="register-full-name">
                Full Name
              </label>
              <input id="register-full-name" name="full_name" className="input" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} placeholder="e.g. John Doe" />
            </div>
            <div>
              <label className="label" htmlFor="register-username">
                Username *
              </label>
              <input
                id="register-username"
                name="username"
                className="input"
                required
                minLength={3}
                maxLength={30}
                pattern="[A-Za-z0-9_]+"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                placeholder="3-30 chars, letters/numbers/_"
              />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="register-email">
              Email Address *
            </label>
            <input
              id="register-email"
              name="email"
              className="input"
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label className="label" htmlFor="register-matric-no">
              Matric Number
            </label>
            <input
              id="register-matric-no"
              name="matric_no"
              className="input"
              value={form.matric_no}
              onChange={(e) => setForm({ ...form, matric_no: e.target.value })}
              placeholder="e.g. NCS/2024/1234"
            />
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="label" htmlFor="register-password">
                Password *
              </label>
              <input
                id="register-password"
                name="password"
                className="input"
                type="password"
                required
                minLength={8}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="8+ chars, upper/lower/digit"
              />
            </div>
            <div>
              <label className="label" htmlFor="register-confirm-password">
                Confirm Password *
              </label>
              <input id="register-confirm-password" name="confirm_password" className="input" type="password" required minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </div>
          </div>
          <p className="text-xs text-slate-400">Password must be at least 8 characters and contain uppercase, lowercase and a number.</p>
          <Recaptcha siteKey={bootstrap.recaptcha_site_key} enabled={bootstrap.recaptcha_enabled} onChange={setCaptchaToken} />
          <button className="btn-primary w-full" disabled={busy}>
            {busy ? (
              <>
                <span className="animate-spin">
                  <i className="fas fa-circle-notch" />
                </span>{' '}
                Creating account...
              </>
            ) : (
              <>
                <i className="fas fa-user-plus" /> Register
              </>
            )}
          </button>
        </form>
        <p className="text-center text-sm text-slate-500 dark:text-slate-400 mt-6">
          Already have an account?{' '}
          <Link to="/login" className="text-primary-600 dark:text-primary-400 font-semibold hover:underline">
            Login
          </Link>
        </p>
      </div>
    </PageTransition>
  );
}
