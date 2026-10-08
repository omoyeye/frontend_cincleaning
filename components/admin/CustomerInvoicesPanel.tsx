import React, { useState, useMemo } from 'react';
import {
  Plus, Search, Send, Edit2, Trash2, X, ChevronRight, FileText,
  Mail, Phone, AlertCircle, CheckCircle2, Clock, Ban, Eye, ChevronDown, CreditCard, Copy, Link,
  StickyNote, Lock,
} from 'lucide-react';
import { apiAdmin } from '../../services/api';
import type { Booking, ServiceConfig, Extra } from '../../types';

interface LineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  duration?: number;
  hourlyRate?: number;
}

interface CustomerInvoice {
  id: number;
  invoiceNumber: string;
  bookingId: number | null;
  customerId: number | null;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  items: LineItem[];
  subtotal: string;
  vatRate: string;
  vatAmount: string;
  total: string;
  status: string;
  /** Shown to the customer on the invoice and email. */
  notes: string | null;
  /** Private, admin-only. */
  adminNotes?: string | null;
  dueDate: string | null;
  paidAt: string | null;
  sentAt: string | null;
  sentVia: string | null;
  stripePaymentIntentId: string | null;
  stripePaymentUrl: string | null;
  createdAt: string | null;
}

interface Props {
  invoices: CustomerInvoice[];
  bookings: Booking[];
  services: ServiceConfig[];
  extraServices: Extra[];
  onRefresh: () => void;
  showFlyer: (msg: string, type: 'success' | 'error') => void;
}

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-700',
  sent: 'bg-blue-100 text-blue-700',
  paid: 'bg-emerald-100 text-emerald-700',
  overdue: 'bg-amber-100 text-amber-700',
  cancelled: 'bg-red-100 text-red-700',
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  draft: <FileText className="w-3.5 h-3.5" />,
  sent: <Send className="w-3.5 h-3.5" />,
  paid: <CheckCircle2 className="w-3.5 h-3.5" />,
  overdue: <AlertCircle className="w-3.5 h-3.5" />,
  cancelled: <Ban className="w-3.5 h-3.5" />,
};

const emptyItem = (): LineItem => ({ description: '', quantity: 1, unitPrice: 0, lineTotal: 0 });

const emptyForm = () => ({
  customerName: '',
  customerEmail: '',
  customerPhone: '',
  bookingId: null as number | null,
  customerId: null as number | null,
  items: [emptyItem()] as LineItem[],
  vatRate: 20,
  notes: '',
  adminNotes: '',
  dueDate: '',
  status: 'draft',
});

/** One-tap phrases for the customer note; tapping adds the line to the note. */
const NOTE_SUGGESTIONS = [
  'Payment due within 7 days.',
  'Please use the invoice number as your payment reference.',
  'Thank you for choosing us!',
  'Please leave the keys with reception.',
];

const NOTE_MAX = 2000;

type FormData = ReturnType<typeof emptyForm>;

const fmtDuration = (mins: number | undefined) => {
  if (!mins) return '';
  if (mins < 60) return `${mins}min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
};

export default function CustomerInvoicesPanel({ invoices, bookings, services, extraServices, onRefresh, showFlyer }: Props) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [sendingId, setSendingId] = useState<number | null>(null);
  const [sendVia, setSendVia] = useState<'email' | 'sms' | 'both'>('email');
  const [showSendModal, setShowSendModal] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<CustomerInvoice | null>(null);
  const [showFromBooking, setShowFromBooking] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [showServicePicker, setShowServicePicker] = useState(false);
  const [paymentLinkLoading, setPaymentLinkLoading] = useState<number | null>(null);
  const [showPaymentLink, setShowPaymentLink] = useState<{ url: string; invoiceNumber: string } | null>(null);

  const activeServices = useMemo(() => services.filter((s) => s.active), [services]);
  const activeExtras = useMemo(() => extraServices.filter((e: any) => e.active !== false), [extraServices]);

  const filtered = useMemo(() => {
    let list = invoices;
    if (statusFilter !== 'all') list = list.filter((i) => i.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (i) =>
          i.invoiceNumber.toLowerCase().includes(q) ||
          i.customerName.toLowerCase().includes(q) ||
          (i.customerEmail && i.customerEmail.toLowerCase().includes(q))
      );
    }
    return list;
  }, [invoices, statusFilter, search]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: invoices.length, draft: 0, sent: 0, paid: 0, overdue: 0, cancelled: 0 };
    invoices.forEach((i) => { c[i.status] = (c[i.status] || 0) + 1; });
    return c;
  }, [invoices]);

  const recalcTotals = (items: LineItem[], vatRate: number) => {
    const updated = items.map((li) => ({ ...li, lineTotal: +(li.quantity * li.unitPrice).toFixed(2) }));
    const subtotal = +updated.reduce((s, li) => s + li.lineTotal, 0).toFixed(2);
    const vatAmount = +(subtotal * vatRate / 100).toFixed(2);
    const total = +(subtotal + vatAmount).toFixed(2);
    return { items: updated, subtotal, vatAmount, total };
  };

  const updateItem = (idx: number, field: keyof LineItem, val: string | number) => {
    setForm((prev) => {
      const items = [...prev.items];
      items[idx] = { ...items[idx], [field]: field === 'description' ? val : Number(val) || 0 };
      const { items: recalced, ...rest } = recalcTotals(items, prev.vatRate);
      return { ...prev, items: recalced, ...rest } as any;
    });
  };

  const addItem = () => setForm((p) => ({ ...p, items: [...p.items, emptyItem()] }));
  const removeItem = (idx: number) =>
    setForm((p) => {
      const items = p.items.filter((_, i) => i !== idx);
      if (items.length === 0) items.push(emptyItem());
      const { items: recalced, ...rest } = recalcTotals(items, p.vatRate);
      return { ...p, items: recalced, ...rest } as any;
    });

  const addServiceItem = (svc: ServiceConfig) => {
    const rate = Number(svc.baseRate) || 0;
    const durationHrs = svc.minDuration || 2;
    const item: LineItem = {
      description: svc.name,
      quantity: durationHrs,
      unitPrice: rate,
      lineTotal: +(durationHrs * rate).toFixed(2),
      hourlyRate: svc.pricingModel === 'hourly' ? rate : undefined,
      duration: durationHrs * 60,
    };
    setForm((p) => {
      const items = p.items[0] && !p.items[0].description ? [item, ...p.items.slice(1)] : [...p.items, item];
      const { items: recalced, ...rest } = recalcTotals(items, p.vatRate);
      return { ...p, items: recalced, ...rest } as any;
    });
    setShowServicePicker(false);
  };

  const addExtraItem = (extra: Extra) => {
    const price = Number(extra.price) || 0;
    const isHourly = extra.type === 'hourly';
    const item: LineItem = {
      description: extra.name,
      quantity: 1,
      unitPrice: price,
      lineTotal: price,
      hourlyRate: isHourly ? price : undefined,
      duration: extra.duration || undefined,
    };
    setForm((p) => {
      const items = p.items[0] && !p.items[0].description ? [item, ...p.items.slice(1)] : [...p.items, item];
      const { items: recalced, ...rest } = recalcTotals(items, p.vatRate);
      return { ...p, items: recalced, ...rest } as any;
    });
    setShowServicePicker(false);
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm());
    setShowForm(true);
  };

  const openEdit = (inv: CustomerInvoice) => {
    setEditingId(inv.id);
    setForm({
      customerName: inv.customerName,
      customerEmail: inv.customerEmail || '',
      customerPhone: inv.customerPhone || '',
      bookingId: inv.bookingId,
      customerId: inv.customerId,
      items: (inv.items && inv.items.length > 0) ? inv.items : [emptyItem()],
      vatRate: Number(inv.vatRate) || 20,
      notes: inv.notes || '',
      adminNotes: inv.adminNotes || '',
      dueDate: inv.dueDate || '',
      status: inv.status,
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.customerName.trim()) return showFlyer('Customer name is required', 'error');
    if (form.items.every((li) => !li.description.trim())) return showFlyer('Add at least one line item', 'error');

    setSaving(true);
    try {
      const { items, subtotal, vatAmount, total } = recalcTotals(form.items, form.vatRate);
      const payload = {
        customerName: form.customerName,
        customerEmail: form.customerEmail || null,
        customerPhone: form.customerPhone || null,
        bookingId: form.bookingId,
        customerId: form.customerId,
        items,
        subtotal,
        vatRate: form.vatRate,
        vatAmount,
        total,
        notes: form.notes.trim() || null,
        adminNotes: form.adminNotes.trim() || null,
        dueDate: form.dueDate || null,
        status: form.status,
      };

      if (editingId) {
        await apiAdmin.updateCustomerInvoice(editingId, payload);
        showFlyer('Invoice updated', 'success');
      } else {
        await apiAdmin.createCustomerInvoice(payload);
        showFlyer('Invoice created', 'success');
      }
      setShowForm(false);
      onRefresh();
    } catch (e) {
      showFlyer(e instanceof Error ? e.message : 'Failed to save invoice', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (inv: Pick<CustomerInvoice, 'id' | 'invoiceNumber' | 'status' | 'customerName'>) => {
    const warning =
      inv.status === 'paid'
        ? `${inv.invoiceNumber} is marked PAID. Deleting it removes it from your records and the customer's account.\n\nDelete it anyway?`
        : `Delete invoice ${inv.invoiceNumber} for ${inv.customerName}? This cannot be undone.`;
    if (!confirm(warning)) return false;
    try {
      await apiAdmin.deleteCustomerInvoice(inv.id);
      showFlyer(`Invoice ${inv.invoiceNumber} deleted`, 'success');
      onRefresh();
      return true;
    } catch (e) {
      showFlyer(e instanceof Error ? e.message : 'Failed to delete invoice', 'error');
      return false;
    }
  };

  const handleSend = async () => {
    if (!selectedInvoice) return;
    setSendingId(selectedInvoice.id);
    try {
      await apiAdmin.sendCustomerInvoice(selectedInvoice.id, sendVia);
      showFlyer(`Invoice sent via ${sendVia}`, 'success');
      setShowSendModal(false);
      setSelectedInvoice(null);
      onRefresh();
    } catch (e) {
      showFlyer(e instanceof Error ? e.message : 'Failed to send invoice', 'error');
    } finally {
      setSendingId(null);
    }
  };

  const handleCreateFromBooking = async (bookingId: number) => {
    try {
      const result = await apiAdmin.createInvoiceFromBooking(bookingId);
      showFlyer(`Invoice ${result.invoiceNumber} created from booking`, 'success');
      setShowFromBooking(false);
      onRefresh();
    } catch (e) {
      showFlyer('Failed to create invoice from booking', 'error');
    }
  };

  const handleMarkPaid = async (inv: CustomerInvoice) => {
    try {
      await apiAdmin.updateCustomerInvoice(inv.id, { status: 'paid' });
      showFlyer('Invoice marked as paid', 'success');
      onRefresh();
    } catch {
      showFlyer('Failed to update invoice', 'error');
    }
  };

  const handlePreview = async (inv: CustomerInvoice) => {
    setPreviewLoading(true);
    try {
      const html = await apiAdmin.previewCustomerInvoice(inv.id);
      setPreviewHtml(html);
    } catch (e) {
      showFlyer('Failed to load preview', 'error');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleGeneratePaymentLink = async (inv: CustomerInvoice) => {
    if (inv.stripePaymentUrl) {
      setShowPaymentLink({ url: inv.stripePaymentUrl, invoiceNumber: inv.invoiceNumber });
      return;
    }
    setPaymentLinkLoading(inv.id);
    try {
      const result = await apiAdmin.createPaymentIntent(inv.id);
      if (result.alreadyPaid) {
        showFlyer('This invoice is already paid', 'success');
        onRefresh();
        return;
      }
      if (result.payUrl) {
        setShowPaymentLink({ url: result.payUrl, invoiceNumber: inv.invoiceNumber });
        showFlyer('Payment link generated', 'success');
        onRefresh();
      }
    } catch (e) {
      showFlyer(e instanceof Error ? e.message : 'Failed to generate payment link', 'error');
    } finally {
      setPaymentLinkLoading(null);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => showFlyer('Copied to clipboard', 'success'));
  };

  const computed = useMemo(() => {
    const { items, subtotal, vatAmount, total } = recalcTotals(form.items, form.vatRate);
    return { subtotal, vatAmount, total };
  }, [form.items, form.vatRate]);

  // ── Render ──

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h3 className="text-3xl font-black text-slate-900 tracking-tight">Customer Invoices</h3>
          <p className="text-sm font-medium text-slate-500 mt-1 max-w-2xl">
            Create, edit and send invoices to customers — including walk-ins, referrals, and bookings.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowFromBooking(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 text-slate-700 rounded-xl text-sm font-bold hover:bg-slate-200 transition-colors"
          >
            <FileText className="w-4 h-4" /> From Booking
          </button>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition-colors shadow-lg shadow-blue-600/20"
          >
            <Plus className="w-4 h-4" /> New Invoice
          </button>
        </div>
      </div>

      {/* Status Tabs + Search */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex gap-1 overflow-x-auto no-scrollbar">
          {(['all', 'draft', 'sent', 'paid', 'overdue', 'cancelled'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize whitespace-nowrap transition-colors ${
                statusFilter === s ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {s} ({counts[s] || 0})
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search invoices..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-sm w-full md:w-64 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
      </div>

      {/* Invoice List */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-slate-200">
          <FileText className="w-12 h-12 mx-auto text-slate-300 mb-3" />
          <p className="text-slate-500 font-medium">No invoices found</p>
          <p className="text-sm text-slate-400 mt-1">Create your first invoice to get started.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left px-5 py-3 font-bold text-slate-600">Invoice #</th>
                  <th className="text-left px-5 py-3 font-bold text-slate-600">Customer</th>
                  <th className="text-left px-5 py-3 font-bold text-slate-600 hidden md:table-cell">Date</th>
                  <th className="text-right px-5 py-3 font-bold text-slate-600">Total</th>
                  <th className="text-center px-5 py-3 font-bold text-slate-600">Status</th>
                  <th className="text-right px-5 py-3 font-bold text-slate-600">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((inv) => (
                  <tr key={inv.id} className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                    <td className="px-5 py-3.5 font-mono font-bold text-slate-800">{inv.invoiceNumber}</td>
                    <td className="px-5 py-3.5">
                      <div className="font-semibold text-slate-800">{inv.customerName}</div>
                      {inv.customerEmail && <div className="text-xs text-slate-400">{inv.customerEmail}</div>}
                      {(inv.notes || inv.adminNotes) && (
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {inv.notes && (
                            <span title={inv.notes} className="inline-flex max-w-[16rem] items-center gap-1 rounded-md bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-700">
                              <StickyNote className="w-3 h-3 shrink-0" /> <span className="truncate">{inv.notes}</span>
                            </span>
                          )}
                          {inv.adminNotes && (
                            <span title={inv.adminNotes} className="inline-flex max-w-[16rem] items-center gap-1 rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
                              <Lock className="w-3 h-3 shrink-0" /> <span className="truncate">{inv.adminNotes}</span>
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-slate-500 hidden md:table-cell">
                      {inv.createdAt ? new Date(inv.createdAt).toLocaleDateString('en-GB') : '—'}
                    </td>
                    <td className="px-5 py-3.5 text-right font-bold text-slate-800">
                      &pound;{Number(inv.total).toFixed(2)}
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold capitalize ${STATUS_COLORS[inv.status] || STATUS_COLORS.draft}`}>
                        {STATUS_ICONS[inv.status]} {inv.status}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center justify-end gap-1">
                        {inv.status !== 'paid' && inv.status !== 'cancelled' && (
                          <button
                            onClick={() => handleMarkPaid(inv)}
                            title="Mark as paid"
                            className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 transition-colors"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => handlePreview(inv)}
                          title="Preview email"
                          className="p-1.5 rounded-lg text-violet-600 hover:bg-violet-50 transition-colors"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {inv.status !== 'paid' && inv.status !== 'cancelled' && (
                          <button
                            onClick={() => handleGeneratePaymentLink(inv)}
                            title={inv.stripePaymentUrl ? 'View payment link' : 'Generate payment link'}
                            disabled={paymentLinkLoading === inv.id}
                            className={`p-1.5 rounded-lg transition-colors ${inv.stripePaymentUrl ? 'text-green-600 hover:bg-green-50' : 'text-amber-600 hover:bg-amber-50'}`}
                          >
                            <CreditCard className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => { setSelectedInvoice(inv); setSendVia('email'); setShowSendModal(true); }}
                          title="Send invoice"
                          className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 transition-colors"
                        >
                          <Send className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => openEdit(inv)}
                          title="Edit"
                          className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => void handleDelete(inv)}
                          title="Delete invoice"
                          aria-label={`Delete invoice ${inv.invoiceNumber}`}
                          className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create/Edit Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-[60] flex items-start justify-center pt-8 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 mb-8 animate-in fade-in slide-in-from-bottom-4">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h4 className="text-lg font-black text-slate-900">{editingId ? 'Edit Invoice' : 'New Invoice'}</h4>
              <button onClick={() => setShowForm(false)} className="p-2 rounded-lg hover:bg-slate-100"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-5">
              {/* Customer Details */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Customer Name *</label>
                  <input
                    type="text"
                    value={form.customerName}
                    onChange={(e) => setForm((p) => ({ ...p, customerName: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500"
                    placeholder="John Smith"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Email</label>
                  <input
                    type="email"
                    value={form.customerEmail}
                    onChange={(e) => setForm((p) => ({ ...p, customerEmail: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500"
                    placeholder="john@example.com"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Phone</label>
                  <input
                    type="tel"
                    value={form.customerPhone}
                    onChange={(e) => setForm((p) => ({ ...p, customerPhone: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500"
                    placeholder="07900..."
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Due Date</label>
                  <input
                    type="date"
                    value={form.dueDate}
                    onChange={(e) => setForm((p) => ({ ...p, dueDate: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Status</label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="draft">Draft</option>
                    <option value="sent">Sent</option>
                    <option value="paid">Paid</option>
                    <option value="overdue">Overdue</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
              </div>

              {/* Line Items */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold text-slate-600">Line Items</label>
                  <div className="flex gap-2">
                    <div className="relative">
                      <button
                        onClick={() => setShowServicePicker(!showServicePicker)}
                        className="text-xs font-bold text-teal-600 hover:text-teal-700 flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-teal-50 transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" /> From Services <ChevronDown className="w-3 h-3" />
                      </button>
                      {showServicePicker && (
                        <div className="absolute right-0 top-full mt-1 w-72 bg-white border border-slate-200 rounded-xl shadow-xl z-20 max-h-80 overflow-y-auto">
                          {activeServices.length > 0 && (
                            <>
                              <div className="px-3 py-2 text-[10px] font-black text-slate-400 uppercase tracking-wider bg-slate-50 rounded-t-xl">Services</div>
                              {activeServices.map((svc) => (
                                <button
                                  key={`svc-${svc.id}`}
                                  onClick={() => addServiceItem(svc)}
                                  className="w-full text-left px-3 py-2.5 hover:bg-blue-50 border-b border-slate-100 last:border-0 transition-colors"
                                >
                                  <div className="font-semibold text-sm text-slate-800">{svc.name}</div>
                                  <div className="text-xs text-slate-400 mt-0.5">
                                    {svc.pricingModel === 'hourly' ? `£${Number(svc.baseRate).toFixed(2)}/hr` : `£${Number(svc.baseRate).toFixed(2)} flat`}
                                    {svc.minDuration ? ` · ${svc.minDuration}h min` : ''}
                                  </div>
                                </button>
                              ))}
                            </>
                          )}
                          {activeExtras.length > 0 && (
                            <>
                              <div className="px-3 py-2 text-[10px] font-black text-slate-400 uppercase tracking-wider bg-slate-50">Extra Services</div>
                              {activeExtras.map((ext) => (
                                <button
                                  key={`ext-${ext.id}`}
                                  onClick={() => addExtraItem(ext)}
                                  className="w-full text-left px-3 py-2.5 hover:bg-blue-50 border-b border-slate-100 last:border-0 transition-colors"
                                >
                                  <div className="font-semibold text-sm text-slate-800">{ext.name}</div>
                                  <div className="text-xs text-slate-400 mt-0.5">
                                    £{Number(ext.price).toFixed(2)}{ext.type === 'hourly' ? '/hr' : ''}
                                    {ext.duration ? ` · ${fmtDuration(ext.duration)}` : ''}
                                  </div>
                                </button>
                              ))}
                            </>
                          )}
                          {activeServices.length === 0 && activeExtras.length === 0 && (
                            <div className="px-3 py-4 text-sm text-slate-400 text-center">No services configured</div>
                          )}
                        </div>
                      )}
                    </div>
                    <button onClick={addItem} className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-blue-50 transition-colors">
                      <Plus className="w-3.5 h-3.5" /> Manual
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="grid grid-cols-12 gap-2 text-xs font-bold text-slate-500 px-1">
                    <span className="col-span-4">Description</span>
                    <span className="col-span-1 text-center">Hrs/Qty</span>
                    <span className="col-span-2 text-right">Rate/Price</span>
                    <span className="col-span-2 text-center">Duration</span>
                    <span className="col-span-2 text-right">Total</span>
                    <span className="col-span-1"></span>
                  </div>
                  {form.items.map((item, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                      <input
                        type="text"
                        value={item.description}
                        onChange={(e) => updateItem(idx, 'description', e.target.value)}
                        placeholder="Service description"
                        className="col-span-4 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                      />
                      <input
                        type="number"
                        min="0.5"
                        step="0.5"
                        value={item.quantity}
                        onChange={(e) => updateItem(idx, 'quantity', e.target.value)}
                        className="col-span-1 px-1 py-2 border border-slate-200 rounded-lg text-sm text-center focus:ring-2 focus:ring-blue-500"
                      />
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.unitPrice || ''}
                        onChange={(e) => updateItem(idx, 'unitPrice', e.target.value)}
                        placeholder="0.00"
                        className="col-span-2 px-2 py-2 border border-slate-200 rounded-lg text-sm text-right focus:ring-2 focus:ring-blue-500"
                      />
                      <div className="col-span-2 text-center">
                        {item.duration ? (
                          <span className="text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded-md">{fmtDuration(item.duration)}</span>
                        ) : (
                          <input
                            type="number"
                            min="0"
                            step="15"
                            value={item.duration || ''}
                            onChange={(e) => updateItem(idx, 'duration' as any, e.target.value)}
                            placeholder="min"
                            className="w-full px-1 py-2 border border-slate-200 rounded-lg text-sm text-center focus:ring-2 focus:ring-blue-500"
                          />
                        )}
                      </div>
                      <span className="col-span-2 text-sm font-bold text-slate-700 text-right">
                        &pound;{(item.quantity * item.unitPrice).toFixed(2)}
                      </span>
                      <button
                        onClick={() => removeItem(idx)}
                        className="col-span-1 p-1.5 rounded-lg text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                        title="Remove"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Totals */}
              <div className="bg-slate-50 rounded-xl p-4">
                <div className="flex items-center gap-3 mb-3">
                  <label className="text-xs font-bold text-slate-600">VAT Rate (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={form.vatRate}
                    onChange={(e) => setForm((p) => ({ ...p, vatRate: Number(e.target.value) || 0 }))}
                    className="w-20 px-2 py-1 border border-slate-200 rounded-lg text-sm text-center focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="space-y-1 text-sm text-right">
                  <div className="text-slate-500">Subtotal: <span className="font-bold text-slate-700">&pound;{computed.subtotal.toFixed(2)}</span></div>
                  <div className="text-slate-500">VAT ({form.vatRate}%): <span className="font-bold text-slate-700">&pound;{computed.vatAmount.toFixed(2)}</span></div>
                  <div className="text-lg font-black text-slate-900 pt-1 border-t border-slate-200 mt-1">
                    Total: &pound;{computed.total.toFixed(2)}
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-4 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <label htmlFor="invoice-customer-note" className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                    <StickyNote className="w-3.5 h-3.5 text-blue-600" /> Note / instructions for the customer
                  </label>
                  <span className="text-[10px] font-bold text-slate-400">{form.notes.length}/{NOTE_MAX}</span>
                </div>
                <p className="text-[11px] text-slate-500">Printed on the invoice and in the invoice email.</p>
                <textarea
                  id="invoice-customer-note"
                  value={form.notes}
                  maxLength={NOTE_MAX}
                  onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                  rows={3}
                  placeholder="e.g. Payment due within 7 days. Please use the invoice number as your reference."
                  className="w-full px-3 py-2 border border-slate-200 bg-white rounded-xl text-sm focus:ring-2 focus:ring-blue-500"
                />
                <div className="flex flex-wrap gap-1.5">
                  {NOTE_SUGGESTIONS.map((line) => (
                    <button
                      key={line}
                      type="button"
                      disabled={form.notes.includes(line)}
                      onClick={() =>
                        setForm((p) => ({ ...p, notes: (p.notes.trim() ? `${p.notes.trim()}\n${line}` : line).slice(0, NOTE_MAX) }))
                      }
                      className="rounded-lg border border-blue-200 bg-white px-2 py-1 text-[11px] font-bold text-blue-700 hover:bg-blue-50 disabled:opacity-40"
                    >
                      + {line}
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-amber-100 bg-amber-50/40 p-4 space-y-2">
                <label htmlFor="invoice-admin-note" className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                  <Lock className="w-3.5 h-3.5 text-amber-600" /> Private note (admin only)
                </label>
                <p className="text-[11px] text-slate-500">Never shown to the customer. Use it for reminders, e.g. why a discount was given.</p>
                <textarea
                  id="invoice-admin-note"
                  value={form.adminNotes}
                  maxLength={NOTE_MAX}
                  onChange={(e) => setForm((p) => ({ ...p, adminNotes: e.target.value }))}
                  rows={2}
                  placeholder="e.g. Agreed 10% off by phone, chase on Friday."
                  className="w-full px-3 py-2 border border-slate-200 bg-white rounded-xl text-sm focus:ring-2 focus:ring-amber-500"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-2xl">
              {editingId && (() => {
                const current = invoices.find((i) => i.id === editingId);
                return current ? (
                  <button
                    type="button"
                    onClick={async () => {
                      if (await handleDelete(current)) setShowForm(false);
                    }}
                    className="mr-auto inline-flex items-center gap-1.5 px-3 py-2 text-sm font-bold text-red-600 rounded-xl hover:bg-red-50"
                  >
                    <Trash2 className="w-4 h-4" /> Delete invoice
                  </button>
                ) : null;
              })()}
              <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm font-bold text-slate-600 hover:text-slate-800">
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-lg shadow-blue-600/20"
              >
                {saving ? 'Saving...' : editingId ? 'Update Invoice' : 'Create Invoice'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Send Modal */}
      {showSendModal && selectedInvoice && (
        <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 animate-in fade-in zoom-in-95">
            <div className="px-6 py-4 border-b border-slate-200">
              <h4 className="text-lg font-black text-slate-900">Send Invoice</h4>
              <p className="text-sm text-slate-500 mt-1">
                Send <span className="font-bold">{selectedInvoice.invoiceNumber}</span> to {selectedInvoice.customerName}
              </p>
            </div>
            <div className="p-6 space-y-4">
              <div className="space-y-2">
                {[
                  { val: 'email' as const, icon: <Mail className="w-4 h-4" />, label: 'Email', detail: selectedInvoice.customerEmail || 'No email' },
                  { val: 'sms' as const, icon: <Phone className="w-4 h-4" />, label: 'SMS', detail: selectedInvoice.customerPhone || 'No phone' },
                  { val: 'both' as const, icon: <Send className="w-4 h-4" />, label: 'Both', detail: 'Email + SMS' },
                ].map((opt) => (
                  <label
                    key={opt.val}
                    className={`flex items-center gap-3 p-3.5 rounded-xl border-2 cursor-pointer transition-all ${
                      sendVia === opt.val ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-slate-300'
                    } ${
                      (opt.val === 'email' && !selectedInvoice.customerEmail) ||
                      (opt.val === 'sms' && !selectedInvoice.customerPhone)
                        ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                  >
                    <input
                      type="radio"
                      name="sendVia"
                      value={opt.val}
                      checked={sendVia === opt.val}
                      onChange={() => setSendVia(opt.val)}
                      disabled={
                        (opt.val === 'email' && !selectedInvoice.customerEmail) ||
                        (opt.val === 'sms' && !selectedInvoice.customerPhone)
                      }
                      className="sr-only"
                    />
                    <span className={`p-2 rounded-lg ${sendVia === opt.val ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-500'}`}>
                      {opt.icon}
                    </span>
                    <div>
                      <div className="font-bold text-sm text-slate-800">{opt.label}</div>
                      <div className="text-xs text-slate-400">{opt.detail}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-2xl">
              <button onClick={() => { setShowSendModal(false); setSelectedInvoice(null); }} className="px-4 py-2 text-sm font-bold text-slate-600">
                Cancel
              </button>
              <button
                onClick={handleSend}
                disabled={sendingId !== null}
                className="px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {sendingId ? 'Sending...' : 'Send Invoice'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {previewHtml && (
        <div className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl h-[85vh] flex flex-col animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
              <h4 className="text-lg font-black text-slate-900">Invoice Email Preview</h4>
              <button onClick={() => setPreviewHtml(null)} className="p-2 rounded-lg hover:bg-slate-100">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-hidden p-4 bg-slate-100">
              <iframe
                srcDoc={previewHtml}
                className="w-full h-full rounded-lg border border-slate-200 bg-white"
                sandbox="allow-same-origin"
                title="Invoice preview"
              />
            </div>
          </div>
        </div>
      )}

      {/* Payment Link Modal */}
      {showPaymentLink && (
        <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h4 className="text-lg font-black text-slate-900">Payment Link</h4>
              <button onClick={() => setShowPaymentLink(null)} className="p-2 rounded-lg hover:bg-slate-100">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-slate-600">
                Payment link for invoice <span className="font-bold">{showPaymentLink.invoiceNumber}</span>:
              </p>
              <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200">
                <Link className="w-4 h-4 text-slate-400 shrink-0" />
                <span className="text-sm text-slate-700 truncate flex-1 font-mono">{showPaymentLink.url}</span>
                <button
                  onClick={() => copyToClipboard(showPaymentLink.url)}
                  className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 shrink-0"
                  title="Copy link"
                >
                  <Copy className="w-4 h-4" />
                </button>
              </div>
              <p className="text-xs text-slate-400">
                Share this link with the customer. They can pay securely via Stripe.
                The link is also included in the invoice email when sent.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* From Booking Modal */}
      {showFromBooking && (
        <div className="fixed inset-0 bg-black/40 z-[60] flex items-start justify-center pt-8 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 mb-8 animate-in fade-in slide-in-from-bottom-4">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h4 className="text-lg font-black text-slate-900">Create Invoice from Booking</h4>
              <button onClick={() => setShowFromBooking(false)} className="p-2 rounded-lg hover:bg-slate-100"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 max-h-[60vh] overflow-y-auto space-y-2">
              {bookings.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-8">No bookings available</p>
              ) : (
                bookings.slice(0, 50).map((b) => (
                  <button
                    key={b.id}
                    onClick={() => handleCreateFromBooking(b.id)}
                    className="w-full flex items-center justify-between p-3.5 rounded-xl border border-slate-200 hover:bg-slate-50 hover:border-blue-300 transition-all text-left"
                  >
                    <div>
                      <div className="font-bold text-sm text-slate-800">
                        {(b as any).bookingId || `#${b.id}`} — {b.contactName}
                      </div>
                      <div className="text-xs text-slate-400">
                        {b.serviceType} | {b.date} | &pound;{Number(b.totalPrice).toFixed(2)}
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400" />
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Click-away for service picker */}
      {showServicePicker && (
        <div className="fixed inset-0 z-10" onClick={() => setShowServicePicker(false)} />
      )}
    </div>
  );
}
