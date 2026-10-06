import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Trash2, Download, Search, Camera, Upload, X, Receipt, Calendar, ChevronDown, Eye, Edit2 } from 'lucide-react';
import { apiAdmin } from '../../services/api';

interface Expense {
  id: number;
  title: string;
  amount: string;
  category: string;
  purpose: string | null;
  receiptUrl: string | null;
  expenseDate: string;
  createdAt: string;
}

const CATEGORIES = [
  'Cleaning Supplies',
  'Equipment',
  'Transport',
  'Office',
  'Marketing',
  'Insurance',
  'Utilities',
  'Uniforms',
  'Training',
  'Maintenance',
  'Food & Refreshments',
  'Other',
];

export default function ExpenseTracker() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterMonth, setFilterMonth] = useState('');
  const [viewingReceipt, setViewingReceipt] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('Cleaning Supplies');
  const [purpose, setPurpose] = useState('');
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().slice(0, 10));
  const [expenseTime, setExpenseTime] = useState(new Date().toTimeString().slice(0, 5));
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const fetchExpenses = useCallback(async () => {
    try {
      const data = await apiAdmin.getExpenses();
      setExpenses(data);
    } catch {
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchExpenses(); }, [fetchExpenses]);

  const resetForm = () => {
    setTitle('');
    setAmount('');
    setCategory('Cleaning Supplies');
    setPurpose('');
    setExpenseDate(new Date().toISOString().slice(0, 10));
    setExpenseTime(new Date().toTimeString().slice(0, 5));
    setReceiptPreview(null);
    setEditingId(null);
  };

  const openEdit = (e: Expense) => {
    setTitle(e.title);
    setAmount(e.amount);
    setCategory(e.category);
    setPurpose(e.purpose || '');
    setExpenseDate(e.expenseDate.slice(0, 10));
    setExpenseTime(e.expenseDate.length > 10 ? e.expenseDate.slice(11, 16) : '12:00');
    setReceiptPreview(e.receiptUrl);
    setEditingId(e.id);
    setShowForm(true);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      alert('File is too large. Maximum 5MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setReceiptPreview(reader.result as string);
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleSubmit = async () => {
    if (!title.trim() || !amount.trim() || !expenseDate) return;
    setSaving(true);
    try {
      const dateWithTime = `${expenseDate} ${expenseTime || '12:00'}`;
      const payload = {
        title: title.trim(),
        amount: amount.trim(),
        category,
        purpose: purpose.trim() || undefined,
        receiptUrl: receiptPreview || undefined,
        expenseDate: dateWithTime,
      };
      if (editingId) {
        await apiAdmin.updateExpense(editingId, payload);
      } else {
        await apiAdmin.createExpense(payload as any);
      }
      resetForm();
      setShowForm(false);
      await fetchExpenses();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save expense');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this expense entry?')) return;
    try {
      await apiAdmin.deleteExpense(id);
      setExpenses((prev) => prev.filter((e) => e.id !== id));
    } catch {}
  };

  const downloadCsv = () => {
    const rows = filtered.map((e) => ({
      Date: e.expenseDate,
      Title: e.title,
      Category: e.category,
      Amount: `${e.amount}`,
      Purpose: e.purpose || '',
      'Has Receipt': e.receiptUrl ? 'Yes' : 'No',
    }));
    const headers = Object.keys(rows[0] || {});
    const csvContent = [
      headers.join(','),
      ...rows.map((r) => headers.map((h) => `"${String((r as any)[h]).replace(/"/g, '""')}"`).join(',')),
    ].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `expenses-${filterMonth || 'all'}-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filtered = expenses.filter((e) => {
    if (search && !e.title.toLowerCase().includes(search.toLowerCase()) && !e.purpose?.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterCategory && e.category !== filterCategory) return false;
    if (filterMonth && !e.expenseDate.startsWith(filterMonth)) return false;
    return true;
  });

  const totalFiltered = filtered.reduce((s, e) => s + parseFloat(e.amount || '0'), 0);

  const uniqueMonths = [...new Set(expenses.map((e) => e.expenseDate.slice(0, 7)))].sort().reverse();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">Expense Tracker</h2>
          <p className="text-sm text-slate-500 mt-1">Track purchases, receipts, and business costs</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={downloadCsv}
            disabled={filtered.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 text-sm font-bold text-slate-700 hover:bg-slate-200 transition-colors disabled:opacity-40"
          >
            <Download className="w-4 h-4" /> Export CSV
          </button>
          <button
            onClick={() => { resetForm(); setShowForm(true); }}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 text-sm font-bold text-white hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" /> Add Expense
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Expenses</p>
          <p className="text-2xl font-black text-slate-900 mt-1">{expenses.length}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Spent</p>
          <p className="text-2xl font-black text-blue-600 mt-1">
            {'£'}{expenses.reduce((s, e) => s + parseFloat(e.amount || '0'), 0).toFixed(2)}
          </p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">This Month</p>
          <p className="text-2xl font-black text-emerald-600 mt-1">
            {'£'}{expenses
              .filter((e) => e.expenseDate.startsWith(new Date().toISOString().slice(0, 7)))
              .reduce((s, e) => s + parseFloat(e.amount || '0'), 0)
              .toFixed(2)}
          </p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">With Receipts</p>
          <p className="text-2xl font-black text-amber-600 mt-1">
            {expenses.filter((e) => e.receiptUrl).length}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search expenses..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <div className="relative">
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="appearance-none pl-4 pr-10 py-2.5 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
          >
            <option value="">All Categories</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        </div>
        <div className="relative">
          <select
            value={filterMonth}
            onChange={(e) => setFilterMonth(e.target.value)}
            className="appearance-none pl-4 pr-10 py-2.5 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
          >
            <option value="">All Months</option>
            {uniqueMonths.map((m) => (
              <option key={m} value={m}>
                {new Date(m + '-01').toLocaleDateString(undefined, { year: 'numeric', month: 'long' })}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        </div>
      </div>

      {/* Filtered total */}
      {(search || filterCategory || filterMonth) && (
        <div className="flex items-center justify-between bg-blue-50 rounded-xl px-4 py-3 border border-blue-100">
          <span className="text-sm font-semibold text-blue-700">
            {filtered.length} result{filtered.length !== 1 ? 's' : ''} matching filters
          </span>
          <span className="text-sm font-black text-blue-800">
            Total: {'£'}{totalFiltered.toFixed(2)}
          </span>
        </div>
      )}

      {/* Expense list */}
      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <Receipt className="w-12 h-12 mx-auto text-slate-300 mb-4" />
          <p className="text-slate-500 font-medium">
            {expenses.length === 0 ? 'No expenses recorded yet' : 'No expenses match your filters'}
          </p>
          {expenses.length === 0 && (
            <button
              onClick={() => { resetForm(); setShowForm(true); }}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700"
            >
              <Plus className="w-4 h-4" /> Add your first expense
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((expense) => (
            <div
              key={expense.id}
              className="bg-white rounded-2xl border border-slate-200 p-4 hover:border-slate-300 transition-colors"
            >
              <div className="flex items-start gap-4">
                {/* Receipt thumbnail */}
                <div
                  className={`shrink-0 w-14 h-14 rounded-xl flex items-center justify-center ${
                    expense.receiptUrl ? 'cursor-pointer hover:opacity-80' : ''
                  } bg-slate-100`}
                  onClick={() => expense.receiptUrl && setViewingReceipt(expense.receiptUrl)}
                >
                  {expense.receiptUrl ? (
                    <img
                      src={expense.receiptUrl}
                      alt="Receipt"
                      className="w-14 h-14 rounded-xl object-cover"
                    />
                  ) : (
                    <Receipt className="w-6 h-6 text-slate-400" />
                  )}
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="font-bold text-slate-900 truncate">{expense.title}</h3>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                          {expense.category}
                        </span>
                        <span className="text-xs text-slate-400 flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {new Date(expense.expenseDate).toLocaleDateString(undefined, {
                            year: 'numeric', month: 'short', day: 'numeric',
                          })}
                          {expense.expenseDate.length > 10 && (
                            <> at {expense.expenseDate.slice(11, 16)}</>
                          )}
                        </span>
                      </div>
                      {expense.purpose && (
                        <p className="text-xs text-slate-500 mt-1 line-clamp-2">{expense.purpose}</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-lg font-black text-slate-900">
                        {'£'}{parseFloat(expense.amount).toFixed(2)}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-1 shrink-0">
                  {expense.receiptUrl && (
                    <button
                      onClick={() => setViewingReceipt(expense.receiptUrl!)}
                      className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-blue-600 transition-colors"
                      title="View receipt"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={() => openEdit(expense)}
                    className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-amber-600 transition-colors"
                    title="Edit"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(expense.id)}
                    className="p-2 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit form modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
          <div
            className="bg-white rounded-3xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-6 pb-4 border-b border-slate-100">
              <h3 className="text-lg font-black text-slate-900">
                {editingId ? 'Edit Expense' : 'Add Expense'}
              </h3>
              <button
                onClick={() => setShowForm(false)}
                className="p-2 rounded-xl hover:bg-slate-100 text-slate-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {/* Title */}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  Title / Description *
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Cleaning supplies from Tesco"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Amount + Category */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    Amount ({'£'}) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    Category
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              {/* Date + Time */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    Date *
                  </label>
                  <input
                    type="date"
                    value={expenseDate}
                    onChange={(e) => setExpenseDate(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    Time
                  </label>
                  <input
                    type="time"
                    value={expenseTime}
                    onChange={(e) => setExpenseTime(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Purpose */}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  Purpose
                </label>
                <textarea
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  placeholder="What was this purchase for?"
                  rows={3}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>

              {/* Receipt upload */}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  Receipt
                </label>
                {receiptPreview ? (
                  <div className="relative inline-block">
                    <img
                      src={receiptPreview}
                      alt="Receipt preview"
                      className="w-full max-h-48 object-contain rounded-xl border border-slate-200"
                    />
                    <button
                      onClick={() => setReceiptPreview(null)}
                      className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center shadow-lg hover:bg-red-600"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-3">
                    <button
                      onClick={() => cameraInputRef.current?.click()}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-6 rounded-xl border-2 border-dashed border-slate-200 text-sm font-semibold text-slate-500 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50/50 transition-all"
                    >
                      <Camera className="w-5 h-5" />
                      Take Photo
                    </button>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-6 rounded-xl border-2 border-dashed border-slate-200 text-sm font-semibold text-slate-500 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50/50 transition-all"
                    >
                      <Upload className="w-5 h-5" />
                      Upload File
                    </button>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="flex gap-3 p-6 pt-4 border-t border-slate-100">
              <button
                onClick={() => setShowForm(false)}
                className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={!title.trim() || !amount.trim() || !expenseDate || saving}
                className="flex-1 px-4 py-2.5 rounded-xl bg-blue-600 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-40 transition-colors"
              >
                {saving ? 'Saving...' : editingId ? 'Update Expense' : 'Save Expense'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Receipt viewer modal */}
      {viewingReceipt && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
          onClick={() => setViewingReceipt(null)}
        >
          <div className="relative max-w-3xl max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setViewingReceipt(null)}
              className="absolute -top-3 -right-3 w-8 h-8 bg-white rounded-full flex items-center justify-center shadow-lg text-slate-600 hover:text-red-500 z-10"
            >
              <X className="w-5 h-5" />
            </button>
            <img
              src={viewingReceipt}
              alt="Receipt"
              className="max-w-full max-h-[85vh] rounded-2xl object-contain shadow-2xl"
            />
          </div>
        </div>
      )}
    </div>
  );
}
