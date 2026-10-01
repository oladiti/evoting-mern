import { motion, useReducedMotion } from 'framer-motion';
import { useCallback, useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const BREAKPOINTS = { sm: 640, md: 768, lg: 1024, xl: 1280 };
// The panel is anchored to the right edge (`right-0`), so the closed state has to
// push it further RIGHT by more than its own width to clear the viewport. A fixed
// pixel offset only cleared the screen while the viewport was wider than
// width + offset, so on anything narrower the closed drawer stayed on screen with
// its close button showing. A percentage resolves against the panel's own width,
// which also honours `max-w-[85vw]` on small phones.
const DRAWER_HIDDEN_X = '110%';
const SWIPE_CLOSE_DISTANCE = 72;
const SWIPE_CLOSE_VELOCITY = 420;

export const listVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05, delayChildren: 0.05 } },
};

export const itemVariants = {
  hidden: { opacity: 0, x: 20 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.32, ease: [0.22, 1, 0.36, 1] } },
};

function useBodyScrollLock(locked) {
  useEffect(() => {
    if (!locked) return undefined;
    const { body } = document;
    const prevOverflow = body.style.overflow;
    const prevPaddingRight = body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) body.style.paddingRight = `${scrollbarWidth}px`;
    return () => {
      body.style.overflow = prevOverflow;
      body.style.paddingRight = prevPaddingRight;
    };
  }, [locked]);
}

function useFocusTrap(containerRef, active) {
  useEffect(() => {
    if (!active) return undefined;
    const node = containerRef.current;
    if (!node) return undefined;

    const onKeyDown = (e) => {
      if (e.key !== 'Tab') return;
      const items = Array.from(node.querySelectorAll(FOCUSABLE)).filter((el) => el.offsetWidth > 0 || el.offsetHeight > 0);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    node.addEventListener('keydown', onKeyDown);
    return () => node.removeEventListener('keydown', onKeyDown);
  }, [containerRef, active]);
}

export function useMobileDrawer({ breakpoint = 'md' } = {}) {
  const query = `(min-width: ${BREAKPOINTS[breakpoint] || BREAKPOINTS.md})`;
  const reduceMotion = useReducedMotion();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);

  const panelRef = useRef(null);
  const closeBtnRef = useRef(null);
  const toggleRef = useRef(null);
  const wasOpen = useRef(false);

  const close = useCallback(() => setOpen(false), []);
  const toggle = useCallback(() => setOpen((o) => !o), []);

  useEffect(() => {
    const mq = window.matchMedia(query);
    const handleChange = (e) => {
      setIsDesktop(e.matches);
      if (e.matches) close();
    };
    setIsDesktop(mq.matches);
    if (mq.matches) close();
    mq.addEventListener('change', handleChange);
    return () => mq.removeEventListener('change', handleChange);
  }, [query, close]);

  const drawerOpen = open && !isDesktop;

  useBodyScrollLock(drawerOpen);
  useFocusTrap(panelRef, drawerOpen);

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!drawerOpen) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [drawerOpen, close]);

  useEffect(() => {
    if (drawerOpen) closeBtnRef.current?.focus();
  }, [drawerOpen]);

  useEffect(() => {
    if (wasOpen.current && !drawerOpen && panelRef.current?.contains(document.activeElement)) {
      toggleRef.current?.focus();
    }
    wasOpen.current = drawerOpen;
  }, [drawerOpen]);

  return { drawerOpen, isDesktop, toggle, close, panelRef, closeBtnRef, toggleRef, reduceMotion };
}

export function Hamburger({ state, controls, className = '' }) {
  const { drawerOpen, toggle, toggleRef, reduceMotion } = state;
  const iconTransition = reduceMotion ? { duration: 0 } : { duration: 0.32, ease: [0.22, 1, 0.36, 1] };

  return (
    <button
      ref={toggleRef}
      type="button"
      onClick={toggle}
      aria-label={drawerOpen ? 'Close navigation menu' : 'Open navigation menu'}
      aria-expanded={drawerOpen}
      aria-controls={controls}
      className={`relative w-10 h-10 shrink-0 rounded-xl select-none touch-manipulation
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2
                  dark:focus-visible:ring-offset-slate-900 active:scale-90 transition-colors duration-200 ${
                    drawerOpen
                      ? 'bg-primary-600 text-white shadow-md shadow-primary-600/30'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  } ${className}`}
    >
      <span className="absolute inset-0 flex items-center justify-center">
        <i aria-hidden="true" style={iconTransition} className={`fas fa-bars absolute text-lg transition-all ${drawerOpen ? 'opacity-0 rotate-90 scale-x-50' : 'opacity-100 rotate-0 scale-x-100'}`} />
        <i
          aria-hidden="true"
          style={iconTransition}
          className={`fas fa-xmark absolute text-lg transition-all ${drawerOpen ? 'opacity-100 rotate-0 scale-x-100' : 'opacity-0 -rotate-90 scale-x-50'}`}
        />
      </span>
    </button>
  );
}

export function MobileDrawer({ state, title, icon = 'fa-bars', id, className = '', children, footer = null }) {
  const { drawerOpen, isDesktop, close, panelRef, closeBtnRef, reduceMotion } = state;
  const visible = drawerOpen || isDesktop;
  const transition = reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 40, mass: 0.7 };

  return (
    <>
      <motion.div
        className={`fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-[3px] ${className}`}
        initial={false}
        animate={{ opacity: drawerOpen ? 1 : 0 }}
        transition={reduceMotion ? { duration: 0 } : { duration: 0.25 }}
        onClick={close}
        aria-hidden="true"
        style={{ pointerEvents: drawerOpen ? 'auto' : 'none' }}
      />
      <motion.aside
        id={id}
        ref={panelRef}
        tabIndex={-1}
        aria-label={title}
        inert={visible ? undefined : ''}
        initial={{ x: isDesktop ? 0 : DRAWER_HIDDEN_X }}
        animate={{ x: visible ? 0 : DRAWER_HIDDEN_X }}
        transition={transition}
        drag={isDesktop ? false : 'x'}
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.16}
        dragMomentum={false}
        onDragEnd={(_, info) => {
          if (info.offset.x > SWIPE_CLOSE_DISTANCE || info.velocity.x > SWIPE_CLOSE_VELOCITY) {
            close();
          }
        }}
        className={`fixed right-0 top-0 bottom-0 z-50 w-72 max-w-[85vw] flex flex-col outline-none
                    bg-white dark:bg-slate-900 shadow-2xl will-change-transform ${className}`}
      >
        <span aria-hidden="true" className="absolute -left-1.5 top-1/2 -translate-y-1/2 h-12 w-1.5 rounded-full bg-slate-300/70 dark:bg-slate-700" />

        <div className="flex items-center justify-between gap-2 h-16 px-4 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-9 h-9 shrink-0 rounded-lg bg-brand-gradient grid place-items-center text-white">
              <i className={`fas ${icon} text-sm`} />
            </span>
            <span className="font-bold text-slate-800 dark:text-white truncate">{title}</span>
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            onClick={close}
            aria-label="Close menu"
            className="w-9 h-9 shrink-0 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-90 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
          >
            <i className="fas fa-xmark" />
          </button>
        </div>

        <motion.div className="flex flex-1 flex-col min-h-0" variants={listVariants} initial="hidden" animate={visible ? 'visible' : 'hidden'} transition={{ duration: reduceMotion ? 0 : 0.3 }}>
          {children}
        </motion.div>

        {footer && <div className="border-t border-slate-200 dark:border-slate-700 pb-[env(safe-area-inset-bottom)]">{footer}</div>}
      </motion.aside>
    </>
  );
}

export function NavSection({ label, children }) {
  return (
    <div>
      {label && <p className="px-4 pb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">{label}</p>}
      <ul className="space-y-1">{children}</ul>
    </div>
  );
}

export function NavRow({ to, icon, label, hint, onNavigate, end = false }) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onNavigate}
      className={({ isActive }) =>
        `group relative flex items-center gap-3 px-4 py-2.5 rounded-xl transition-colors duration-200 active:scale-[0.98] ${
          isActive ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
        }`
      }
    >
      {({ isActive }) => (
        <>
          <span
            aria-hidden="true"
            className={`absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-primary-600 dark:bg-primary-400 transition-all duration-300 ${
              isActive ? 'opacity-100 scale-y-100' : 'opacity-0 scale-y-0'
            }`}
          />
          <i
            aria-hidden="true"
            className={`fas ${icon} w-5 text-center shrink-0 transition-transform duration-200 group-hover:scale-110 ${isActive ? 'text-primary-600 dark:text-primary-400' : ''}`}
          />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium leading-tight truncate">{label}</span>
            {hint && <span className="block text-[11px] leading-tight text-slate-400 dark:text-slate-500 truncate">{hint}</span>}
          </span>
        </>
      )}
    </NavLink>
  );
}
