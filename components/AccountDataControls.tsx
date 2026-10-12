import React, { useState } from 'react';
import { Download, Trash2 } from 'lucide-react';
import { useFlyer } from './Flyer';

type Api = { requestDataExport: () => Promise<void>; requestAccountDeletion: () => Promise<void> };

/**
 * UK GDPR controls: download my data and delete my account. Same requests as the mobile app; the
 * office is emailed and the user gets a confirmation email.
 */
const AccountDataControls: React.FC<{ api: Api; onDeleted: () => void; className?: string }> = ({ api, onDeleted, className }) => {
  const { showFlyer } = useFlyer();
  const [busy, setBusy] = useState<'export' | 'delete' | null>(null);

  const requestExport = async () => {
    if (!window.confirm('We will email a copy of all your personal data to your registered email address within 30 days. Continue?')) return;
    setBusy('export');
    try {
      await api.requestDataExport();
      showFlyer('Request sent. Your data will be emailed to you within 30 days.', 'success');
    } catch (e) {
      showFlyer(e instanceof Error ? e.message : 'Could not send your request. Please email support@cleanitneatly.com.', 'error');
    } finally {
      setBusy(null);
    }
  };

  const requestDelete = async () => {
    if (!window.confirm('Delete your account? Your bookings, messages and personal data will be permanently erased within 30 days. This cannot be undone.')) return;
    if (!window.confirm('Are you sure? This is your final confirmation.')) return;
    setBusy('delete');
    try {
      await api.requestAccountDeletion();
      showFlyer('Your account is scheduled for deletion. A confirmation email is on its way.', 'success');
      onDeleted();
    } catch (e) {
      showFlyer(e instanceof Error ? e.message : 'Could not send your request. Please email support@cleanitneatly.com.', 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={className}>
      <p className="text-sm font-semibold text-slate-900">Your data</p>
      <p className="mt-0.5 text-sm text-slate-500">Your rights under UK GDPR. Both requests are handled within 30 days.</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={requestExport}
          disabled={busy !== null}
          className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
        >
          <Download className="h-4 w-4" />
          {busy === 'export' ? 'Sending…' : 'Download my data'}
        </button>
        <button
          type="button"
          onClick={requestDelete}
          disabled={busy !== null}
          className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 text-sm font-semibold text-red-600 transition hover:bg-red-100 disabled:opacity-50"
        >
          <Trash2 className="h-4 w-4" />
          {busy === 'delete' ? 'Sending…' : 'Delete my account'}
        </button>
      </div>
    </div>
  );
};

export default AccountDataControls;
