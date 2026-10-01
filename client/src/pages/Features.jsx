import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { FadeUp, FadeIn } from '../components/ui/motion';

// These two used to live in a separate `category` array that nothing rendered,
// so the copy was written and then silently dropped from the page. Folded into
// the one list that is actually mapped.
const data = [
  { icon: 'fa-user-shield', title: 'Secure Identity', text: 'Every vote is protected by email verification, optional face authentication and strict accreditation.' },
  { icon: 'fa-robot', title: 'Smart Notifications', text: 'Automated emails keep you posted about accreditation status, voting windows and results.' },
  { icon: 'fa-users', title: 'Accreditation', text: 'Admins approve eligible voters before each election, keeping the roll accurate and trusted.' },
  { icon: 'fa-shield-halved', title: 'Face Verification', text: 'Optional one-time face enrollment that makes casting a ballot quick and spoof-resistant.' },
  { icon: 'fa-chart-line', title: 'Live Results', text: 'Tallies update in real time once an election closes, with clear per-candidate breakdowns.' },
  { icon: 'fa-list-check', title: 'Smart Ballots', text: 'One vote per eligible voter, enforced server-side. No duplicates, no double counting.' },
  { icon: 'fa-envelope-open-text', title: 'Secure Logging', text: 'Every significant action is recorded on an audit trail that only administrators can review.' },
];

const dashboardData = [
  { icon: 'fa-gauge-high', title: 'Real-time Overview', text: 'See election status, accreditation counts and voter activity at a glance.' },
  { icon: 'fa-calendar-check', title: 'Election Scheduling', text: 'Set start/end dates, open ballots on time, and let results publish automatically.' },
  { icon: 'fa-id-badge', title: 'Voter Management', text: 'Approve accreditations and manage the eligible voter roll in a few clicks.' },
  { icon: 'fa-envelope-open-text', title: 'Contact Inbox', text: 'Read and respond to voter questions from a dedicated admin inbox.' },
  { icon: 'fa-sliders', title: 'Platform Settings', text: 'Toggle face verification, voter registration and more without touching code.' },
];

export default function Features() {
  const { user } = useAuth();
  const dashboardPath = user?.is_admin ? '/admin' : '/dashboard';

  const ctas = user ? (
    <Link to={dashboardPath} className="btn-primary">
      <i className="fas fa-tachometer-alt mr-2" /> Go to Dashboard
    </Link>
  ) : (
    <>
      <Link to="/register" className="btn-primary">
        <i className="fas fa-user-plus mr-2" /> Get Started
      </Link>
      <Link to="/login" className="btn-outline">
        <i className="fas fa-sign-in-alt mr-2" /> Login
      </Link>
    </>
  );

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
      <FadeUp className="text-center mb-14">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-brand-gradient flex items-center justify-center text-white text-3xl mb-4">
          <i className="fas fa-layer-group" />
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold text-slate-800 dark:text-slate-100">Features</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-3 max-w-2xl mx-auto">Everything you need to run trustworthy, transparent elections end to end.</p>
        <div className="mt-6 flex items-center justify-center gap-3">{ctas}</div>
      </FadeUp>

      <FadeIn>
        <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-6">Core Features</h2>
      </FadeIn>
      <div className="grid sm:grid-cols-2 gap-4 mb-14">
        {data.map((f) => (
          <FadeUp key={f.title} className="card p-6 flex gap-4">
            <div className="w-12 h-12 shrink-0 rounded-xl bg-primary-500/15 text-primary-600 dark:text-primary-400 flex items-center justify-center text-xl">
              <i className={`fas ${f.icon}`} />
            </div>
            <div>
              <h3 className="font-semibold text-slate-800 dark:text-slate-100">{f.title}</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">{f.text}</p>
            </div>
          </FadeUp>
        ))}
      </div>

      <FadeIn>
        <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-6">For Your Campus</h2>
      </FadeIn>
      <div className="grid sm:grid-cols-2 gap-4 mb-14">
        {dashboardData.map((f) => (
          <FadeUp
            key={f.title}
            className="card p-6 flex gap-4 border border-primary-100 dark:border-primary-900/30 bg-gradient-to-br from-primary-50 to-slate-50 dark:from-slate-900 dark:to-slate-900"
          >
            <div className="w-12 h-12 shrink-0 rounded-xl bg-secondary-500/15 text-secondary-600 dark:text-secondary-400 flex items-center justify-center text-xl">
              <i className={`fas ${f.icon}`} />
            </div>
            <div>
              <h3 className="font-semibold text-slate-800 dark:text-slate-100">{f.title}</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">{f.text}</p>
            </div>
          </FadeUp>
        ))}
      </div>

      <FadeUp>
        <div className="relative overflow-hidden card p-10 sm:p-12 mt-16 bg-brand-gradient border-0 text-white text-center">
          <div className="pointer-events-none absolute -top-20 -right-20 w-64 h-64 rounded-full bg-white/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -left-16 w-72 h-72 rounded-full bg-secondary-500/25 blur-3xl" />
          <div className="relative">
            <h2 className="text-2xl sm:text-3xl font-extrabold">Ready to make your voice count?</h2>
            <p className="mt-3 max-w-xl mx-auto text-white/80">Register once, get accredited, and vote in seconds — securely and transparently.</p>
            <div className="mt-7 flex flex-wrap justify-center gap-4">
              {user ? (
                <Link to={dashboardPath} className="btn bg-white text-primary-700 hover:bg-primary-50 shadow-lg shadow-black/20">
                  <i className="fas fa-tachometer-alt mr-2" /> Go to Dashboard
                </Link>
              ) : (
                <>
                  <Link to="/register" className="btn bg-white text-primary-700 hover:bg-primary-50 shadow-lg shadow-black/20">
                    <i className="fas fa-user-plus mr-2" /> Register to Vote
                  </Link>
                  <Link to="/login" className="btn border-2 border-white/40 text-white hover:bg-white/10">
                    <i className="fas fa-sign-in-alt mr-2" /> Login
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </FadeUp>
    </div>
  );
}
