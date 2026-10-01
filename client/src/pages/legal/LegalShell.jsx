import { Link } from 'react-router-dom';
import { FadeUp } from '../../components/ui/motion';

export function LegalShell({ icon, title, subtitle, updated, children }) {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
      <FadeUp className="text-center mb-10">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-brand-gradient flex items-center justify-center text-white text-2xl mb-4 shadow-lg shadow-primary-600/20">
          <i className={`fas ${icon}`} />
        </div>
        <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">{subtitle}</p>}
        {updated && <p className="text-xs uppercase tracking-widest text-slate-400 mt-3">Last updated: {updated}</p>}
      </FadeUp>
      <div className="card p-6 sm:p-8">{children}</div>
    </div>
  );
}

export function LegalSection({ heading, children }) {
  return (
    <section className="mb-6 last:mb-0">
      <h2 className="font-bold text-slate-800 dark:text-slate-100 mb-2">{heading}</h2>
      <div className="text-sm leading-relaxed text-slate-600 dark:text-slate-300 space-y-2">{children}</div>
    </section>
  );
}

export function LegalList({ items }) {
  return (
    <ul className="list-disc pl-5 space-y-1.5">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

export function LegalLink({ to, children }) {
  return (
    <Link to={to} className="text-primary-600 dark:text-primary-400 hover:underline underline-offset-2">
      {children}
    </Link>
  );
}

export function ContactEmail() {
  return (
    <a href="mailto:oladitiabiodun86@gmail.com" className="text-primary-600 dark:text-primary-400 hover:underline underline-offset-2">
      oladitiabiodun86@gmail.com
    </a>
  );
}
