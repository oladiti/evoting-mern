import { useState, useRef, useCallback } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { ErrorMessage, SuccessMessage } from '../components/ui/guards';
import { PageTransition, Stagger, StaggerItem, FadeUp } from '../components/ui/motion';

export default function VerifyEmail() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const initialEmail = params.get('email') || '';
  // Carried over from registration: the code was generated but never emailed.
  const [deliveryFailed, setDeliveryFailed] = useState(params.get('sent') === '0');
  const [email, setEmail] = useState(initialEmail);
  const [digits, setDigits] = useState(Array(6).fill(''));
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const [busy, setBusy] = useState(false);
  const inputsRef = useRef([]);

  const setDigit = (i, value) => {
    const v = value.replace(/\D/g, '').slice(-1);
    const next = [...digits];
    next[i] = v;
    setDigits(next);
    if (v && i < 5) inputsRef.current[i + 1]?.focus();
  };

  const onPaste = (e) => {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (text.length === 6) setDigits(text.split(''));
  };

  const onKeyDown = (i, e) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) inputsRef.current[i - 1]?.focus();
  };

  const verify = useCallback(async () => {
    setErr('');
    setOk('');
    const code = digits.join('');
    if (code.length !== 6) {
      setErr('Please enter the 6-digit code.');
      return;
    }
    setBusy(true);
    try {
      await api.post('/api/auth/verify-email', { email, code });
      setOk('Email verified successfully!');
      setTimeout(() => navigate('/login'), 1600);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }, [digits, email, navigate]);

  const resend = async () => {
    setErr('');
    setOk('');
    try {
      await api.post('/api/auth/resend-verification', { email });
      setDeliveryFailed(false);
      setOk('A new code has been sent. Check your inbox and spam folder.');
    } catch (e) {
      // A 502 means the server regenerated the code but the mail server refused
      // it. Saying "sent" here is what left users waiting for an email that
      // was never going to arrive.
      if (e.status === 502 || e.data?.emailSent === false) {
        setDeliveryFailed(true);
        setErr(e.data?.mailError || e.message);
        return;
      }
      setErr(e.message);
    }
  };

  return (
    <PageTransition className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <Stagger className="text-center mb-8" amount={0.12}>
          <StaggerItem>
            <div className="w-14 h-14 mx-auto rounded-2xl bg-info-500 flex items-center justify-center text-white text-2xl mb-4">
              <i className="fas fa-envelope-open-text" />
            </div>
          </StaggerItem>
          <StaggerItem>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Verify Your Email</h1>
          </StaggerItem>
          <StaggerItem>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              {deliveryFailed ? (
                <>
                  A code was created for <span className="font-semibold">{email}</span>, but it could not be emailed.
                </>
              ) : (
                <>
                  Enter the 6-digit code sent to <span className="font-semibold">{email}</span>
                </>
              )}
            </p>
          </StaggerItem>
        </Stagger>
        <div className="card p-6 space-y-5">
          {deliveryFailed && (
            <div className="rounded-xl bg-warning-50 dark:bg-warning-900/20 p-4 flex items-start gap-3">
              <i className="fas fa-triangle-exclamation text-warning-500 mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">No email was sent</p>
                <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                  Your account was created and a code is waiting, but the mail server rejected the message, so no code is on its way. This is a server configuration fault, not your inbox. Try
                  resending once it is fixed, or ask an administrator to verify your email for you.
                </p>
              </div>
            </div>
          )}
          <div>
            <label className="label" htmlFor="verify-email">
              Email
            </label>
            <input id="verify-email" name="email" className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <ErrorMessage message={err} />
          <SuccessMessage message={ok} />
          <div onPaste={onPaste}>
            <label className="label text-center" htmlFor="verify-code-0">
              Verification Code
            </label>
            <div className="flex justify-center gap-2">
              {digits.map((d, i) => (
                <input
                  key={i}
                  id={`verify-code-${i}`}
                  name={`code-${i}`}
                  ref={(el) => (inputsRef.current[i] = el)}
                  className="input !w-12 !px-0 text-center text-xl font-bold"
                  inputMode="numeric"
                  maxLength={1}
                  value={d}
                  onChange={(e) => setDigit(i, e.target.value)}
                  onKeyDown={(e) => onKeyDown(i, e)}
                  autoFocus={i === 0}
                />
              ))}
            </div>
          </div>
          <button className="btn-primary w-full" onClick={verify} disabled={busy}>
            {busy ? (
              'Verifying...'
            ) : (
              <>
                <i className="fas fa-check-circle" /> Verify Email
              </>
            )}
          </button>
          <div className="text-center text-sm text-slate-500 dark:text-slate-400">
            {deliveryFailed ? 'Email not working yet?' : "Didn't get a code?"}{' '}
            <button onClick={resend} className="text-primary-600 dark:text-primary-400 font-semibold hover:underline">
              Resend code
            </button>
          </div>
          <div className="text-center">
            <Link to="/" className="text-sm text-slate-400 hover:text-primary-600">
              <i className="fas fa-arrow-left mr-1" /> Back to home
            </Link>
          </div>
        </div>
      </div>
    </PageTransition>
  );
}
