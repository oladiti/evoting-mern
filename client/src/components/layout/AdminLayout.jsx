import { motion } from 'framer-motion';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { AnimatedOutlet } from '../ui/motion';
import { Hamburger, MobileDrawer, NavRow, NavSection, useMobileDrawer, itemVariants } from '../ui/MobileNav';

const DRAWER_ID = 'admin-drawer';

const NAV_SECTIONS = [
  {
    label: 'Overview',
    links: [{ to: '/admin', icon: 'fa-tachometer-alt', label: 'Overview', end: true }],
  },
  {
    label: 'Manage',
    links: [
      { to: '/admin/analytics', icon: 'fa-chart-line', label: 'Analytics' },
      { to: '/admin/elections', icon: 'fa-poll', label: 'Elections & Candidates' },
      { to: '/admin/accredit', icon: 'fa-user-check', label: 'Accredit Voters' },
      { to: '/admin/logs', icon: 'fa-clipboard-list', label: 'Activity Logs' },
      { to: '/admin/contacts', icon: 'fa-envelope', label: 'Messages' },
      { to: '/admin/settings', icon: 'fa-cog', label: 'Settings' },
    ],
  },
  {
    label: 'Public',
    links: [{ to: '/results', icon: 'fa-chart-bar', label: 'Results' }],
  },
];

const FLAT_LINKS = NAV_SECTIONS.flatMap((s) => s.links);

function AdminBrand() {
  const { user } = useAuth();
  return (
    <div className="h-16 flex items-center gap-3 px-5 border-b border-slate-800">
      <span className="w-9 h-9 shrink-0 rounded-lg bg-brand-gradient flex items-center justify-center text-white">
        <i className="fas fa-shield-halved text-sm" />
      </span>
      <div className="min-w-0">
        <div className="font-bold text-white text-sm leading-tight">Admin Panel</div>
        <div className="text-[11px] text-slate-500 truncate max-w-[10rem]">{user?.full_name || user?.username}</div>
      </div>
    </div>
  );
}

function AdminSignOut({ onNavigate, className = '' }) {
  const { logout } = useAuth();
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={async () => {
        onNavigate?.();
        await logout();
        navigate('/login');
      }}
      className={className}
    >
      <i className="fas fa-sign-out-alt w-5 text-center" /> Logout
    </button>
  );
}

function BackToSite({ onNavigate, className = '' }) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => {
        onNavigate?.();
        navigate('/dashboard');
      }}
      className={className}
    >
      <i className="fas fa-arrow-left w-5 text-center" /> Back to site
    </button>
  );
}

const darkItem = 'w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium text-slate-400 hover:bg-slate-800 hover:text-slate-200 text-left transition';

function DesktopSidebar() {
  return (
    <aside className="hidden lg:flex fixed top-0 left-0 h-screen w-64 flex-col bg-slate-900 dark:bg-slate-950 text-slate-300">
      <AdminBrand />
      <nav className="flex-1 overflow-y-auto overscroll-contain px-3 py-4 space-y-1">
        {FLAT_LINKS.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            end={l.end}
            className={({ isActive }) => `flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition ${isActive ? 'bg-primary-600/20 text-primary-400' : darkItem}`}
          >
            <i className={`fas ${l.icon} w-5 text-center`} />
            {l.label}
          </NavLink>
        ))}
      </nav>
      <div className="p-3 border-t border-slate-800">
        <BackToSite className={`${darkItem} mb-2`} />
        <AdminSignOut className={darkItem} />
      </div>
    </aside>
  );
}

function MobileSidebarNav({ onNavigate }) {
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

export default function AdminLayout() {
  const drawer = useMobileDrawer({ breakpoint: 'lg' });

  return (
    <div className="min-h-screen flex flex-col overflow-x-clip">
      <header className="lg:hidden sticky top-0 z-40 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 h-16 flex items-center px-4 gap-3">
        <span className="flex items-center gap-2 font-bold text-slate-800 dark:text-white min-w-0">
          <i className="fas fa-shield-halved text-primary-600 shrink-0" />
          <span className="truncate">Admin Panel</span>
        </span>
        <Hamburger state={drawer} controls={DRAWER_ID} className="ml-auto" />
      </header>

      <div className="flex-1 min-w-0 flex flex-col lg:pl-64" inert={drawer.drawerOpen ? '' : undefined}>
        <DesktopSidebar />
        <main className="flex-1 min-w-0 bg-slate-50 dark:bg-slate-900 p-4 sm:p-6 lg:p-8">
          <AnimatedOutlet />
        </main>
      </div>

      <MobileDrawer
        state={drawer}
        id={DRAWER_ID}
        title="Admin Panel"
        icon="fa-shield-halved"
        className="lg:hidden"
        footer={
          <div className="p-3 space-y-2">
            <AdminSignOut
              onNavigate={drawer.close}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-danger-50 dark:bg-danger-900/20 text-danger-600 dark:text-danger-400 hover:bg-danger-100 dark:hover:bg-danger-900/40 active:scale-[0.98] transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-danger-500"
            />
          </div>
        }
      >
        <MobileSidebarNav onNavigate={drawer.close} />
      </MobileDrawer>
    </div>
  );
}
