import { motion } from 'framer-motion';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { AnimatedOutlet } from '../ui/motion';
import { Hamburger, MobileDrawer, NavRow, NavSection, itemVariants, useMobileDrawer } from '../ui/MobileNav';

const DRAWER_ID = 'public-drawer';

const MAIN_LINKS = [
  { to: '/', label: 'Home', hint: 'Back to top', icon: 'fa-home', end: true },
  { to: '/help', label: 'Help', hint: 'FAQs & guides', icon: 'fa-circle-question' },
];

const EXTRA_LINKS = [
  { to: '/features', label: 'Features', hint: 'What we offer', icon: 'fa-star' },
  { to: '/contact', label: 'Contact', hint: 'Reach the team', icon: 'fa-envelope' },
];

function initialsOf(name = '') {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');
}

function NavBar({ drawer }) {
  const { user } = useAuth();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();

  const go = (to) => {
    drawer.close();
    navigate(to);
  };
  const dashboardPath = user?.is_admin ? '/admin' : '/dashboard';
  const displayName = user?.full_name || user?.username || '';

  const desktopLink = ({ isActive }) =>
    `nav-link text-sm font-medium rounded-md px-2 py-1.5 transition ${
      isActive ? 'text-primary-600 dark:text-primary-400' : 'text-slate-600 dark:text-slate-300 hover:text-primary-600 dark:hover:text-primary-400'
    }`;

  const iconBtn =
    'w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-primary-600 dark:hover:text-primary-400 transition focus:outline-none focus:ring-2 focus:ring-primary-500/50';

  return (
    <header className="sticky top-0 z-40 bg-white/90 dark:bg-slate-900/90 backdrop-blur border-b border-slate-200 dark:border-slate-700">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Link to="/" className="w-10 h-10 shrink-0 rounded-xl bg-brand-gradient flex items-center justify-center text-white text-lg hover:shadow-lg hover:shadow-primary-600/30 transition">
            <i className="fas fa-vote-yea" />
          </Link>
          <div className="min-w-0">
            <Link to="/" className="font-bold text-slate-800 dark:text-white leading-tight truncate">
              E-Voting System
            </Link>
            <div className="text-xs text-slate-400 -mt-0.5 hidden sm:block truncate">Secure Campus Elections</div>
          </div>
        </div>

        <nav className="hidden md:flex items-center gap-1">
          {MAIN_LINKS.map((l) => (
            <NavLink key={l.label} to={l.to} end className={desktopLink}>
              {l.label}
            </NavLink>
          ))}
          {EXTRA_LINKS.map((l) => (
            <NavLink key={l.label} to={l.to} className={desktopLink}>
              {l.label}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <button onClick={toggle} className={iconBtn} aria-label="Toggle theme">
            <i className={`fas ${theme === 'dark' ? 'fa-sun' : 'fa-moon'}`} />
          </button>

          {user ? (
            <button
              onClick={() => go(dashboardPath)}
              className="hidden md:flex items-center gap-2.5 text-left rounded-xl px-2 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 transition group"
              aria-label="Open dashboard"
            >
              <span className="w-9 h-9 rounded-full bg-brand-gradient text-white flex items-center justify-center text-sm font-bold shrink-0">
                {initialsOf(displayName) || <i className="fas fa-vote-yea text-xs" />}
              </span>
              <span className="hidden lg:block max-w-[9rem]">
                <span className="block text-[11px] text-slate-400 leading-tight group-hover:text-primary-600 dark:group-hover:text-primary-400">Welcome back</span>
                <span className="block font-semibold text-slate-700 dark:text-slate-200 leading-tight truncate">{displayName}</span>
              </span>
            </button>
          ) : (
            <div className="hidden md:flex items-center gap-2">
              <Link to="/login" className="btn-outline !px-4">
                <i className="fas fa-sign-in-alt" /> Login
              </Link>
              <Link to="/register" className="btn-primary !px-4">
                Register
              </Link>
            </div>
          )}

          <Hamburger state={drawer} controls={DRAWER_ID} className="md:hidden" />
        </div>
      </div>
    </header>
  );
}

function DrawerContent({ drawer }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { close } = drawer;
  const dashboardPath = user?.is_admin ? '/admin' : '/dashboard';
  const displayName = user?.full_name || user?.username || '';

  const sections = [
    { label: 'Explore', links: MAIN_LINKS },
    { label: 'More', links: EXTRA_LINKS },
  ];

  return (
    <>
      {user && (
        <motion.div variants={itemVariants} className="mx-3 mt-4 flex items-center gap-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-4 py-3">
          <span className="w-11 h-11 rounded-full bg-brand-gradient text-white flex items-center justify-center font-bold shrink-0">
            {initialsOf(displayName) || <i className="fas fa-vote-yea text-xs" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-800 dark:text-white truncate">{displayName}</p>
            <p className="text-xs text-slate-400">{user?.is_admin ? 'Administrator' : 'Voter'}</p>
          </div>
          <span className="badge bg-primary-500/15 text-primary-700 dark:text-primary-400">{user?.is_admin ? 'Admin' : 'Verified'}</span>
        </motion.div>
      )}

      <nav className="flex-1 overflow-y-auto overscroll-contain px-3 py-4 space-y-5">
        {sections.map((section) => (
          <NavSection key={section.label} label={section.label}>
            {section.links.map((l) => (
              <motion.li key={l.to} variants={itemVariants}>
                <NavRow {...l} onNavigate={close} />
              </motion.li>
            ))}
          </NavSection>
        ))}
      </nav>

      <div className="p-3 space-y-2">
        {user ? (
          <>
            <button
              onClick={() => {
                close();
                navigate(dashboardPath);
              }}
              className="w-full btn-primary"
            >
              <i className="fas fa-tachometer-alt" /> {user.is_admin ? 'Admin Panel' : 'Dashboard'}
            </button>
            <button
              onClick={async () => {
                close();
                await logout();
                navigate('/');
              }}
              className="w-full btn-outline !border-danger-500/40 !text-danger-600 dark:!text-danger-400 hover:!bg-danger-50 dark:hover:!bg-danger-900/20"
            >
              <i className="fas fa-sign-out-alt" /> Logout
            </button>
          </>
        ) : (
          <>
            <Link to="/login" onClick={close} className="w-full btn-outline">
              <i className="fas fa-sign-in-alt" /> Login
            </Link>
            <Link to="/register" onClick={close} className="w-full btn-primary">
              Register to Vote
            </Link>
          </>
        )}
      </div>
    </>
  );
}

function Footer() {
  const { user } = useAuth();

  const quickLinks = [
    { to: '/', icon: 'fa-home', label: 'Home' },
    { to: '/features', icon: 'fa-star', label: 'Features' },
    { to: '/help', icon: 'fa-circle-question', label: 'How It Works' },
    { to: '/results', icon: 'fa-chart-bar', label: 'Results' },
    { to: '/contact', icon: 'fa-envelope', label: 'Contact' },
  ];

  return (
    <footer className="bg-slate-900 dark:bg-slate-950 text-slate-300">
      <div className="h-1 bg-gradient-to-r from-primary-600 via-secondary-500 to-accent-500" />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 grid sm:grid-cols-2 lg:grid-cols-3 gap-10 text-sm">
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-9 h-9 rounded-lg bg-brand-gradient flex items-center justify-center text-white">
              <i className="fas fa-vote-yea" />
            </div>
            <span className="font-bold text-white">E-Voting System</span>
          </div>
          <p className="text-slate-400 leading-relaxed">A secure platform for student body elections at OGITECH using email verification, accreditation and transparent vote counting.</p>
        </div>
        <div>
          <h4 className="font-semibold text-white mb-3">Quick Links</h4>
          <ul className="space-y-2.5 text-slate-400">
            {quickLinks.map((l) => (
              <li key={l.to + l.label}>
                <Link to={l.to} className="inline-flex items-center gap-2 hover:text-white transition">
                  <i className={`fas ${l.icon} w-4 text-center text-primary-400/70`} />
                  {l.label}
                </Link>
              </li>
            ))}
            {user && (
              <li>
                <Link to={user.is_admin ? '/admin' : '/dashboard'} className="inline-flex items-center gap-2 hover:text-white transition">
                  <i className="fas fa-tachometer-alt w-4 text-center text-primary-400/70" />
                  Dashboard
                </Link>
              </li>
            )}
          </ul>
        </div>
        <div>
          <h4 className="font-semibold text-white mb-3">Contact</h4>
          <ul className="space-y-2.5 text-slate-400">
            <li>
              <a href="mailto:oladitiabiodun86@gmail.com" className="inline-flex items-start gap-2 hover:text-white transition">
                <i className="fas fa-envelope mt-1 w-4 text-center" /> oladitiabiodun86@gmail.com
              </a>
            </li>
            <li>
              <span className="inline-flex items-start gap-2">
                <i className="fas fa-map-marker-alt mt-1 w-4 text-center" /> OGITECH, Ogun State, Nigeria
              </span>
            </li>
            <li>
              <span className="inline-flex items-start gap-2">
                <i className="fas fa-clock mt-1 w-4 text-center" /> Mon - Fri, 9:00 AM - 5:00 PM
              </span>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-slate-800 px-4 sm:px-6 lg:px-8 py-5">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
          <p>&copy; {new Date().getFullYear()} E-Voting System. All rights reserved.</p>
          <nav className="flex items-center gap-5">
            <Link to="/privacy" className="hover:text-white transition">
              Privacy Policy
            </Link>
            <Link to="/terms" className="hover:text-white transition">
              Terms & Copyright
            </Link>
            <Link to="/cookies" className="hover:text-white transition">
              Cookie Policy
            </Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}

export default function PublicLayout() {
  const drawer = useMobileDrawer({ breakpoint: 'md' });

  return (
    <div className="min-h-screen flex flex-col overflow-x-clip">
      <NavBar drawer={drawer} />
      <div className="flex flex-1 flex-col" inert={drawer.drawerOpen ? '' : undefined}>
        <main className="flex-1">
          <AnimatedOutlet />
        </main>
        <Footer />
      </div>
      <MobileDrawer state={drawer} id={DRAWER_ID} title="E-Voting System" icon="fa-vote-yea" className="md:hidden">
        <DrawerContent drawer={drawer} />
      </MobileDrawer>
    </div>
  );
}
