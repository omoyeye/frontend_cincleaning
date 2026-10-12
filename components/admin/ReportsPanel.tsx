import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FileBarChart,
  RefreshCw,
  Settings,
  Printer,
  Download,
  Mail,
  Sparkles,
  Trash2,
  TrendingUp,
  TrendingDown,
  Minus,
  CalendarRange,
  AlertTriangle,
  X,
  Users,
  PoundSterling,
  Star,
  ClipboardList,
  CalendarCheck,
  Info,
} from 'lucide-react';
import type { BusinessReport, BusinessReportSummary, ReportFigures, ReportKpi, ReportSettings } from '../../types';
import { apiAdmin } from '../../services/api';
import { printInvoiceElement } from '../../src/utils/invoicePrint';

interface Props {
  onNotify: (message: string, type?: 'success' | 'error') => void;
}

const money = (n: number | null | undefined) => `£${(Number(n) || 0).toFixed(2)}`;

function formatKpi(unit: ReportKpi['unit'], v: number | null): string {
  if (v === null || v === undefined) return '-';
  if (unit === 'money') return money(v);
  if (unit === 'percent') return `${v}%`;
  if (unit === 'rating') return v.toFixed(1);
  return String(v);
}

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Quick ranges for Generate now (Monday-based weeks, like the automatic report). */
function presets() {
  const today = new Date();
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const lastMon = new Date(monday);
  lastMon.setDate(monday.getDate() - 7);
  const lastSun = new Date(monday);
  lastSun.setDate(monday.getDate() - 1);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);
  return [
    { id: 'lastWeek', label: 'Last week', start: ymd(lastMon), end: ymd(lastSun) },
    { id: 'thisWeek', label: 'This week so far', start: ymd(monday), end: ymd(today) },
    { id: 'thisMonth', label: 'This month so far', start: ymd(monthStart), end: ymd(today) },
    { id: 'lastMonth', label: 'Last month', start: ymd(lastMonthStart), end: ymd(lastMonthEnd) },
  ];
}

function Change({ kpi }: { kpi: ReportKpi }) {
  if (kpi.value === null || kpi.previous === null) return <span className="text-xs text-slate-400">No comparison</span>;
  const diff = Math.round((kpi.value - kpi.previous) * 100) / 100;
  if (diff === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-bold text-slate-500">
        <Minus className="h-3.5 w-3.5" /> Same as before
      </span>
    );
  }
  const good = diff > 0 === kpi.higherIsBetter;
  const Icon = diff > 0 ? TrendingUp : TrendingDown;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-black ${good ? 'text-emerald-600' : 'text-red-600'}`}>
      <Icon className="h-3.5 w-3.5" />
      {diff > 0 ? '+' : '-'}
      {formatKpi(kpi.unit, Math.abs(diff))} vs previous
    </span>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm break-inside-avoid">
      <h4 className="mb-3 flex items-center gap-2 text-sm font-black text-slate-900">
        <span className="text-blue-600">{icon}</span> {title}
      </h4>
      {children}
    </section>
  );
}

function Row({ label, value, sub, strong }: { label: string; value: React.ReactNode; sub?: string; strong?: boolean; key?: React.Key }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 py-1.5 ${strong ? 'border-t border-slate-100 pt-2.5 mt-1' : ''}`}>
      <span className={`text-sm ${strong ? 'font-black text-slate-900' : 'text-slate-600'}`}>
        {label}
        {sub ? <span className="block text-[11px] font-medium text-slate-400">{sub}</span> : null}
      </span>
      <span className={`tabular-nums ${strong ? 'text-lg font-black text-slate-900' : 'text-sm font-bold text-slate-900'}`}>{value}</span>
    </div>
  );
}

function Bars({ items, max }: { items: { label: string; value: number; note: string }[]; max: number }) {
  if (!items.length) return <p className="text-sm text-slate-400">Nothing in this period.</p>;
  return (
    <ul className="space-y-2">
      {items.map((i) => (
        <li key={i.label}>
          <div className="flex justify-between gap-2 text-sm">
            <span className="truncate font-bold text-slate-700">{i.label}</span>
            <span className="shrink-0 tabular-nums text-slate-500">{i.note}</span>
          </div>
          <div className="mt-1 h-2 rounded-full bg-slate-100">
            <div className="h-2 rounded-full bg-blue-500" style={{ width: `${Math.max(4, (i.value / Math.max(1, max)) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

const ReportsPanel: React.FC<Props> = ({ onNotify }) => {
  const [list, setList] = useState<BusinessReportSummary[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [report, setReport] = useState<BusinessReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [busy, setBusy] = useState<'generate' | 'ai' | 'email' | null>(null);
  const [showGenerate, setShowGenerate] = useState(false);
  const [range, setRange] = useState(() => presets()[0]);
  const [custom, setCustom] = useState<{ start: string; end: string }>(() => ({ start: presets()[0].start, end: presets()[0].end }));
  const [settings, setSettings] = useState<ReportSettings | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  const loadList = useCallback(async (selectFirst = false) => {
    try {
      const rows = await apiAdmin.getReports();
      setList(rows);
      if (selectFirst && rows.length) setSelectedId((cur) => cur ?? rows[0].id);
    } catch (e) {
      onNotify(e instanceof Error ? e.message : 'Could not load reports', 'error');
    } finally {
      setListLoading(false);
    }
  }, [onNotify]);

  useEffect(() => {
    void loadList(true);
    apiAdmin.getReportSettings().then(setSettings).catch(() => {});
  }, [loadList]);

  useEffect(() => {
    if (!selectedId) {
      setReport(null);
      return;
    }
    let alive = true;
    setReportLoading(true);
    apiAdmin
      .getReport(selectedId)
      .then((r) => alive && setReport(r))
      .catch((e) => onNotify(e instanceof Error ? e.message : 'Could not load the report', 'error'))
      .finally(() => alive && setReportLoading(false));
    return () => {
      alive = false;
    };
  }, [selectedId, onNotify]);

  const generate = async () => {
    const r = range.id === 'custom' ? custom : range;
    if (!r.start || !r.end || r.start > r.end) {
      onNotify('Choose a start date before the end date.', 'error');
      return;
    }
    setBusy('generate');
    try {
      const created = await apiAdmin.generateReport({ start: r.start, end: r.end });
      setShowGenerate(false);
      await loadList();
      setSelectedId(created.id);
      setReport(created);
      onNotify(`Report ready: ${created.data.period.label}.`);
    } catch (e) {
      onNotify(e instanceof Error ? e.message : 'Could not build the report', 'error');
    } finally {
      setBusy(null);
    }
  };

  const rewriteAi = async () => {
    if (!report) return;
    setBusy('ai');
    try {
      const r = await apiAdmin.rewriteReportSummary(report.id);
      setReport(r);
      void loadList();
      onNotify('Summary updated.');
    } catch (e) {
      onNotify(e instanceof Error ? e.message : 'Could not write the summary', 'error');
    } finally {
      setBusy(null);
    }
  };

  const emailNow = async () => {
    if (!report) return;
    setBusy('email');
    try {
      const r = await apiAdmin.emailReport(report.id);
      onNotify(`Report emailed to ${r.sentTo.join(', ')}.`);
      void loadList();
    } catch (e) {
      onNotify(e instanceof Error ? e.message : 'Could not email the report', 'error');
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!report || !window.confirm(`Delete the report for ${report.data.period.label}?`)) return;
    try {
      await apiAdmin.deleteReport(report.id);
      setSelectedId(null);
      await loadList();
      onNotify('Report deleted.');
    } catch (e) {
      onNotify(e instanceof Error ? e.message : 'Could not delete the report', 'error');
    }
  };

  /** Spreadsheet of every figure (for an accountant or your own records). */
  const exportCsv = () => {
    if (!report) return;
    const c = report.data.current;
    const p = report.data.previous;
    const rows: (string | number | null)[][] = [['Section', 'Figure', 'This period', 'Previous period']];
    const add = (section: string, label: string, a: number | null, b: number | null) => rows.push([section, label, a, b]);
    report.data.kpis.forEach((k) => add('Headline', k.label, k.value, k.previous));
    add('Money', 'Invoices paid', c.money.invoicesPaidTotal, p.money.invoicesPaidTotal);
    add('Money', 'Card deposits paid', c.money.depositsPaidTotal, p.money.depositsPaidTotal);
    add('Money', 'Staff pay', c.money.staffPay, p.money.staffPay);
    add('Money', 'Expenses', c.money.expensesTotal, p.money.expensesTotal);
    Object.entries(c.money.expensesByCategory).forEach(([k, v]) => add('Expenses', k, Number(v), p.money.expensesByCategory[k] ?? 0));
    add('Bookings', 'Scheduled', c.bookings.scheduled, p.bookings.scheduled);
    add('Bookings', 'Short-notice cancellations', c.bookings.shortNoticeCancellations, p.bookings.shortNoticeCancellations);
    add('Bookings', 'Returning clients', c.bookings.returningClients, p.bookings.returningClients);
    c.bookings.byService.forEach((s) => add('Services (value)', s.service, s.value, null));
    add('Sales', 'Quotes sent', c.sales.quotesSent, p.sales.quotesSent);
    add('Sales', 'Quotes accepted', c.sales.quotesAccepted, p.sales.quotesAccepted);
    add('Quality', 'Compliments', c.quality.compliments, p.quality.compliments);
    add('Quality', 'Complaints', c.quality.complaints, p.quality.complaints);
    add('Quality', 'Late notices', c.quality.lateNotices, p.quality.lateNotices);
    c.team.forEach((t) => add('Team (hours)', t.name, t.hours, null));
    const csv = rows.map((r) => r.map((v) => (v === null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v))).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `report-${report.periodStart}-to-${report.periodEnd}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const saveSettings = async (next: ReportSettings) => {
    try {
      const s = await apiAdmin.saveReportSettings({ aiEnabled: next.aiEnabled, emailEnabled: next.emailEnabled, recipients: next.recipients });
      setSettings((prev) => ({ ...(prev || next), ...s }));
      onNotify('Report settings saved.');
      setShowSettings(false);
    } catch (e) {
      onNotify(e instanceof Error ? e.message : 'Could not save settings', 'error');
    }
  };

  const c: ReportFigures | null = report?.data.current ?? null;
  const serviceMax = useMemo(() => Math.max(1, ...(c?.bookings.byService.map((s) => s.value) ?? [1])), [c]);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <h3 className="text-3xl font-black tracking-tight text-slate-900">Reports</h3>
          <p className="mt-1 text-sm font-medium text-slate-500">
            A full business report arrives every Monday at 7am for the week before. Build one for any dates whenever you like.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setShowGenerate(true)} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-black text-white shadow-sm hover:bg-blue-700">
            <CalendarRange className="h-4 w-4" /> Generate report
          </button>
          <button type="button" onClick={() => setShowSettings(true)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50">
            <Settings className="h-4 w-4" /> Settings
          </button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        {/* Report history */}
        <aside className="space-y-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Saved reports</p>
          {listLoading ? (
            <p className="text-sm text-slate-400">Loading…</p>
          ) : list.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-4 text-sm text-slate-500">
              No reports yet. The first one arrives next Monday, or press Generate report.
            </div>
          ) : (
            <>
              <select className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold lg:hidden" value={selectedId ?? ''} onChange={(e) => setSelectedId(Number(e.target.value))} aria-label="Choose a report">
                {list.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                    {r.kind === 'custom' ? ' (custom)' : ''}
                  </option>
                ))}
              </select>
              <ul className="hidden max-h-[70vh] space-y-1.5 overflow-y-auto pr-1 lg:block">
                {list.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(r.id)}
                      className={`w-full rounded-xl border px-3 py-2.5 text-left transition-colors ${selectedId === r.id ? 'border-blue-300 bg-blue-50' : 'border-slate-100 bg-white hover:bg-slate-50'}`}
                    >
                      <p className="text-sm font-black text-slate-900">{r.label}</p>
                      <p className="mt-0.5 text-[11px] font-medium text-slate-500">
                        {money(r.headline.moneyReceived)} received · {r.headline.completedJobs ?? 0} jobs
                      </p>
                      <div className="mt-1 flex gap-1">
                        {r.kind === 'custom' ? <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">Custom</span> : null}
                        {r.hasAi ? <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-bold text-violet-700">AI summary</span> : null}
                        {r.emailedAt ? <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">Emailed</span> : null}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </aside>

        {/* Report */}
        <div className="min-w-0">
          {reportLoading && !report ? (
            <div className="p-10 text-center text-sm font-bold text-slate-400">Loading report…</div>
          ) : !report || !c ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center">
              <FileBarChart className="mx-auto mb-3 h-10 w-10 text-slate-300" />
              <p className="font-black text-slate-700">Choose or generate a report</p>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 className="text-xl font-black text-slate-900">{report.data.period.label}</h4>
                  <p className="text-xs font-medium text-slate-500">
                    {report.kind === 'weekly' ? 'Weekly report' : `Custom report (${report.data.period.days} days)`} · generated{' '}
                    {report.generatedAt ? new Date(report.generatedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
                    {report.createdBy === 'automatic' ? ' automatically' : ''}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button type="button" onClick={() => printRef.current && printInvoiceElement(printRef.current)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50">
                    <Printer className="h-4 w-4" /> Print / PDF
                  </button>
                  <button type="button" onClick={exportCsv} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50">
                    <Download className="h-4 w-4" /> CSV
                  </button>
                  <button type="button" onClick={() => void emailNow()} disabled={busy === 'email'} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                    <Mail className="h-4 w-4" /> {busy === 'email' ? 'Sending…' : 'Email'}
                  </button>
                  <button type="button" onClick={() => void remove()} className="inline-flex items-center rounded-lg border border-slate-200 bg-white p-2 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label="Delete report">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div ref={printRef} className="space-y-5">
                {/* Printed copy shows the period at the top */}
                <div className="hidden print:block">
                  <h2 className="text-2xl font-black">Business report: {report.data.period.label}</h2>
                </div>

                {/* AI commentary */}
                <section className="rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 to-white p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="flex items-center gap-2 text-sm font-black text-violet-900">
                      <Sparkles className="h-4 w-4" /> Summary
                      <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-bold text-violet-700">Written by AI from the figures below</span>
                    </h4>
                    <button type="button" onClick={() => void rewriteAi()} disabled={busy === 'ai'} className="no-print inline-flex items-center gap-1.5 rounded-lg border border-violet-200 bg-white px-2.5 py-1.5 text-[11px] font-black text-violet-700 hover:bg-violet-50 disabled:opacity-50">
                      <RefreshCw className={`h-3.5 w-3.5 ${busy === 'ai' ? 'animate-spin' : ''}`} /> {report.ai ? 'Rewrite' : 'Write summary'}
                    </button>
                  </div>
                  {report.ai ? (
                    <div className="mt-3 space-y-3 text-sm leading-relaxed text-slate-700">
                      <p>{report.ai.summary}</p>
                      {report.ai.watchOut.length ? (
                        <div>
                          <p className="font-black text-slate-900">Watch out for</p>
                          <ul className="mt-1 list-disc space-y-1 pl-5">{report.ai.watchOut.map((w) => <li key={w}>{w}</li>)}</ul>
                        </div>
                      ) : null}
                      {report.ai.actions.length ? (
                        <div>
                          <p className="font-black text-slate-900">Suggested actions</p>
                          <ol className="mt-1 list-decimal space-y-1 pl-5">{report.ai.actions.map((a) => <li key={a}>{a}</li>)}</ol>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-slate-600">
                      {settings && settings.aiAvailable === false
                        ? 'AI summaries need the Anthropic API key on the server (ANTHROPIC_API_KEY). The figures below are complete without it.'
                        : 'No summary yet. Press Write summary, or turn AI summaries on in Settings.'}
                    </p>
                  )}
                </section>

                {/* Headline figures */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
                  {report.data.kpis.map((k) => (
                    <div key={k.key} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm break-inside-avoid">
                      <p className="text-[11px] font-black uppercase tracking-wider text-slate-400">{k.label}</p>
                      <p className="mt-1 text-2xl font-black tabular-nums text-slate-900">{formatKpi(k.unit, k.value)}</p>
                      <div className="mt-1"><Change kpi={k} /></div>
                      <p className="mt-0.5 text-[11px] text-slate-400">4-period average {formatKpi(k.unit, k.average4)}</p>
                    </div>
                  ))}
                </div>

                <div className="grid gap-4 xl:grid-cols-2">
                  <Section icon={<PoundSterling className="h-4 w-4" />} title="Money">
                    <Row label="Invoices paid" sub={`${c.money.invoicesPaidCount} invoice${c.money.invoicesPaidCount === 1 ? '' : 's'}`} value={money(c.money.invoicesPaidTotal)} />
                    <Row label="Card deposits paid" sub={`${c.money.depositsPaidCount} booking${c.money.depositsPaidCount === 1 ? '' : 's'}`} value={money(c.money.depositsPaidTotal)} />
                    <Row label="Money received" value={money(c.money.moneyReceived)} strong />
                    <Row label="Staff pay (completed jobs)" value={c.money.staffPay ? `-${money(c.money.staffPay)}` : money(0)} />
                    <Row label="Expenses" value={c.money.expensesTotal ? `-${money(c.money.expensesTotal)}` : money(0)} />
                    {Object.entries(c.money.expensesByCategory).map(([k, v]) => (
                      <Row key={k} label={`  ${k}`} value={money(v)} />
                    ))}
                    <Row label="Profit" value={<span className={c.money.profit < 0 ? 'text-red-600' : 'text-emerald-600'}>{money(c.money.profit)}</span>} strong />
                    <p className="mt-2 text-[11px] text-slate-400">
                      Value of completed jobs: {money(c.money.completedValue)} (average {money(c.money.averageJobValue)} a job).
                    </p>
                  </Section>

                  <Section icon={<CalendarCheck className="h-4 w-4" />} title="Bookings">
                    <Row label="Jobs completed" value={c.bookings.completed} />
                    <Row label="Jobs scheduled" value={c.bookings.scheduled} />
                    <Row label="Cancellations" sub={c.bookings.shortNoticeCancellations ? `${c.bookings.shortNoticeCancellations} short notice (fee agreed)` : undefined} value={c.bookings.cancelled} />
                    <Row label="New bookings made" sub={`worth ${money(c.bookings.newBookingsValue)}`} value={c.bookings.newBookingsMade} />
                    <Row label="New clients" value={c.bookings.newClients} />
                    <Row label="Returning clients" value={c.bookings.returningClients} />
                    <p className="mb-2 mt-3 text-xs font-black uppercase tracking-wider text-slate-400">By service (completed)</p>
                    <Bars items={c.bookings.byService.map((s) => ({ label: s.service, value: s.value, note: `${s.jobs} · ${money(s.value)}` }))} max={serviceMax} />
                    <p className="mb-2 mt-3 text-xs font-black uppercase tracking-wider text-slate-400">By area</p>
                    <Bars
                      items={[
                        { label: 'Greater London', value: c.bookings.byArea.london.value, note: `${c.bookings.byArea.london.jobs} · ${money(c.bookings.byArea.london.value)}` },
                        { label: 'Outside London', value: c.bookings.byArea.outsideLondon.value, note: `${c.bookings.byArea.outsideLondon.jobs} · ${money(c.bookings.byArea.outsideLondon.value)}` },
                      ].filter((a) => a.value > 0 || c.bookings.completed === 0)}
                      max={Math.max(c.bookings.byArea.london.value, c.bookings.byArea.outsideLondon.value)}
                    />
                  </Section>

                  <Section icon={<ClipboardList className="h-4 w-4" />} title="Sales">
                    <Row label="Quote requests" sub={c.sales.unfinishedQuoteRequests ? `+ ${c.sales.unfinishedQuoteRequests} left unfinished` : undefined} value={c.sales.quoteRequests} />
                    <Row label="Quotes sent" sub={`worth ${money(c.sales.quotesSentValue)}`} value={c.sales.quotesSent} />
                    <Row label="Quotes accepted" value={c.sales.quotesAccepted} />
                    <Row label="Requests won" value={c.sales.converted} />
                    <Row label="Requests lost" value={c.sales.lost} />
                    <Row label="Win rate" value={c.sales.conversionRate === null ? '-' : `${c.sales.conversionRate}%`} strong />
                  </Section>

                  <Section icon={<Star className="h-4 w-4" />} title="Quality">
                    <Row label="Average client rating" sub={`${c.quality.reviews} review${c.quality.reviews === 1 ? '' : 's'}`} value={c.quality.averageRating === null ? '-' : c.quality.averageRating.toFixed(1)} />
                    <Row label="Compliments (4 to 5 stars)" value={c.quality.compliments} />
                    <Row label="Complaints (1 to 2 stars)" value={<span className={c.quality.complaints ? 'text-red-600' : ''}>{c.quality.complaints}</span>} />
                    <Row label="On-time arrivals" sub={c.quality.timedJobs ? `${c.quality.timedJobs} timed job${c.quality.timedJobs === 1 ? '' : 's'}` : 'no clock-ins recorded'} value={c.quality.onTimePercent === null ? '-' : `${c.quality.onTimePercent}%`} />
                    <Row label="Running-late notices" value={c.quality.lateNotices} />
                    <Row label="Supervisor score" sub={`${c.quality.assessments} assessment${c.quality.assessments === 1 ? '' : 's'}`} value={c.quality.supervisorScore === null ? '-' : c.quality.supervisorScore.toFixed(1)} />
                  </Section>
                </div>

                <Section icon={<Users className="h-4 w-4" />} title="Team">
                  {c.team.length === 0 ? (
                    <p className="text-sm text-slate-400">No completed jobs in this period.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[520px] text-sm">
                        <thead>
                          <tr className="text-left text-[11px] font-black uppercase tracking-wider text-slate-400">
                            <th className="py-2">Cleaner</th>
                            <th className="py-2 text-right">Jobs</th>
                            <th className="py-2 text-right">Hours</th>
                            <th className="py-2 text-right">Pay</th>
                            <th className="py-2 text-right">Rating</th>
                            <th className="py-2 text-right">On time</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {c.team.map((t) => (
                            <tr key={t.name}>
                              <td className="py-2 font-bold capitalize text-slate-900">{t.name}</td>
                              <td className="py-2 text-right tabular-nums">{t.jobs}</td>
                              <td className="py-2 text-right tabular-nums">{t.hours}</td>
                              <td className="py-2 text-right tabular-nums">{money(t.pay)}</td>
                              <td className="py-2 text-right tabular-nums">{t.averageRating === null ? '-' : t.averageRating.toFixed(1)}</td>
                              <td className="py-2 text-right tabular-nums">{t.onTimePercent === null ? '-' : `${t.onTimePercent}%`}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Section>

                <div className="grid gap-4 md:grid-cols-2">
                  <Section icon={<CalendarRange className="h-4 w-4" />} title="Next 7 days">
                    <Row label="Bookings" value={report.data.nextWeek.bookings} />
                    <Row label="Expected value" value={money(report.data.nextWeek.expectedValue)} />
                    <Row label="Without a cleaner" value={<span className={report.data.nextWeek.unassigned ? 'text-red-600' : ''}>{report.data.nextWeek.unassigned}</span>} />
                  </Section>
                  <Section icon={<AlertTriangle className="h-4 w-4" />} title="Needs attention">
                    <Row label="Unpaid invoices" sub={money(report.data.attention.unpaidInvoicesTotal)} value={report.data.attention.unpaidInvoices} />
                    <Row label="Quote requests waiting over 24h" value={report.data.attention.quoteRequestsWaitingOver24h} />
                  </Section>
                </div>

                {report.data.notes.length ? (
                  <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                    <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                    <ul className="space-y-1">{report.data.notes.map((n) => <li key={n}>{n}</li>)}</ul>
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Generate */}
      {showGenerate ? (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Generate report">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => !busy && setShowGenerate(false)} />
          <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-black text-slate-900">Generate a report</h3>
              <button type="button" onClick={() => setShowGenerate(false)} className="rounded-lg p-1.5 hover:bg-slate-100" aria-label="Close"><X className="h-5 w-5 text-slate-400" /></button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[...presets(), { id: 'custom', label: 'Choose dates', start: custom.start, end: custom.end }].map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setRange(p)}
                  className={`rounded-xl border px-3 py-2.5 text-left text-sm font-bold ${range.id === p.id ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                >
                  {p.label}
                  {p.id !== 'custom' ? <span className="block text-[11px] font-medium text-slate-400">{p.start} to {p.end}</span> : null}
                </button>
              ))}
            </div>
            {range.id === 'custom' ? (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <label className="text-xs font-bold text-slate-500">From<input type="date" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" value={custom.start} onChange={(e) => setCustom((c2) => ({ ...c2, start: e.target.value }))} /></label>
                <label className="text-xs font-bold text-slate-500">To<input type="date" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" value={custom.end} onChange={(e) => setCustom((c2) => ({ ...c2, end: e.target.value }))} /></label>
              </div>
            ) : null}
            <p className="mt-3 text-xs text-slate-500">A Monday to Sunday week replaces that week's saved report. Any other range is saved as a custom report.</p>
            <button type="button" onClick={() => void generate()} disabled={busy === 'generate'} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 text-sm font-black text-white hover:bg-blue-700 disabled:opacity-50">
              <FileBarChart className="h-4 w-4" /> {busy === 'generate' ? 'Building report…' : 'Build report'}
            </button>
          </div>
        </div>
      ) : null}

      {/* Settings */}
      {showSettings && settings ? (
        <SettingsDialog settings={settings} onClose={() => setShowSettings(false)} onSave={saveSettings} />
      ) : null}
    </div>
  );
};

function SettingsDialog({ settings, onClose, onSave }: { settings: ReportSettings; onClose: () => void; onSave: (s: ReportSettings) => Promise<void> }) {
  const [s, setS] = useState(settings);
  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Report settings">
      <div className="absolute inset-0 bg-slate-900/50" onClick={onClose} />
      <div className="relative w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-black text-slate-900">Report settings</h3>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 hover:bg-slate-100" aria-label="Close"><X className="h-5 w-5 text-slate-400" /></button>
        </div>
        <label className="flex items-start justify-between gap-3">
          <span>
            <span className="block text-sm font-black text-slate-900">AI summary</span>
            <span className="text-xs text-slate-500">
              Plain-English summary, watch-outs and three actions, written from the totals only. No client names or contact details are sent.
              {settings.aiAvailable === false ? ' Needs ANTHROPIC_API_KEY on the server.' : ''}
            </span>
          </span>
          <input type="checkbox" className="mt-1 h-5 w-5" checked={s.aiEnabled} onChange={(e) => setS({ ...s, aiEnabled: e.target.checked })} />
        </label>
        <label className="flex items-start justify-between gap-3">
          <span>
            <span className="block text-sm font-black text-slate-900">Email every Monday</span>
            <span className="text-xs text-slate-500">Sent at about 7am with the headline figures and summary.</span>
          </span>
          <input type="checkbox" className="mt-1 h-5 w-5" checked={s.emailEnabled} onChange={(e) => setS({ ...s, emailEnabled: e.target.checked })} />
        </label>
        <label className="block">
          <span className="text-xs font-bold text-slate-500">Send to (comma separated)</span>
          <input
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
            value={s.recipients}
            placeholder={settings.defaultRecipients || 'owner@example.com'}
            onChange={(e) => setS({ ...s, recipients: e.target.value })}
          />
          <span className="mt-1 block text-[11px] text-slate-400">Leave empty to use {settings.defaultRecipients || 'the business email'}.</span>
        </label>
        <button type="button" onClick={() => void onSave(s)} className="w-full rounded-xl bg-slate-900 py-3 text-sm font-black text-white hover:bg-slate-800">
          Save settings
        </button>
      </div>
    </div>
  );
}

export default ReportsPanel;
