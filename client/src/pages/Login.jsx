import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import Recaptcha from '../components/ui/Recaptcha';
import { ErrorMessage } from '../components/ui/guards';
import { loadPublicBootstrap } from '../lib/format';
import { useEffect } from 'react';
import { PageTransition, FadeUp, Stagger, StaggerItem } from '../components/ui/motion';

export default function Login() {
  const { login } = useAuth();
  const { error: toastError } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ username: '', password: '', remember: false });
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaEnabled, setCaptchaEnabled] = useState(false);
  const [siteKey, setSiteKey] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (location.state?.sessionExpired) {
      setErr('Your session expired. Please log in again.');
      window.history.replaceState({}, document.title);
    }
    loadPublicBootstrap().then((b) => {
      setCaptchaEnabled(b.recaptcha_enabled);
      setSiteKey(b.recaptcha_site_key);
    });
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      const data = await login({
        username: form.username,
        password: form.password,
        remember: form.remember,
        'g-recaptcha-response': captchaToken || undefined,
      });
      navigate(data.user?.is_admin ? '/admin' : '/dashboard');
    } catch (e) {
      if (e.data?.needsVerification) {
        toastError(e.message);
        navigate(`/verify-email?email=${encodeURIComponent(e.data.email)}`);
        return;
      }
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageTransition className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <Stagger className="text-center mb-8" amount={0.12}>
          <StaggerItem>
            <div className="w-14 h-14 mx-auto rounded-2xl bg-brand-gradient flex items-center justify-center text-white text-2xl mb-4">
              <i className="fas fa-vote-yea" />
            </div>
          </StaggerItem>
          <StaggerItem>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Welcome Back</h1>
          </StaggerItem>
          <StaggerItem>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Log in to vote securely</p>
          </StaggerItem>
        </Stagger>
        <form onSubmit={submit} className="card p-6 space-y-4">
          <FadeUp delay={0.15}>
            <ErrorMessage message={err} />
          </FadeUp>
          <div>
            <label className="label" htmlFor="login-username">
              Username
            </label>
            <input id="login-username" name="username" className="input" autoFocus required value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="login-password">
              Password
            </label>
            <input id="login-password" name="password" className="input" type="password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </div>
          <div className="flex items-center justify-between text-sm">
            <label className="flex items-center gap-2 cursor-pointer text-slate-600 dark:text-slate-300" htmlFor="login-remember">
              <input id="login-remember" name="remember" type="checkbox" className="rounded" checked={form.remember} onChange={(e) => setForm({ ...form, remember: e.target.checked })} />
              Remember me
            </label>
            <Link to="/forgot-password" className="text-primary-600 dark:text-primary-400 hover:underline">
              Forgot password?
            </Link>
          </div>
          <Recaptcha siteKey={siteKey} enabled={captchaEnabled} onChange={setCaptchaToken} />
          <button className="btn-primary w-full" disabled={busy}>
            {busy ? (
              <>
                <span className="animate-spin">
                  <i className="fas fa-circle-notch" />
                </span>{' '}
                Logging in...
              </>
            ) : (
              <>
                <i className="fas fa-sign-in-alt" /> Login
              </>
            )}
          </button>
        </form>
        <p className="text-center text-sm text-slate-500 dark:text-slate-400 mt-6">
          Don't have an account?{' '}
          <Link to="/register" className="text-primary-600 dark:text-primary-400 font-semibold hover:underline">
            Register here
          </Link>
        </p>
        <p className="text-center mt-4">
          <Link to="/" className="text-sm text-slate-400 hover:text-primary-600">
            <i className="fas fa-arrow-left mr-1" /> Back to home
          </Link>
        </p>
      </div>
    </PageTransition>
  );
}
