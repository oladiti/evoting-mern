import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { FadeUp, FadeIn } from '../components/ui/motion';
import { useToast } from '../context/ToastContext';

const contactInfo = [
  { icon: 'fa-envelope', title: 'Email Us', text: 'oladitiabiodun86@gmail.com', href: 'mailto:oladitiabiodun86@gmail.com' },
  { icon: 'fa-map-pin', title: 'Visit Us', text: 'OGITECH, Ogun State, Nigeria' },
  { icon: 'fa-clock', title: 'Support Hours', text: 'Mon - Fri, 9:00 AM - 5:00 PM' },
];

export default function Contact() {
  const { user } = useAuth();
  const { success } = useToast();
  const [form, setForm] = useState({ name: '', email: '', subject: '', message: '' });
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  // The auth user resolves asynchronously from /api/auth/me, so it is still null
  // on the first render. Seed the identity fields once it arrives, without
  // clobbering anything already typed.
  useEffect(() => {
    if (!user) return;
    setForm((f) => ({
      ...f,
      name: f.name || user.full_name || user.username || '',
      email: f.email || user.email || '',
    }));
  }, [user]);

  const handle = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.subject.trim() || !form.message.trim()) {
      setError('Please provide a subject and a message.');
      return;
    }
    setSending(true);
    try {
      await api.post('/api/contact', {
        name: form.name,
        email: form.email,
        subject: form.subject,
        message: form.message,
      });
      success('Message sent! We will get back to you shortly.');
      setForm((f) => ({ ...f, subject: '', message: '' }));
    } catch (err) {
      setError(err?.message || 'Could not send your message. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const inputCls =
    'w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500';

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
      <FadeUp className="text-center mb-14">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-brand-gradient flex items-center justify-center text-white text-3xl mb-4">
          <i className="fas fa-envelope-open-text" />
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold text-slate-800 dark:text-slate-100">Contact Us</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-3 max-w-2xl mx-auto">Have a question about voting, accreditation or anything else? Send us a message and our team will respond.</p>
      </FadeUp>

      <div className="grid md:grid-cols-5 gap-10">
        <div className="md:col-span-2 space-y-4">
          {contactInfo.map((c) => (
            <FadeIn key={c.title}>
              <div className="card p-5 flex gap-4 items-start">
                <div className="w-11 h-11 shrink-0 rounded-xl bg-primary-500/15 text-primary-600 dark:text-primary-400 flex items-center justify-center text-lg">
                  <i className={`fas ${c.icon}`} />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-800 dark:text-slate-100">{c.title}</h3>
                  {c.href ? (
                    <a href={c.href} className="text-sm text-slate-500 dark:text-slate-400 hover:text-primary-600">
                      {c.text}
                    </a>
                  ) : (
                    <p className="text-sm text-slate-500 dark:text-slate-400">{c.text}</p>
                  )}
                </div>
              </div>
            </FadeIn>
          ))}

          <FadeIn>
            <div className="card p-5 bg-gradient-to-br from-primary-500/10 to-secondary-500/10 border-primary-200 dark:border-primary-900/40">
              <h3 className="font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <i className="fas fa-circle-info text-primary-500" /> Prefer self-service?
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">Most questions are already answered in our comprehensive guide.</p>
              <Link to="/help" className="btn-outline w-full mt-4">
                <i className="fas fa-circle-question mr-2" /> Read How It Works
              </Link>
            </div>
          </FadeIn>
        </div>

        <div className="md:col-span-3">
          <div className="card p-6 sm:p-8">
            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-1">Send a message</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">We usually reply within one business day.</p>

            <form onSubmit={submit} className="space-y-4" noValidate>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="label" htmlFor="contact-name">
                    Your name
                  </label>
                  <input id="contact-name" name="name" className={inputCls} value={form.name} onChange={handle} placeholder="Full name" required />
                </div>
                <div>
                  <label className="label" htmlFor="contact-email">
                    Email address
                  </label>
                  <input id="contact-email" name="email" type="email" className={inputCls} value={form.email} onChange={handle} placeholder="you@example.com" required />
                </div>
              </div>

              <div>
                <label className="label" htmlFor="contact-subject">
                  Subject
                </label>
                <input id="contact-subject" name="subject" className={inputCls} value={form.subject} onChange={handle} placeholder="What is this about?" required />
              </div>

              <div>
                <label className="label" htmlFor="contact-message">
                  Message
                </label>
                <textarea
                  id="contact-message"
                  name="message"
                  className={`${inputCls} min-h-[150px] resize-y`}
                  value={form.message}
                  onChange={handle}
                  placeholder="Write your question or feedback..."
                  required
                />
              </div>

              {error && (
                <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-danger-500/10 border border-danger-500/30 text-danger-600 dark:text-danger-400 text-sm">
                  <i className="fas fa-triangle-exclamation mt-0.5" />
                  {error}
                </div>
              )}

              <button type="submit" className="btn-primary w-full" disabled={sending}>
                {sending ? (
                  <i className="fas fa-spinner fa-spin" />
                ) : (
                  <>
                    <i className="fas fa-paper-plane mr-2" /> Send Message
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
