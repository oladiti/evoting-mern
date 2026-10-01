import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Recaptcha from '../components/ui/Recaptcha';
import { ErrorMessage, SuccessMessage } from '../components/ui/guards';
import { api } from '../lib/api';
import { loadPublicBootstrap } from '../lib/format';
import { PageTransition, Stagger, StaggerItem, FadeUp } from '../components/ui/motion';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaEnabled, setCaptchaEnabled] = useState(false);
  const [siteKey, setSiteKey] = useState(null);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    loadPublicBootstrap().then((b) => {
      setCaptchaEnabled(b.recaptcha_enabled);
      setSiteKey(b.recaptcha_site_key);
    });
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    setOk('');
    setBusy(true);
    try {
      const res = await api.post('/api/auth/forgot-password', {
        email,
        'g-recaptcha-response': captchaToken || undefined,
      });
      setOk(res.message);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageTransition className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-warning-500 flex items-center justify-center text-white text-2xl mb-4">
            <i className="fas fa-key" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Forgot Password</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">We'll email you a secure link to reset your password.</p>
        </div>
        <form onSubmit={submit} className="card p-6 space-y-4">
          <FadeUp delay={0.15}>
            <ErrorMessage message={err} />
            <SuccessMessage message={ok} />
          </FadeUp>
          <div>
            <label className="label" htmlFor="forgot-password-email">
              Email Address
            </label>
            <input id="forgot-password-email" name="email" className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          </div>
          <Recaptcha siteKey={siteKey} enabled={captchaEnabled} onChange={setCaptchaToken} />
          <button className="btn-primary w-full" disabled={busy}>
            {busy ? (
              'Sending link...'
            ) : (
              <>
                <i className="fas fa-paper-plane" /> Send Reset Link
              </>
            )}
          </button>
        </form>
        <p className="text-center text-sm text-slate-500 dark:text-slate-400 mt-6">
          Remembered it?{' '}
          <Link to="/login" className="text-primary-600 dark:text-primary-400 font-semibold hover:underline">
            Back to login
          </Link>
        </p>
      </div>
    </PageTransition>
  );
}
