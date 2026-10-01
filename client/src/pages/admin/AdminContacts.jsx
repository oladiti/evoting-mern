import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import { FullLoader, EmptyState, Badge, PageHeader } from '../../components/ui/index';
import { formatDateShort } from '../../lib/format';

export default function AdminContacts() {
  const toast = useToast();
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [replyingTo, setReplyingTo] = useState(null);
  const [replyText, setReplyText] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const { contacts } = await api.get('/api/admin/contacts');
      setContacts(contacts);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const toggleRead = async (m) => {
    try {
      await api.put(`/api/admin/contacts/${m.contact_id || m._id}/read`);
      toast.success(m.read_at ? 'Marked as unread.' : 'Marked as read.');
      await load();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const deleteMessage = async (m) => {
    if (!window.confirm('Delete this message?')) return;
    try {
      await api.del(`/api/admin/contacts/${m.contact_id || m._id}`);
      toast.success('Message deleted.');
      await load();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const sendReply = async (ev) => {
    ev.preventDefault();
    if (!replyText.trim()) return;
    try {
      await api.post(`/api/admin/contacts/${replyingTo.contact_id || replyingTo._id}/reply`, { message: replyText.trim() });
      toast.success('Reply sent.');
      setReplyText('');
      setReplyingTo(null);
    } catch (e) {
      toast.error(e.message);
    }
  };

  if (loading) return <FullLoader text="Loading messages..." />;

  return (
    <div className="space-y-6">
      <PageHeader title="Contact Messages" subtitle="Messages submitted through the help/contact form." />

      {contacts.length === 0 ? (
        <EmptyState icon="fas fa-envelope-open" title="No messages" />
      ) : (
        <div className="space-y-4">
          {contacts.map((m) => (
            <div key={String(m.contact_id || m._id)} className={`card p-4 sm:p-5 ${!m.read_at ? 'border-l-4 border-l-primary-500' : ''}`}>
              <div className="flex flex-wrap items-start justify-between gap-2 sm:gap-3">
                <div className="min-w-0">
                  <p className="font-bold text-slate-800 dark:text-slate-100 break-anywhere">{m.name || m.email || 'Anonymous'}</p>
                  <p className="text-xs text-slate-400 break-anywhere">
                    {m.email} Â· {formatDateShort(m.created_at)}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {!m.read_at && <Badge tone="blue">New</Badge>}
                  {m.replied_at && (
                    <Badge tone="green">
                      <i className="fas fa-reply mr-1" /> Replied
                    </Badge>
                  )}
                </div>
              </div>
              {m.subject && <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mt-3 break-anywhere">{m.subject}</p>}
              <p className="text-sm text-slate-600 dark:text-slate-300 mt-1 whitespace-pre-line break-anywhere">{m.message}</p>
              <div className="page-actions mt-4">
                <button className="btn-secondary !py-1.5 !px-3 text-xs btn-compact" onClick={() => toggleRead(m)}>
                  <i className="fas fa-envelope" /> {m.read_at ? 'Mark unread' : 'Mark read'}
                </button>
                <button className="btn-primary !py-1.5 !px-3 text-xs btn-compact" onClick={() => setReplyingTo(m)}>
                  <i className="fas fa-reply" /> Reply
                </button>
                <button className="btn-danger !py-1.5 !px-3 text-xs btn-compact" onClick={() => deleteMessage(m)}>
                  <i className="fas fa-trash" /> Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {replyingTo &&
        // Portalled for the same reason as the shared Modal: the admin route
        // outlet is a transformed motion.div, which would otherwise become the
        // containing block for this `fixed` overlay instead of the viewport.
        createPortal(
          <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto overscroll-contain p-3 sm:items-center sm:p-4" onClick={() => setReplyingTo(null)}>
            <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm" aria-hidden="true" />
            <div
              role="dialog"
              aria-modal="true"
              aria-label={`Reply to ${replyingTo.email}`}
              className="relative card w-full max-w-lg p-4 my-auto sm:p-6 max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-2rem)] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="shrink-0">
                <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-1 break-anywhere">Reply to {replyingTo.email}</h3>
                <p className="text-xs text-slate-400 mb-4">Your reply will be emailed to the sender.</p>
              </div>
              <form onSubmit={sendReply} className="space-y-4 overflow-y-auto overscroll-contain min-h-0 flex-1 -mx-1 px-1">
                <label className="label" htmlFor="reply-message">
                  Reply Message
                </label>
                <textarea id="reply-message" name="reply" className="input" rows={5} required placeholder="Type your reply..." value={replyText} onChange={(e) => setReplyText(e.target.value)} />
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <button type="button" className="btn-secondary" onClick={() => setReplyingTo(null)}>
                    Cancel
                  </button>
                  <button type="submit" className="btn-primary">
                    <i className="fas fa-paper-plane" /> Send Reply
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
