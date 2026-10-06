import React, { useMemo, useRef } from 'react';
import { Download, Printer } from 'lucide-react';
import BrandLogoMark from './BrandLogoMark';
import { useFlyer } from './Flyer';
import { useBusinessBrand } from '../src/hooks/useBusinessBrand';
import { useBusinessSettings } from '../src/context/BusinessSettingsContext';
import { printInvoiceElement } from '../src/utils/invoicePrint';

type StaffInvoiceJob = {
  id?: string;
  date?: string;
  customer?: string;
  bookedHours?: number;
  yourHours?: number;
  hourlyRate?: number;
  yourShare?: number;
  hours?: number;
  clientJobTotal?: number | null;
};

type StaffInvoiceBank = {
  bankName?: string;
  accountNumber?: string;
  sortCode?: string;
};

type StaffIdentity = {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  postcode?: string | null;
};

interface Props {
  invoiceId: number | string;
  weekLabel: string;
  weekStart?: string | null;
  weekEnd?: string | null;
  createdAt?: string;
  status?: string;
  adminNotes?: string | null;
  totalAmount: number;
  weekTotalHours: number;
  weekJobCount: number;
  jobs: StaffInvoiceJob[];
  bankDetails?: StaffInvoiceBank | null;
  staff: StaffIdentity;
}

const StaffInvoiceDocument: React.FC<Props> = ({
  invoiceId,
  weekLabel,
  weekStart,
  weekEnd,
  createdAt,
  status,
  adminNotes,
  totalAmount,
  weekTotalHours,
  weekJobCount,
  jobs,
  bankDetails,
  staff,
}) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const { showFlyer } = useFlyer();
  const brandName = useBusinessBrand();
  const {
    email: companyEmail,
    phone: companyPhone,
    address: companyAddress,
  } = useBusinessSettings();

  const invoiceLabel = useMemo(() => `STF-INV-${invoiceId}`, [invoiceId]);
  const issueDate = useMemo(
    () => (createdAt ? new Date(createdAt).toLocaleDateString() : new Date().toLocaleDateString()),
    [createdAt]
  );
  const periodLabel = useMemo(() => {
    if (weekStart || weekEnd) return `${weekStart || '-'} to ${weekEnd || '-'}`;
    return weekLabel || 'Weekly period';
  }, [weekStart, weekEnd, weekLabel]);

  const runPrint = () => {
    if (!rootRef.current) return;
    printInvoiceElement(rootRef.current);
  };

  const runDownload = () => {
    if (!rootRef.current) return;
    printInvoiceElement(rootRef.current, () => {
      showFlyer('In print dialog, choose Save as PDF / Microsoft Print to PDF.', 'success');
    });
  };

  return (
    <div ref={rootRef} className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
      <div className="no-print mb-5 flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          onClick={runPrint}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-black uppercase tracking-widest text-slate-700 hover:bg-slate-100"
        >
          <Printer className="h-4 w-4" />
          Print
        </button>
        <button
          type="button"
          onClick={runDownload}
          className="inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-black uppercase tracking-widest text-blue-700 hover:bg-blue-100"
        >
          <Download className="h-4 w-4" />
          Download PDF
        </button>
      </div>

      <div className="mb-6 flex items-start justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <p className="text-2xl font-black text-slate-900">STAFF INVOICE</p>
          <p className="text-xs font-black uppercase tracking-widest text-slate-400 mt-1">{invoiceLabel}</p>
          <p className="text-xs font-bold text-slate-500 mt-2">Issue date: {issueDate}</p>
          <p className="text-xs font-bold text-slate-500">Invoice period: {periodLabel}</p>
        </div>
        <div className="text-right">
          <BrandLogoMark className="ml-auto h-16 w-auto max-w-[260px] object-contain object-right" />
          <p className="text-sm font-black text-blue-600 mt-2">{brandName}</p>
          {companyAddress ? <p className="text-xs font-medium text-slate-500 mt-1 whitespace-pre-wrap">{companyAddress}</p> : null}
          {(companyEmail || companyPhone) ? (
            <p className="text-xs font-medium text-slate-500 mt-1">{[companyEmail, companyPhone].filter(Boolean).join(' · ')}</p>
          ) : null}
        </div>
      </div>

      <div className="mb-5 grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Staff details</p>
          <p className="text-base font-black text-slate-900 mt-1">{staff.name || '-'}</p>
          {staff.email ? <p className="text-xs font-medium text-slate-600 mt-1">{staff.email}</p> : null}
          {staff.phone ? <p className="text-xs font-medium text-slate-600">{staff.phone}</p> : null}
          {(staff.address || staff.postcode) ? (
            <p className="text-xs font-medium text-slate-600 mt-1">{[staff.address, staff.postcode].filter(Boolean).join(', ')}</p>
          ) : null}
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Bank details</p>
          <p className="text-sm font-bold text-slate-700 mt-1">{bankDetails?.bankName || '-'}</p>
          <p className="text-xs font-medium text-slate-600 mt-1">
            A/C: {bankDetails?.accountNumber || '-'} · Sort: {bankDetails?.sortCode || '-'}
          </p>
        </div>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-slate-200 p-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Amount</p>
          <p className="text-lg font-black text-slate-900">£{Number(totalAmount || 0).toFixed(2)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 p-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Hours</p>
          <p className="text-lg font-black text-slate-900">{Number(weekTotalHours || 0).toFixed(2)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 p-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Jobs</p>
          <p className="text-lg font-black text-slate-900">{weekJobCount}</p>
        </div>
        <div className="rounded-xl border border-slate-200 p-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Status</p>
          <p className="text-lg font-black text-slate-900">{status || 'Pending'}</p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-500">
              <th className="p-3">Job ID</th>
              <th className="p-3">Date</th>
              <th className="p-3">Customer</th>
              <th className="p-3 text-right">Booked Hrs</th>
              <th className="p-3 text-right">Your Hrs</th>
              <th className="p-3 text-right">Rate</th>
              <th className="p-3 text-right">Share</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((j, idx) => (
              <tr key={`${j.id || 'job'}-${idx}`} className="border-b border-slate-50 last:border-0">
                <td className="p-3 font-mono text-xs">{j.id || '-'}</td>
                <td className="p-3 font-bold">{j.date || '-'}</td>
                <td className="p-3">{j.customer || '-'}</td>
                <td className="p-3 text-right tabular-nums">{Number(j.bookedHours || 0).toFixed(2)}</td>
                <td className="p-3 text-right tabular-nums">{Number(j.yourHours ?? j.hours ?? 0).toFixed(2)}</td>
                <td className="p-3 text-right tabular-nums">£{Number(j.hourlyRate || 0).toFixed(2)}</td>
                <td className="p-3 text-right font-black text-emerald-700">£{Number(j.yourShare || 0).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 text-right">
        <p className="text-xs font-black uppercase tracking-widest text-slate-400">Total payable</p>
        <p className="text-2xl font-black text-slate-900">£{Number(totalAmount || 0).toFixed(2)}</p>
      </div>

      {adminNotes ? (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Admin notes</p>
          <p className="mt-1 text-sm font-medium text-slate-700 whitespace-pre-wrap">{adminNotes}</p>
        </div>
      ) : null}
    </div>
  );
};

export default StaffInvoiceDocument;
