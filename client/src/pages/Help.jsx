import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { FadeUp, Stagger, StaggerItem } from '../components/ui/motion';

const steps = [
  { icon: 'fa-user-plus', title: '1. Register', text: 'Create an account with your details and verify your email with the 6-digit code we send you.' },
  { icon: 'fa-user-check', title: '2. Get Accredited', text: 'An election administrator approves eligible voters for each election.' },
  { icon: 'fa-face-smile', title: '3. Verify (one-time)', text: 'If enabled, enroll and verify your face once so future elections are effortless.' },
  { icon: 'fa-vote-yea', title: '4. Vote', text: 'On voting day, stay within the campus area, open the ballot, pick your candidates and submit.' },
  { icon: 'fa-chart-line', title: '5. See Results', text: 'Watch live tallies on the results page once the election ends.' },
];

const issues = [
  ['fa-key', 'Forgot my password', 'Click "Forgot password?" on the login page and follow the email link.'],
  ['fa-envelope', "Didn't get my verification email", 'Check your spam folder, or use the "resend code" button on the verify page.'],
  ['fa-lock', 'Locked out after too many attempts', 'Wait for the lockout to expire (up to 2 hours) before trying again.'],
  ['fa-camera', 'Camera not working for face verification', 'Use a modern browser (Chrome/Edge/Firefox) and allow camera permissions.'],
  ['fa-location', 'Location error while voting', 'Enable device location and stay within the university premises. Ensure you are not on airplane mode.'],
  ['fa-exclamation', 'Account not accredited', 'Contact the election administrator — accreditation is done by admins.'],
];

export default function Help() {
  const { user } = useAuth();
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12">
      <FadeUp className="text-center mb-12">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-brand-gradient flex items-center justify-center text-white text-3xl mb-4">
          <i className="fas fa-circle-question" />
        </div>
        <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100">How It Works</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-2">Everything you need to know about voting on this platform.</p>
      </FadeUp>

      <Stagger className="relative space-y-5 mb-16" amount={0.1}>
        <div className="absolute left-6 top-4 bottom-4 w-0.5 rounded bg-gradient-to-b from-primary-500/50 via-secondary-500/40 to-success-500/50" />
        {steps.map((s, i) => (
          <StaggerItem key={s.title} className="relative flex gap-5">
            <div className="w-12 h-12 shrink-0 rounded-full bg-brand-gradient text-white flex items-center justify-center font-bold shadow-md shadow-primary-600/25 z-10">{i + 1}</div>
            <div className="card flex-1 p-5 flex flex-col sm:flex-row sm:items-start gap-3">
              <div className="w-11 h-11 shrink-0 rounded-xl bg-primary-500/15 text-primary-600 dark:text-primary-400 flex items-center justify-center text-lg">
                <i className={`fas ${s.icon}`} />
              </div>
              <div>
                <h3 className="font-bold text-slate-800 dark:text-slate-100">{s.title}</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">{s.text}</p>
              </div>
            </div>
          </StaggerItem>
        ))}
      </Stagger>

      <FadeUp>
        <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-6">Troubleshooting</h2>
      </FadeUp>
      <Stagger className="grid sm:grid-cols-2 gap-4" amount={0.08}>
        {issues.map(([icon, q, a]) => (
          <StaggerItem key={q} className="card p-5">
            <div className="flex items-center gap-3 mb-2">
              <i className={`fas ${icon} text-secondary-500`} />
              <h3 className="font-semibold text-slate-800 dark:text-slate-100 text-sm">{q}</h3>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400">{a}</p>
          </StaggerItem>
        ))}
      </Stagger>

      <FadeUp className="mt-12 text-center">
        <p className="text-slate-500 dark:text-slate-400 mb-4">Still stuck? Our team is happy to help.</p>
        {user ? (
          <Link to="/dashboard" className="btn-primary">
            <i className="fas fa-home mr-2" /> Back to Dashboard
          </Link>
        ) : (
          <div className="space-x-3">
            <Link to="/register" className="btn-primary">
              <i className="fas fa-user-plus" /> Register
            </Link>
            <Link to="/login" className="btn-outline">
              <i className="fas fa-sign-in-alt" /> Login
            </Link>
          </div>
        )}
      </FadeUp>
    </div>
  );
}
