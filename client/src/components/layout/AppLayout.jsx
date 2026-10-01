import { motion } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { AnimatedOutlet } from '../ui/motion';
import { Hamburger, MobileDrawer, NavRow, NavSection, useMobileDrawer, itemVariants } from '../ui/MobileNav';

const DRAWER_ID = 'app-drawer';

const NAV_SECTIONS = [
  {
    label: 'Overview',
    links: [{ to: '/dashboard', icon: 'fa-tachometer-alt', label: 'Dashboard', hint: 'Elections & stats' }],
  },
  {
    label: 'Voting',
    links: [
      { to: '/results', icon: 'fa-chart-bar', label: 'Results', hint: 'Live tallies' },
      { to: '/face-verify', icon: 'fa-user-check', label: 'Face Verify', hint: 'Confirm identity' },
      { to: '/face-enroll', icon: 'fa-id-card', label: 'Face Enroll', hint: 'Set up biometrics' },
    ],
  },
  {
    label: 'Support',
    links: [{ to: '/help', icon: 'fa-question-circle', label: 'Help', hint: 'FAQs & guides' }],
  },
];

function SidebarNav({ onNavigate }) {
  return (
    <nav className="flex-1 overflow-y-auto overscroll-contain px-3 py-4 space-y-5">
      {NAV_SECTIONS.map((section) => (
        <NavSection key={section.label} label={section.label}>
          {section.links.map((l) => (
            <motion.li key={l.to} variants={itemVariants}>
              <NavRow {...l} onNavigate={onNavigate} />
            </motion.li>
          ))}
        </NavSection>
      ))}
    </nav>
  );
}

function SidebarFooter({ onNavigate }) {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();

  const handleLogout = async () => {
    onNavigate?.();
    await logout();
    navigate('/login');
  };

  return (
    <div className="p-3 space-y-2">
      <div className="flex items-center gap-3 px-2 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/60">
        <span className="w-9 h-9 shrink-0 rounded-full bg-brand-gradient text-white grid place-items-center font-bold text-sm">
          {(user?.full_name || user?.username || '?').charAt(0).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-slate-800 dark:text-white truncate">{user?.full_name || user?.username}</span>
          <span className="block text-[11px] text-slate-500 dark:text-slate-400 truncate">{user?.is_admin ? 'Administrator' : 'Registered voter'}</span>
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={toggle}
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
          className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-[0.98] transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
        >
          <i className={`fas ${theme === 'dark' ? 'fa-sun' : 'fa-moon'}`} />
          {theme === 'dark' ? 'Light' : 'Dark'}
        </button>
        <button
          type="button"
          onClick={handleLogout}
          className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium bg-danger-50 dark:bg-danger-900/20 text-danger-600 dark:text-danger-400 hover:bg-danger-100 dark:hover:bg-danger-900/40 active:scale-[0.98] transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-danger-500"
        >
          <i className="fas fa-sign-out-alt" />
          Logout
        </button>
      </div>
    </div>
  );
}

function BrandMark() {
  return (
    <div className="flex items-center gap-3 px-5 h-16 border-b border-slate-200 dark:border-slate-700">
      <span className="w-9 h-9 shrink-0 rounded-lg bg-brand-gradient grid place-items-center text-white">
        <i className="fas fa-vote-yea text-sm" />
      </span>
      <span className="font-bold text-slate-800 dark:text-white truncate">E-voting System</span>
    </div>
  );
}

export default function AppLayout() {
  const { user } = useAuth();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const drawer = useMobileDrawer({ breakpoint: 'md' });

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-40 bg-white/90 dark:bg-slate-900/90 backdrop-blur border-b border-slate-200 dark:border-slate-700 h-16 flex items-center px-4 justify-between gap-3">
        <Link to="/dashboard" className="flex items-center gap-2 font-bold text-slate-800 dark:text-white min-w-0">
          <span className="w-9 h-9 shrink-0 rounded-lg bg-brand-gradient flex items-center justify-center text-white">
            <i className="fas fa-vote-yea text-sm" />
          </span>
          <span className="truncate">E-voting System</span>
        </Link>

        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <div className="hidden sm:flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            <i className="fas fa-user-circle text-xl text-primary-600" />
            <span className="font-medium max-w-[10rem] truncate">{user?.full_name || user?.username}</span>
          </div>
          <button
            type="button"
            onClick={toggle}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
            className="w-10 h-10 shrink-0 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-95 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
          >
            <i className={`fas ${theme === 'dark' ? 'fa-sun' : 'fa-moon'}`} />
          </button>
          <button type="button" onClick={() => navigate(user?.is_admin ? '/admin' : '/dashboard')} className="btn-secondary hidden lg:inline-flex">
            {user?.is_admin ? 'Admin Panel' : 'My Dashboard'}
          </button>
          <Hamburger state={drawer} controls={DRAWER_ID} className="md:hidden" />
        </div>
      </header>

      <div className="flex flex-1" inert={drawer.drawerOpen ? '' : undefined}>
        <aside className="hidden md:flex fixed top-0 left-0 h-screen w-64 flex-col bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-700">
          <BrandMark />
          <SidebarNav />
          <div className="border-t border-slate-200 dark:border-slate-700">
            <SidebarFooter />
          </div>
        </aside>

        <main className="flex-1 min-w-0 md:ml-64 px-4 py-6 sm:px-6 lg:px-8">
          <AnimatedOutlet />
        </main>
      </div>
      <MobileDrawer state={drawer} id={DRAWER_ID} title="E-voting System" icon="fa-vote-yea" className="md:hidden" footer={<SidebarFooter onNavigate={drawer.close} />}>
        <SidebarNav onNavigate={drawer.close} />
      </MobileDrawer>
    </div>
  );
}
