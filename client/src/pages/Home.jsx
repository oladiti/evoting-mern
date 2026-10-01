import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AnimatePresence, animate, motion, useInView } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { useToast } from '../context/ToastContext';
import Recaptcha from '../components/ui/Recaptcha';
import { FadeUp, Stagger, StaggerItem } from '../components/ui/motion';
import { loadPublicBootstrap } from '../lib/format';

const features = [
  { icon: 'fa-envelope-open-text', title: 'Email Verification', text: 'Every voter verifies their email with a secure one-time code before voting.' },
  { icon: 'fa-user-check', title: 'Admin Accreditation', text: 'Accredited voters only — election admins approve who is eligible to cast a ballot.' },
  { icon: 'fa-face-smile', title: 'Face Verification', text: 'Optional one-time face check adds an extra layer of identity assurance.' },
  { icon: 'fa-location-dot', title: 'Geofencing', text: 'Votes are only accepted from within the campus premises.' },
  { icon: 'fa-shield-halved', title: 'Secure & Transparent', text: 'Encrypted credentials, CSRF protection and rate limiting keep the system safe.' },
  { icon: 'fa-chart-line', title: 'Live Results', text: 'See real-time tallies with beautiful charts as votes are cast.' },
];

const faqs = [
  { q: 'How do I register to vote?', a: 'Create an account with your matric number and official email, then verify your email with the code we send you.' },
  { q: 'Who can vote?', a: 'Any registered and email-verified voter who has been accredited for the specific election by an administrator.' },
  { q: 'What is face verification?', a: 'A one-time identity check using your webcam. After enrolling and verifying once, you can vote in future elections without repeating it.' },
  { q: 'Can I change my vote after submitting?', a: 'No. Each vote is final and locked the moment you submit your ballot.' },
  { q: 'Why do I need location access?', a: 'The system only accepts votes cast within the campus geofence to ensure all ballots come from on-campus voters.' },
];

const stats = [
  ['fa-users', '100%', 'Eligible Voters'],
  ['fa-shield-halved', '3×', 'Security Layers'],
  ['fa-bolt', 'Instant', 'Tally Results'],
];

function CountUp({ value }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, amount: 0.5 });
  const match = /^(\d+)(.*)$/.exec(value || '');
  const target = match ? parseInt(match[1], 10) : null;
  const [display, setDisplay] = useState(match ? 0 : value || '');

  useEffect(() => {
    if (!inView || target === null) return undefined;
    const controls = animate(0, target, {
      duration: 1.4,
      ease: 'easeOut',
      onUpdate: (v) => setDisplay(Math.round(v).toString()),
    });
    return () => controls.stop();
  }, [inView, target]);

  if (target === null) return <span ref={ref}>{value}</span>;
  const suffix = match ? match[2] : '';
  return (
    <span ref={ref} className="tabular-nums">
      {display}
      {suffix}
    </span>
  );
}

// Decorative hero artwork: a ballot dropping through the slot of a ballot box,
// plus a check badge for the "your vote counted" beat. Stroke-only and built on
// currentColor so it inherits text-white from the gradient section and needs no
// dark-mode variant. Purely decorative, so it is hidden from assistive tech and
// cannot intercept the clicks on the CTAs it sits behind.
function HeroArt() {
  return (
    <svg
      viewBox="0 0 240 240"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className="pointer-events-none absolute right-[-12%] top-1/2 -translate-y-1/2 w-[420px] sm:w-[560px] lg:w-[680px] max-w-none opacity-[0.08] select-none"
    >
      {/* Ballot box. The top edge is broken either side of the slot so the
          ballot below reads as passing through it rather than resting on it. */}
      <path d="M52 112 L104 112" />
      <path d="M136 112 L188 112" />
      <path d="M188 112 L206 204 L34 204 L52 112" />
      {/* Ballot, angled as if just dropped in. */}
      <g transform="rotate(-8 120 118)">
        <rect x="106" y="62" width="28" height="58" rx="5" />
        <path d="M112 84 L118 90 L130 78" />
      </g>
      <path d="M120 38 L120 50" strokeDasharray="3 5" />
      {/* Check badge. */}
      <circle cx="196" cy="64" r="30" />
      <path d="M185 64 L193 72 L208 56" />
    </svg>
  );
}

export default function Home() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { success, error } = useToast();
  const [bootstrap, setBootstrap] = useState({ recaptcha_enabled: false, site_name: 'E-Voting System' });
  const [contact, setContact] = useState({ name: '', email: '', subject: '', message: '' });
  const [captchaToken, setCaptchaToken] = useState('');
  const [sending, setSending] = useState(false);
  const [openFaq, setOpenFaq] = useState(null);

  useEffect(() => {
    loadPublicBootstrap().then(setBootstrap);
  }, []);

  const submitContact = async (e) => {
    e.preventDefault();
    setSending(true);
    try {
      const payload = { ...contact, 'g-recaptcha-response': captchaToken || undefined };
      const res = await api.post('/api/contact', payload);
      success(res.message);
      setContact({ name: '', email: '', subject: '', message: '' });
    } catch (err) {
      error(err.message);
    } finally {
      setSending(false);
    }
  };

  const heroStagger = {
    hidden: { opacity: 0, y: 24 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.55, ease: 'easeOut' } },
  };

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden bg-brand-gradient text-white">
        <div className="pointer-events-none absolute -top-24 -left-24 w-80 h-80 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -right-24 w-96 h-96 rounded-full bg-secondary-500/20 blur-3xl" />
        <div className="pointer-events-none absolute inset-0 opacity-[0.07]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, #fff 1px, transparent 0)', backgroundSize: '34px 34px' }} />
        <HeroArt />
        <motion.div initial="hidden" animate="visible" transition={{ staggerChildren: 0.15 }} className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 lg:py-28 text-center">
          <motion.div
            variants={{
              hidden: { opacity: 0, scale: 0.8 },
              visible: { opacity: 1, scale: 1, transition: { duration: 0.5, ease: 'easeOut' } },
            }}
            className="w-16 h-16 mx-auto rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center text-3xl mb-6 shadow-lg shadow-black/10"
          >
            <i className="fas fa-vote-yea" />
          </motion.div>
          <motion.h1 variants={heroStagger} className="text-4xl lg:text-5xl font-extrabold tracking-tight">
            {bootstrap.site_name}
          </motion.h1>
          <motion.p variants={heroStagger} className="mt-4 text-lg text-white/80 max-w-2xl mx-auto">
            Secure, transparent, and verifiable student body elections — right from your browser.
          </motion.p>
          <motion.div variants={heroStagger}>
            <div className="mt-8 flex flex-wrap justify-center gap-4">
              {user ? (
                <button onClick={() => navigate(user.is_admin ? '/admin' : '/dashboard')} className="btn bg-white text-primary-700 hover:bg-primary-50 shadow-lg shadow-black/10">
                  <i className="fas fa-tachometer-alt" /> Go to Dashboard
                </button>
              ) : (
                <>
                  <Link to="/register" className="btn bg-white text-primary-700 hover:bg-primary-50 shadow-lg shadow-black/10">
                    <i className="fas fa-user-plus" /> Register to Vote
                  </Link>
                  <Link to="/login" className="btn border-2 border-white/40 text-white hover:bg-white/10">
                    <i className="fas fa-sign-in-alt" /> Login
                  </Link>
                </>
              )}
            </div>
          </motion.div>
          <motion.div variants={heroStagger}>
            <div className="mt-10 flex flex-wrap justify-center gap-2">
              {[
                ['fa-envelope-open-text', 'Email OTP'],
                ['fa-location-crosshairs', 'Campus Geofence'],
                ['fa-face-smile', 'Face Check'],
                ['fa-shield-halved', 'Encrypted & Safe'],
              ].map(([icon, label]) => (
                <span key={label} className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 backdrop-blur px-3.5 py-1.5 text-xs font-medium">
                  <i className={`fas ${icon}`} />
                  {label}
                </span>
              ))}
            </div>
          </motion.div>
          <motion.div variants={heroStagger} animate="visible" className="mt-12 text-white/60">
            <motion.div animate={{ y: [0, 8, 0] }} transition={{ repeat: Infinity, duration: 1.8, ease: 'easeInOut' }} className="text-lg">
              <i className="fas fa-chevron-down" />
            </motion.div>
          </motion.div>
        </motion.div>
      </section>

      {/* Features */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16" id="features">
        <FadeUp className="text-center mb-12">
          <h2 className="text-3xl font-bold text-slate-800 dark:text-slate-100">Why Use This System?</h2>
          <p className="mt-3 text-slate-500 dark:text-slate-400">Built for integrity, transparency and ease of use.</p>
        </FadeUp>
        <Stagger className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {features.map((f) => (
            <StaggerItem key={f.title} className="card p-6 hover:shadow-lg hover:-translate-y-1 transition-all duration-300">
              <div className="w-12 h-12 rounded-xl bg-primary-500/15 text-primary-600 dark:text-primary-400 flex items-center justify-center text-xl mb-4">
                <i className={`fas ${f.icon}`} />
              </div>
              <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-1">{f.title}</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">{f.text}</p>
            </StaggerItem>
          ))}
        </Stagger>
      </section>

      {/* Stats */}
      <section className="bg-slate-100 dark:bg-slate-800/40 py-12">
        <Stagger className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-3 gap-6 text-center">
          {stats.map(([icon, value, label]) => (
            <StaggerItem key={label}>
              <div className="w-12 h-12 mx-auto rounded-xl bg-white dark:bg-slate-800 shadow-sm text-primary-600 dark:text-primary-400 flex items-center justify-center text-lg mb-2">
                <i className={`fas ${icon}`} />
              </div>
              <div className="text-2xl sm:text-3xl font-extrabold text-slate-800 dark:text-slate-100">
                <CountUp value={value} />
              </div>
              <div className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">{label}</div>
            </StaggerItem>
          ))}
        </Stagger>
      </section>

      {/* About */}
      <section className="py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid lg:grid-cols-2 gap-10 items-center">
          <FadeUp>
            <h2 className="text-3xl font-bold text-slate-800 dark:text-slate-100 mb-4" id="about">
              About the System
            </h2>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
              The electronic voting system provides a safe alternative to paper ballots. Each eligible voter registers once, verifies their email, gets accredited by an election administrator, and
              casts a single, secret ballot for each contested position.
            </p>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed mt-4">
              Results are tallied automatically and can be viewed live with full transparency, while layered security keeps the process fair.
            </p>
          </FadeUp>
          <Stagger className="space-y-4">
            {[
              ['fa-user-lock', 'One account, one vote per position'],
              ['fa-envelope', 'Email OTP verification'],
              ['fa-location-crosshairs', 'On-campus voting only'],
              ['fa-file-signature', 'Tamper-resistant vote storage'],
            ].map(([icon, text]) => (
              <StaggerItem key={text} className="card px-5 py-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-success-500/15 text-success-500 flex items-center justify-center">
                  <i className={`fas ${icon}`} />
                </div>
                <span className="font-medium text-slate-700 dark:text-slate-200">{text}</span>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>

      {/* FAQ */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <FadeUp className="text-center mb-10">
          <h2 className="text-3xl font-bold text-slate-800 dark:text-slate-100">Frequently Asked Questions</h2>
        </FadeUp>
        <Stagger className="space-y-4" amount={0.08}>
          {faqs.map((f, i) => {
            const open = openFaq === i;
            return (
              <StaggerItem key={f.q}>
                <motion.div
                  whileHover={{ y: -3 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                  className={`card p-5 transition-shadow duration-300 ${open ? 'ring-1 ring-primary-500/40 shadow-md' : ''}`}
                >
                  <button
                    type="button"
                    onClick={() => setOpenFaq(open ? null : i)}
                    aria-expanded={open}
                    className="w-full flex items-center justify-between gap-4 text-left font-semibold text-slate-800 dark:text-slate-100"
                  >
                    <span>{f.q}</span>
                    <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ type: 'spring', stiffness: 300, damping: 22 }} className="shrink-0 text-primary-600 dark:text-primary-400">
                      <i className="fas fa-chevron-down" />
                    </motion.span>
                  </button>
                  <AnimatePresence initial={false}>
                    {open && (
                      <motion.div
                        key="answer"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ type: 'spring', stiffness: 260, damping: 30 }}
                        className="overflow-hidden"
                      >
                        <p className="mt-3 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{f.a}</p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              </StaggerItem>
            );
          })}
        </Stagger>
      </section>

      {/* Contact */}
      <section className="max-w-xl mx-auto px-4 sm:px-6 py-16 pb-24" id="contact">
        <FadeUp className="text-center mb-8">
          <h2 className="text-3xl font-bold text-slate-800 dark:text-slate-100">Contact Us</h2>
          <p className="mt-2 text-slate-500 dark:text-slate-400">Have a question or issue? Send us a message.</p>
        </FadeUp>
        <FadeUp delay={0.1}>
          <form onSubmit={submitContact} className="card p-6 space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="label" htmlFor="home-contact-name">
                  Name
                </label>
                <input id="home-contact-name" name="name" className="input" required value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} />
              </div>
              <div>
                <label className="label" htmlFor="home-contact-email">
                  Email
                </label>
                <input id="home-contact-email" name="email" className="input" type="email" required value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="label" htmlFor="home-contact-subject">
                Subject
              </label>
              <input id="home-contact-subject" name="subject" className="input" required value={contact.subject} onChange={(e) => setContact({ ...contact, subject: e.target.value })} />
            </div>
            <div>
              <label className="label" htmlFor="home-contact-message">
                Message
              </label>
              <textarea id="home-contact-message" name="message" className="input" rows={5} required value={contact.message} onChange={(e) => setContact({ ...contact, message: e.target.value })} />
            </div>
            <Recaptcha siteKey={bootstrap.recaptcha_site_key} enabled={bootstrap.recaptcha_enabled} onChange={setCaptchaToken} />
            <button className="btn-primary w-full" disabled={sending}>
              {sending ? (
                <>
                  <span className="animate-spin inline-block">
                    <i className="fas fa-circle-notch" />
                  </span>{' '}
                  Sending...
                </>
              ) : (
                <>
                  <i className="fas fa-paper-plane" /> Send Message
                </>
              )}
            </button>
          </form>
        </FadeUp>
      </section>
    </div>
  );
}
