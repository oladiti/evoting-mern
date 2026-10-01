import { Link } from 'react-router-dom';

const destinations = [
  { to: '/help', icon: 'fa-circle-question', label: 'How It Works' },
  { to: '/features', icon: 'fa-star', label: 'Features' },
  { to: '/results', icon: 'fa-chart-bar', label: 'Results' },
  { to: '/contact', icon: 'fa-envelope', label: 'Contact Us' },
];

export default function NotFound() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center px-4 py-16">
      <div className="text-center max-w-lg">
        <div className="text-7xl sm:text-8xl font-black text-primary-600/30 dark:text-primary-400/20 mb-4 select-none">404</div>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Page Not Found</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-2">The page you're looking for doesn't exist or has moved.</p>
        <Link to="/" className="btn-primary mt-8">
          <i className="fas fa-home" /> Back to Home
        </Link>
        <div className="mt-12">
          <p className="text-xs uppercase tracking-widest text-slate-400 mb-4">You might be looking for</p>
          <div className="flex flex-wrap justify-center gap-2.5">
            {destinations.map((d) => (
              <Link
                key={d.to}
                to={d.to}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-300 hover:border-primary-500 hover:text-primary-600 dark:hover:text-primary-400 transition"
              >
                <i className={`fas ${d.icon} text-primary-500`} /> {d.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
