import React, { useCallback, useEffect, useState } from 'react';
import { Bell, Play, RefreshCw, Trash2 } from 'lucide-react';
import { apiAdmin } from '../../services/api';
import { useFlyer } from '../Flyer';

type ReminderSettings = {
  masterEnabled: boolean;
  send48h: boolean;
  send24h: boolean;
  notifyAdmin: boolean;
  notifyStaff: boolean;
};

type LogRow = {
  id: number;
  bookingId: string;
  windowLabel: string;
  channels: string;
  createdAt?: string | Date | null;
  bookingRef?: string;
  bookingDate?: string;
  bookingTime?: string;
  bookingStatus?: string;
  contactName?: string;
  contactEmail?: string;
  serviceType?: string;
  jobRef?: string;
  staffNames?: string;
};

const BookingRemindersPanel: React.FC = () => {
  const { showFlyer } = useFlyer();
  const [settings, setSettings] = useState<ReminderSettings>({
    masterEnabled: true,
    send48h: true,
    send24h: true,
    notifyAdmin: true,
    notifyStaff: true,
  });
  const [log, setLog] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [resetId, setResetId] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const parts: string[] = [];
    try {
      const s = await apiAdmin.getBookingReminderSettings();
      setSettings(s);
    } catch (e) {
      parts.push(e instanceof Error ? e.message : 'Could not load reminder settings.');
    }
    try {
      const rows = await apiAdmin.getBookingReminderLog(100);
      setLog(Array.isArray(rows) ? rows : []);
    } catch (e) {
      parts.push(e instanceof Error ? e.message : 'Could not load reminder log.');
    }
    if (parts.length) setLoadError(parts.join(' '));
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      const next = await apiAdmin.updateBookingReminderSettings(settings);
      setSettings(next);
      showFlyer('Reminder settings saved.', 'success');
    } catch (e) {
      showFlyer(e instanceof Error ? e.message : 'Could not save settings.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const runNow = async () => {
    setRunning(true);
    try {
      const r = await apiAdmin.runBookingRemindersNow();
      showFlyer(
        `Scan complete: ${r.scanned} booking(s) checked. Sent ${r.sent48}×48h and ${r.sent24}×24h reminders.`,
        'success',
      );
      await load();
    } catch (e) {
      showFlyer(e instanceof Error ? e.message : 'Run failed.', 'error');
    } finally {
      setRunning(false);
    }
  };

  const deleteLogRow = async (id: number) => {
    if (!window.confirm('Remove this log row? (Does not reset sent flags on the booking.)')) return;
    try {
      await apiAdmin.deleteBookingReminderLogRow(id);
      setLog((prev) => prev.filter((r) => r.id !== id));
      showFlyer('Log entry removed.', 'success');
    } catch (e) {
      showFlyer(e instanceof Error ? e.message : 'Delete failed.', 'error');
    }
  };

  const resetBooking = async () => {
    const id = resetId.trim();
    if (!id) {
      showFlyer('Enter a booking reference (e.g. CIN-000001).', 'error');
      return;
    }
    if (!window.confirm(`Clear automatic reminder flags and log for ${id}? You can trigger sends again on the next run.`)) return;
    try {
      await apiAdmin.resetBookingAutomaticReminders(id);
      setResetId('');
      showFlyer(`Automatic reminders reset for ${id}.`, 'success');
      await load();
    } catch (e) {
      showFlyer(e instanceof Error ? e.message : 'Reset failed.', 'error');
    }
  };

  return (
    <div className="space-y-8">
      {loadError ? (
        <div
          role="alert"
          className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-900"
        >
          {loadError}
          <button
            type="button"
            className="ml-3 text-xs font-black uppercase tracking-widest text-rose-700 underline"
            onClick={() => void load()}
          >
            Retry
          </button>
        </div>
      ) : null}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h4 className="text-xl font-black text-slate-900 flex items-center gap-2">
            <Bell className="w-5 h-5 text-amber-600" />
            Automatic booking reminders
          </h4>
          <p className="text-xs font-bold text-slate-500 mt-2 max-w-2xl leading-relaxed">
            The server checks about every <strong>15 minutes</strong>. For each <strong>Pending</strong> or{' '}
            <strong>Confirmed</strong> job, clients receive a <strong>48-hour</strong> and <strong>24-hour</strong> reminder
            (email via Brevo, SMS if <code className="text-[11px] bg-slate-100 px-1 rounded">client_booking_reminder_sms</code>{' '}
            is active and a mobile is on the booking, and in-app notification if they have an account).{' '}
            <strong>Assigned staff</strong> get the same windows via in-app notifications and optional SMS (
            <code className="text-[11px] bg-slate-100 px-1 rounded">staff_booking_reminder_sms</code>). Admins can get a matching
            bell notification. Set <code className="text-[11px] bg-slate-100 px-1 rounded">TZ=Europe/London</code> on the server
            for correct local windows.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-slate-700 text-xs font-black uppercase tracking-widest hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => void runNow()}
            disabled={running}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-black uppercase tracking-widest hover:bg-blue-700 disabled:opacity-50"
          >
            <Play className="w-4 h-4" />
            {running ? 'Running…' : 'Run check now'}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-[2rem] border border-slate-100/50 shadow-sm p-6 sm:p-8 space-y-5">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Toggles</p>
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-slate-300"
            checked={settings.masterEnabled}
            onChange={(e) => setSettings((s) => ({ ...s, masterEnabled: e.target.checked }))}
          />
          <span className="text-sm font-bold text-slate-800">Master: automatic reminders enabled</span>
        </label>
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-slate-300"
            checked={settings.send48h}
            onChange={(e) => setSettings((s) => ({ ...s, send48h: e.target.checked }))}
            disabled={!settings.masterEnabled}
          />
          <span className="text-sm font-bold text-slate-800">Send 48-hour reminder (email + SMS + notification)</span>
        </label>
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-slate-300"
            checked={settings.send24h}
            onChange={(e) => setSettings((s) => ({ ...s, send24h: e.target.checked }))}
            disabled={!settings.masterEnabled}
          />
          <span className="text-sm font-bold text-slate-800">Send 24-hour reminder</span>
        </label>
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-slate-300"
            checked={settings.notifyAdmin}
            onChange={(e) => setSettings((s) => ({ ...s, notifyAdmin: e.target.checked }))}
            disabled={!settings.masterEnabled}
          />
          <span className="text-sm font-bold text-slate-800">Notify admins (in-app) for each automatic reminder</span>
        </label>
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-slate-300"
            checked={settings.notifyStaff}
            onChange={(e) => setSettings((s) => ({ ...s, notifyStaff: e.target.checked }))}
            disabled={!settings.masterEnabled}
          />
          <span className="text-sm font-bold text-slate-800">
            Notify assigned staff (in-app + SMS when template is active and mobile is on file)
          </span>
        </label>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="px-6 py-3 rounded-xl bg-slate-900 text-white text-sm font-black hover:bg-blue-600 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save settings'}
        </button>
      </div>

      <div className="bg-white rounded-[2rem] border border-slate-100/50 shadow-sm p-6 sm:p-8 space-y-4">
        <h5 className="text-lg font-black text-slate-900">Reset automatic sends for a booking</h5>
        <p className="text-xs text-slate-500 font-medium">
          Clears “already sent” timestamps and removes log rows for that reference so the next scheduled run can send again
          (useful after a reschedule or a failed send).
        </p>
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <input
            value={resetId}
            onChange={(e) => setResetId(e.target.value)}
            placeholder="CIN-000001"
            className="flex-1 px-4 py-3 rounded-xl border border-slate-200 font-mono text-sm"
          />
          <button
            type="button"
            onClick={() => void resetBooking()}
            className="px-5 py-3 rounded-xl border border-amber-200 bg-amber-50 text-amber-900 text-sm font-black hover:bg-amber-100"
          >
            Reset booking
          </button>
        </div>
      </div>

      <div className="bg-white rounded-[2rem] border border-slate-100/50 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
          <h5 className="text-lg font-black text-slate-900">Reminder log</h5>
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{log.length} rows</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-[10px] font-black uppercase tracking-widest text-slate-500">
                <th className="p-3">When</th>
                <th className="p-3">Booking</th>
                <th className="p-3">Window</th>
                <th className="p-3">Channels</th>
                <th className="p-3 w-24"> </th>
              </tr>
            </thead>
            <tbody>
              {log.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-slate-400 font-bold">
                    {loading ? 'Loading…' : 'No automatic reminders logged yet.'}
                  </td>
                </tr>
              ) : (
                log.map((row) => (
                  <tr key={row.id} className="border-t border-slate-100">
                    <td className="p-3 text-slate-600 whitespace-nowrap">
                      {row.createdAt
                        ? new Date(row.createdAt as string | Date).toLocaleString()
                        : '—'}
                    </td>
                    <td className="p-3 font-mono text-xs font-bold">{row.bookingRef}</td>
                    <td className="p-3 font-bold">{row.windowLabel}</td>
                    <td className="p-3 text-xs text-slate-600">{row.channels}</td>
                    <td className="p-3">
                      <button
                        type="button"
                        title="Delete log row"
                        onClick={() => void deleteLogRow(row.id)}
                        className="p-2 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default BookingRemindersPanel;
