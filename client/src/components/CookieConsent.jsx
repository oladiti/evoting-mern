import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useCookieConsent } from '../hooks/useCookieConsent';
import { useToast } from '../context/ToastContext';

export default function CookieConsent() {
  const { decision, record } = useCookieConsent();
  const { success } = useToast();
  const [hidden, setHidden] = useState(false);

  const decide = (value) => {
    record(value);
    success('Your cookie preference has been saved.');
  };

  const show = !decision && !hidden;

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="cookie-consent"
          role="dialog"
          aria-live="polite"
          aria-label="Cookie consent"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          transition={{ type: 'spring', stiffness: 260, damping: 24 }}
          className="fixed bottom-4 left-4 right-4 sm:right-auto sm:max-w-md z-[95]"
        >
          <div className="card p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2 font-bold text-slate-800 dark:text-slate-100">
                <i className="fas fa-cookie-bite text-primary-600" />
                We value your privacy
              </div>
              <button
                onClick={() => setHidden(true)}
                className="shrink-0 w-7 h-7 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition"
                aria-label="Close cookie notice"
              >
                <i className="fas fa-times text-sm" />
              </button>
            </div>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
              We use essential cookies — for security, CSRF protection and keeping you signed in. These are always active because the service depends on them. We never use tracking or advertising
              cookies. You can reject non-essential cookies if we ever introduce them.{' '}
              <Link to="/cookies" className="text-primary-600 dark:text-primary-400 hover:underline underline-offset-2">
                Learn more
              </Link>
              .
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button onClick={() => decide('accepted')} className="btn-primary !px-4 !py-2 text-sm flex-1">
                <i className="fas fa-check mr-1" /> Accept
              </button>
              <button onClick={() => decide('rejected')} className="btn-outline !px-4 !py-2 text-sm flex-1">
                Reject non-essential
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
