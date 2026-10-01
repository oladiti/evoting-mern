import { useEffect, useMemo, useRef, useState } from 'react';
import { api, getCsrfToken } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import { FullLoader, Modal, Spinner, PageHeader } from '../../components/ui/index';

const CATEGORY_META = {
  general: { label: 'General', icon: 'fa-sliders-h', hint: 'Branding, maintenance and geofencing.' },
  registration_voting: { label: 'Registration & Voting', icon: 'fa-vote-yea', hint: 'Control who can register and cast a ballot.' },
  security: { label: 'Security', icon: 'fa-shield-halved', hint: 'Sessions, reCAPTCHA and abuse protection.' },
  notifications: { label: 'Notifications', icon: 'fa-bell', hint: 'Transactional email preferences.' },
  email: { label: 'Email (SMTP)', icon: 'fa-paper-plane', hint: 'Outbound mail server configuration.' },
};

const SECRET_KEYS = new Set(['smtp_pass', 'recaptcha_secret_key']);
const TEXTAREA_KEYS = new Set(['maintenance_message', 'site_about']);

const toInputValue = (s) => {
  if (s.type === 'boolean') return s.value ? '1' : '0';
  return s.value ?? '';
};

export default function AdminSettings() {
  const toast = useToast();
  const [settings, setSettings] = useState([]);
  const [categories, setCategories] = useState([]);
  const [recaptchaConfigured, setRecaptchaConfigured] = useState(false);
  const [smtp, setSmtp] = useState({ configured: false, source: '', active: null });
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [values, setValues] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [restoreFile, setRestoreFile] = useState(null);
  const [restoring, setRestoring] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const d = await api.get('/api/admin/settings');
        if (!alive) return;
        setSettings(d.settings);
        setCategories(d.categories);
        setRecaptchaConfigured(Boolean(d.recaptcha_configured));
        setSmtp({ configured: Boolean(d.smtp_configured), source: d.smtp_source || '', active: d.smtp_active || null });
        setValues(Object.fromEntries(d.settings.map((s) => [s.key, toInputValue(s)])));
      } catch (e) {
        if (alive) toast.error(e.message);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-reads the resolved SMTP status so a save is reflected immediately
  // instead of only after a reload.
  const refreshSmtp = async () => {
    try {
      const d = await api.get('/api/admin/settings');
      setSmtp({ configured: Boolean(d.smtp_configured), source: d.smtp_source || '', active: d.smtp_active || null });
    } catch {
      // A failed status refresh must not clobber the form.
    }
  };

  const sendTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await api.post('/api/admin/settings/test-email');
      setTestResult({ ok: true, text: res.message });
      toast.success('Test email sent.');
    } catch (e) {
      const detail = e.data?.mailError || e.message;
      setTestResult({ ok: false, text: detail });
      toast.error(detail);
    } finally {
      setTesting(false);
    }
  };

  const grouped = useMemo(() => {
    const map = {};
    categories.forEach((c) => {
      map[c] = settings.filter((s) => s.category === c);
    });
    return categories.map((c) => ({ key: c, ...CATEGORY_META[c], items: map[c] })).filter((g) => g.items.length > 0);
  }, [settings, categories]);

  const set = (key) => (e) => {
    const target = e.target;
    setValues((v) => ({ ...v, [key]: target.type === 'checkbox' ? (target.checked ? '1' : '0') : target.value }));
  };

  const isBool = (s) => s.type === 'boolean';
  const isSecret = (s) => SECRET_KEYS.has(s.key);
  const isTextarea = (s) => TEXTAREA_KEYS.has(s.key);

  const changed = settings.filter((s) => (values[s.key] ?? toInputValue(s)) !== toInputValue(s)).map((s) => ({ key: s.key, value: values[s.key] ?? toInputValue(s) }));

  const save = async () => {
    if (changed.length === 0) return;
    setSaving(true);
    try {
      await api.put('/api/admin/settings', { updates: changed });
      const applied = new Map(changed.map((c) => [c.key, c.value]));
      setValues((v) => {
        const next = { ...v };
        // A saved credential must not be echoed back into the form: the server
        // redacts it on the next read, and keeping it here would leave the
        // secret sitting in the DOM and in React state for the rest of the
        // session. Drop it and let the field fall back to the blank placeholder.
        for (const c of changed) if (SECRET_KEYS.has(c.key)) delete next[c.key];
        return next;
      });
      setSettings((prev) =>
        prev.map((s) => {
          if (!applied.has(s.key)) return s;
          if (SECRET_KEYS.has(s.key)) return { ...s, value: '', has_value: Boolean(applied.get(s.key)) };
          return { ...s, value: s.type === 'boolean' ? applied.get(s.key) === '1' : applied.get(s.key) };
        })
      );
      toast.success(`${changed.length} setting(s) saved.`);
      if (changed.some((c) => c.key.startsWith('smtp_'))) {
        setTestResult(null);
        await refreshSmtp();
      }
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const revert = () => {
    setValues(Object.fromEntries(settings.map((s) => [s.key, toInputValue(s)])));
  };

  const backup = async () => {
    setBackingUp(true);
    try {
      const res = await fetch('/api/admin/backup', {
        credentials: 'include',
        headers: { 'X-CSRF-Token': getCsrfToken() || '', 'X-Requested-With': 'XMLHttpRequest' },
      });
      if (!res.ok) throw new Error(`Backup failed (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `evoting_backup_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Backup downloaded.');
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBackingUp(false);
    }
  };

  const pickRestoreFile = () => {
    const f = fileRef.current?.files?.[0];
    if (!f) {
      setRestoreFile(null);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        JSON.parse(String(reader.result));
        setRestoreFile(f);
      } catch {
        setRestoreFile(null);
        toast.error('That file is not valid JSON.');
      }
    };
    reader.readAsText(f);
  };

  const restore = async () => {
    if (!restoreFile) return;
    const ok = window.confirm('Restore from this backup?\n\nEvery collection (users, elections, candidates, votes, settings) is wiped and replaced. This cannot be undone.');
    if (!ok) return;
    setRestoring(true);
    try {
      const text = await restoreFile.text();
      await api.post('/api/admin/restore', { backup: text });
      toast.success('Database restored. Reloading...');
      setRestoreOpen(false);
      setRestoreFile(null);
      setTimeout(() => window.location.reload(), 1200);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setRestoring(false);
    }
  };

  if (loading) return <FullLoader text="Loading settings..." />;

  return (
    <div className="space-y-6">
      <PageHeader title="System Settings" subtitle={`${settings.length} settings across ${grouped.length} categories.`}>
        <button className="btn-secondary !py-2 !px-4 text-sm" onClick={backup} disabled={backingUp || saving}>
          {backingUp ? <Spinner size={16} /> : <i className="fas fa-download" />} Backup
        </button>
        <button className="btn-outline !py-2 !px-4 text-sm" onClick={() => setRestoreOpen(true)} disabled={saving}>
          <i className="fas fa-upload" /> Restore
        </button>
        <button className="btn-secondary !py-2 !px-4 text-sm" onClick={revert} disabled={changed.length === 0 || saving}>
          Discard
        </button>
        <button className="btn-primary !py-2 !px-4 text-sm" onClick={save} disabled={changed.length === 0 || saving}>
          {saving ? <Spinner size={16} /> : <i className="fas fa-check" />} Save{changed.length ? ` (${changed.length})` : ''}
        </button>
      </PageHeader>

      {!recaptchaConfigured && (
        <div className="card p-4 border-l-4 border-l-warning-500 flex items-start gap-3">
          <i className="fas fa-triangle-exclamation text-warning-500 mt-0.5 shrink-0" />
          <p className="text-sm text-slate-600 dark:text-slate-300 break-anywhere">
            <span className="font-semibold">reCAPTCHA keys are not configured on the server.</span> Add <code className="text-xs">RECAPTCHA_SITE_KEY</code> and{' '}
            <code className="text-xs">RECAPTCHA_SECRET_KEY</code> to <code className="text-xs">server/.env</code> before enabling the security toggle.
          </p>
        </div>
      )}

      <section className="card card-pad">
        <div className="flex items-start gap-3 mb-4">
          <span className="w-10 h-10 rounded-xl bg-brand-gradient text-white flex items-center justify-center shrink-0">
            <i className="fas fa-paper-plane" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-bold text-slate-800 dark:text-slate-100 break-anywhere">Outbound Email</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 break-anywhere">
              Verification codes and password resets are sent through this server. A fault here silently blocks new voter registration, so confirm it works before relying on it.
            </p>
          </div>
        </div>

        <div className={`rounded-xl p-3.5 flex items-start gap-3 ${smtp.configured ? 'bg-success-50 dark:bg-success-900/20' : 'bg-warning-50 dark:bg-warning-900/20'}`}>
          <i className={`fas ${smtp.configured ? 'fa-circle-check text-success-500' : 'fa-triangle-exclamation text-warning-500'} mt-0.5 shrink-0`} />
          <p className="text-sm text-slate-600 dark:text-slate-300 break-anywhere min-w-0">
            {smtp.configured ? (
              <>
                <span className="font-semibold">SMTP is configured.</span>{' '}
                {smtp.active?.host ? (
                  <>
                    Sending as <code className="text-xs">{smtp.active.user}</code> via{' '}
                    <code className="text-xs">
                      {smtp.active.host}:{smtp.active.port}
                    </code>{' '}
                    ({smtp.active.secure ? 'TLS' : 'STARTTLS'}, from {smtp.source === 'settings' ? 'these settings' : 'server/.env'}).
                  </>
                ) : null}
              </>
            ) : (
              <>
                <span className="font-semibold">SMTP is not configured.</span> Fill in the fields under Email (SMTP) below, or set <code className="text-xs">MAIL_HOST</code>,{' '}
                <code className="text-xs">MAIL_USERNAME</code> and <code className="text-xs">MAIL_PASSWORD</code> in <code className="text-xs">server/.env</code>. Until then no verification codes can
                be sent.
              </>
            )}
          </p>
        </div>

        {testResult && (
          <div className={`mt-3 rounded-xl p-3.5 flex items-start gap-3 ${testResult.ok ? 'bg-success-50 dark:bg-success-900/20' : 'bg-danger-50 dark:bg-danger-900/20'}`}>
            <i className={`fas ${testResult.ok ? 'fa-circle-check text-success-500' : 'fa-circle-exclamation text-danger-500'} mt-0.5 shrink-0`} />
            <div className="min-w-0">
              <p className="text-sm text-slate-600 dark:text-slate-300 break-anywhere">{testResult.text}</p>
              {!testResult.ok && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 break-anywhere">
                  For Gmail and Google Workspace use a 16-character App Password, not the account password. Two-Step Verification must be on.
                </p>
              )}
            </div>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button className="btn-secondary !py-2 !px-4 text-sm" onClick={sendTest} disabled={testing || saving}>
            {testing ? <Spinner size={16} /> : <i className="fas fa-paper-plane" />} Send test email
          </button>
          <button className="btn-outline !py-2 !px-4 text-sm" onClick={refreshSmtp} disabled={testing || saving}>
            <i className="fas fa-rotate" /> Re-check
          </button>
          <span className="text-xs text-slate-400">Sends to your own admin address.</span>
        </div>
      </section>

      {grouped.map((group) => (
        <section key={group.key} className="card card-pad">
          <div className="flex items-start gap-3 mb-5">
            <span className="w-10 h-10 rounded-xl bg-brand-gradient text-white flex items-center justify-center shrink-0">
              <i className={`fas ${group.icon}`} />
            </span>
            <div className="min-w-0">
              <h2 className="font-bold text-slate-800 dark:text-slate-100 break-anywhere">{group.label}</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 break-anywhere">{group.hint}</p>
            </div>
          </div>

          <div className="grid gap-x-6 gap-y-4 md:grid-cols-2">
            {group.items.map((s) => (
              <div key={s.key} className="space-y-1.5 min-w-0">
                {isBool(s) ? (
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      id={s.key}
                      name={s.key}
                      type="checkbox"
                      className="mt-0.5 h-5 w-5 shrink-0 rounded border-slate-300 dark:border-slate-600 text-primary-600 focus:ring-primary-500"
                      checked={values[s.key] === '1'}
                      onChange={set(s.key)}
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-slate-700 dark:text-slate-300 break-anywhere">{s.key}</span>
                      <span className="block text-xs text-slate-400 break-anywhere">{s.description}</span>
                    </span>
                  </label>
                ) : (
                  <>
                    <label className="label !mb-0 break-anywhere" htmlFor={s.key}>
                      {s.key}
                    </label>
                    {isTextarea(s) ? (
                      <textarea id={s.key} name={s.key} className="input" rows={3} value={values[s.key] ?? ''} onChange={set(s.key)} />
                    ) : (
                      <input
                        id={s.key}
                        name={s.key}
                        className="input"
                        type={s.type === 'integer' ? 'number' : isSecret(s) ? 'password' : 'text'}
                        value={values[s.key] ?? ''}
                        onChange={set(s.key)}
                        autoComplete="off"
                        placeholder={isSecret(s) ? (s.has_value ? 'Saved - leave blank to keep' : 'Not set') : undefined}
                      />
                    )}
                    <p className="text-xs text-slate-400 break-anywhere">{s.description}</p>
                  </>
                )}
              </div>
            ))}
          </div>
        </section>
      ))}

      <div className="page-actions sm:flex sm:justify-end">
        <button className="btn-secondary" onClick={revert} disabled={changed.length === 0 || saving}>
          Discard changes
        </button>
        <button className="btn-primary" onClick={save} disabled={changed.length === 0 || saving}>
          {saving ? <Spinner size={16} /> : <i className="fas fa-save" />} Save changes
        </button>
      </div>

      {changed.length > 0 && <p className="text-xs text-slate-400 text-left sm:text-right break-anywhere">{changed.map((c) => c.key).join(', ')}</p>}

      <Modal
        open={restoreOpen}
        onClose={() => {
          if (restoring) return;
          setRestoreOpen(false);
          setRestoreFile(null);
        }}
        title="Restore from backup"
        footer={
          <>
            <button
              className="btn-secondary"
              onClick={() => {
                setRestoreOpen(false);
                setRestoreFile(null);
              }}
              disabled={restoring}
            >
              Cancel
            </button>
            <button className="btn-danger" onClick={restore} disabled={!restoreFile || restoring}>
              {restoring ? <Spinner size={16} /> : <i className="fas fa-triangle-exclamation" />} Replace all data
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="rounded-xl bg-danger-50 dark:bg-danger-900/20 p-4 flex items-start gap-3">
            <i className="fas fa-exclamation-triangle text-danger-500 mt-0.5 shrink-0" />
            <p className="text-sm text-slate-600 dark:text-slate-300 break-anywhere">
              Restoring deletes every record in all collections and replaces it with the contents of the backup file. There is no undo — download a fresh backup first.
            </p>
          </div>
          <div>
            <label className="label" htmlFor="restore-file">
              Backup file (.json)
            </label>
            <input ref={fileRef} id="restore-file" name="restore" type="file" accept="application/json,.json" className="input" onChange={pickRestoreFile} disabled={restoring} />
          </div>
          <button className="btn-secondary w-full" onClick={backup} disabled={backingUp || restoring}>
            {backingUp ? <Spinner size={16} /> : <i className="fas fa-download" />} Download a fresh backup first
          </button>
        </div>
      </Modal>
    </div>
  );
}
