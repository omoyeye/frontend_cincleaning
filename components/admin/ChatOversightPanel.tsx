import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, CalendarDays, Lock, MapPin, Megaphone, MessageCircle, MessagesSquare, Search, Send, Unlock, Users } from 'lucide-react';
import { Booking, BookingStatus, type ChatSummary, type Staff } from '../../types';
import { apiAdmin } from '../../services/api';
import { subscribeNnSync } from '../../services/realtime';
import { useFlyer } from '../Flyer';
import { Avatar, Card, PILL, Pill, Segmented, StatCard } from './marketing/MarketingUi';

type View = 'clients' | 'team';
type ClientFilter = 'attention' | 'live' | 'open' | 'quiet' | 'closed';

type ChatMsg = { id: string; senderName: string; senderRole: string; text: string; timestamp: string };
type DirectMessage = {
  id: number;
  senderUserId: number;
  senderName: string;
  senderRole: string;
  recipientUserId: number;
  text: string;
  isRead: boolean;
  createdAt: string;
};

const LIVE_MS = 15 * 60 * 1000;

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return 'now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const y = new Date();
  y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

const roleLabel = (role: string) => (role === 'customer' ? 'Client' : role === 'staff' ? 'Cleaner' : 'Office');

function groupByDay<T>(items: T[], at: (t: T) => string) {
  const out: Array<{ day: string; items: T[] }> = [];
  for (const it of items) {
    const day = dayLabel(at(it));
    const last = out[out.length - 1];
    if (last && last.day === day) last.items.push(it);
    else out.push({ day, items: [it] });
  }
  return out;
}

/** Message composer with Enter to send and optional quick replies. */
function Composer({
  disabled,
  placeholder,
  quickReplies,
  onSend,
  note,
}: {
  disabled?: boolean;
  placeholder: string;
  quickReplies?: string[];
  onSend: (text: string) => Promise<void>;
  note?: string;
}) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const send = async (value = text) => {
    const v = value.trim();
    if (!v || busy) return;
    setBusy(true);
    try {
      await onSend(v);
      setText('');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="border-t border-slate-200 bg-white p-3 sm:p-4">
      {quickReplies?.length && !disabled ? (
        <div className="-mx-1 mb-2 flex gap-1.5 overflow-x-auto no-scrollbar px-1">
          {quickReplies.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => setText(q)}
              className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-bold text-slate-600 hover:border-blue-300 hover:text-blue-700"
            >
              {q}
            </button>
          ))}
        </div>
      ) : null}
      <div className="flex items-end gap-2">
        <textarea
          rows={1}
          value={text}
          disabled={disabled}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder={placeholder}
          className="max-h-32 min-h-[44px] flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm outline-none focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60"
        />
        <button
          type="button"
          onClick={() => void send()}
          disabled={disabled || busy || !text.trim()}
          aria-label="Send"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-40"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
      {note ? <p className="mt-1.5 text-[11px] text-slate-400">{note}</p> : null}
    </div>
  );
}

/* ───────────────────────── Client chats ───────────────────────── */

type Conversation = {
  booking: Booking;
  closed: boolean;
  msgCount: number;
  lastAt: string | null;
  lastText: string | null;
  lastSenderName: string | null;
  lastSenderRole: string | null;
  needsReply: boolean;
  live: boolean;
  staffNames: string[];
};

const ClientThread: React.FC<{ conv: Conversation; adminName?: string; onBack: () => void }> = ({ conv, adminName, onBack }) => {
  const { showFlyer } = useFlyer();
  const b = conv.booking;
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [closed, setClosed] = useState(conv.closed);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const p = await apiAdmin.getBookingChat(String(b.id));
      setMessages(p?.messages || []);
      setClosed(Boolean(p?.chatClosedByAdmin));
    } catch {
      /* keep what we have */
    } finally {
      setLoading(false);
    }
  }, [b.id]);

  useEffect(() => {
    setLoading(true);
    setMessages([]);
    void load();
    const t = setInterval(() => void load(), 8000);
    const off = subscribeNnSync(() => void load());
    return () => {
      clearInterval(t);
      off();
    };
  }, [load]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length]);

  const toggleClosed = async () => {
    try {
      if (closed) await apiAdmin.reopenBookingChat(String(b.id));
      else await apiAdmin.closeBookingChat(String(b.id));
      showFlyer(closed ? 'Chat reopened.' : 'Chat ended. The client and cleaner can no longer send messages.', 'success');
      await load();
    } catch (e) {
      showFlyer(e instanceof Error ? e.message : 'Could not update the chat', 'error');
    }
  };

  const groups = groupByDay<ChatMsg>(messages, (m) => m.timestamp);
  const cancelled = b.status === BookingStatus.CANCELLED;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-start gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <button type="button" onClick={onBack} className="-ml-1 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 lg:hidden" aria-label="Back to chats">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <Avatar name={b.contact?.name || 'Client'} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-black text-slate-900">{b.contact?.name || 'Client'}</p>
            {closed ? <Pill tone={PILL.slate}>Ended</Pill> : conv.live ? <Pill tone={PILL.green}>Live</Pill> : null}
          </div>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="h-3 w-3" /> {b.date} · {b.time}
            </span>
            <span className="inline-flex min-w-0 items-center gap-1">
              <MapPin className="h-3 w-3" /> <span className="truncate">{[b.address?.line1, b.address?.postcode].filter(Boolean).join(', ')}</span>
            </span>
          </p>
          <p className="mt-0.5 truncate text-xs text-slate-500">
            {b.serviceType} · {conv.staffNames.length ? `Cleaner: ${conv.staffNames.join(', ')}` : 'No cleaner assigned'}
            {b.bookingId ? ` · ${b.bookingId}` : ''}
          </p>
        </div>
        <button
          type="button"
          disabled={cancelled}
          onClick={() => void toggleClosed()}
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition disabled:opacity-40 ${
            closed ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'bg-red-50 text-red-600 hover:bg-red-100'
          }`}
        >
          {closed ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
          <span className="hidden sm:inline">{closed ? 'Reopen chat' : 'End chat'}</span>
        </button>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-slate-50 px-4 py-4">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600" />
          </div>
        ) : messages.length === 0 ? (
          <div className="py-14 text-center">
            <MessageCircle className="mx-auto h-10 w-10 text-slate-300" />
            <p className="mt-2 text-sm font-bold text-slate-500">No messages yet</p>
            <p className="text-xs text-slate-400">The chat opens for the client and cleaner shortly before the job. You can message them any time.</p>
          </div>
        ) : (
          groups.map((g) => (
            <div key={g.day} className="space-y-2.5">
              <p className="text-center text-[10px] font-black uppercase tracking-widest text-slate-400">{g.day}</p>
              {g.items.map((m) => {
                const own = m.senderRole === 'admin';
                const tone = own ? 'bg-blue-600 text-white rounded-br-md' : m.senderRole === 'staff' ? 'bg-teal-50 text-teal-950 ring-1 ring-teal-100 rounded-bl-md' : 'bg-white text-slate-800 ring-1 ring-slate-200 rounded-bl-md';
                return (
                  <div key={m.id} className={`flex flex-col ${own ? 'items-end' : 'items-start'}`}>
                    <span className="mb-0.5 px-1 text-[10px] font-bold text-slate-400">
                      {own ? 'Office' : m.senderName} · {roleLabel(m.senderRole)}
                    </span>
                    <div className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm shadow-sm sm:max-w-[70%] ${tone}`}>{m.text}</div>
                    <span className="mt-0.5 px-1 text-[10px] text-slate-400">{new Date(m.timestamp).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>

      <Composer
        disabled={closed}
        placeholder={closed ? 'Reopen the chat to send a message' : 'Message the client and cleaner…'}
        quickReplies={[
          'Thanks for letting us know, we are looking into it now.',
          'Your cleaner is on the way.',
          'Could you share any access details for today?',
          'Sorry for the wait. Is there anything else we can help with?',
        ]}
        note={`Seen by the client and the cleaner · sent as ${adminName || 'Office'}`}
        onSend={async (text) => {
          try {
            await apiAdmin.sendBookingChat(String(b.id), text);
            await load();
          } catch (e) {
            showFlyer(e instanceof Error ? e.message : 'Message not sent', 'error');
            throw e;
          }
        }}
      />
    </div>
  );
};

function ClientChats({
  conversations,
  adminName,
}: {
  conversations: Conversation[];
  adminName?: string;
}) {
  const counts = useMemo(
    () => ({
      attention: conversations.filter((c) => c.needsReply).length,
      live: conversations.filter((c) => c.live).length,
      open: conversations.filter((c) => !c.closed && c.msgCount > 0).length,
      quiet: conversations.filter((c) => !c.closed && c.msgCount === 0).length,
      closed: conversations.filter((c) => c.closed).length,
    }),
    [conversations],
  );
  const [filter, setFilter] = useState<ClientFilter>(() => (counts.attention ? 'attention' : 'open'));
  const [q, setQ] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return conversations
      .filter((c) => {
        if (filter === 'attention') return c.needsReply;
        if (filter === 'live') return c.live;
        if (filter === 'open') return !c.closed && c.msgCount > 0;
        if (filter === 'quiet') return !c.closed && c.msgCount === 0;
        return c.closed;
      })
      .filter((c) => {
        if (!needle) return true;
        const b = c.booking;
        return [b.contact?.name, b.contact?.email, b.address?.line1, b.address?.postcode, b.bookingId, ...c.staffNames]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(needle));
      })
      .sort((a, b) => {
        if (a.lastAt && b.lastAt) return b.lastAt.localeCompare(a.lastAt);
        if (a.lastAt) return -1;
        if (b.lastAt) return 1;
        return `${a.booking.date} ${a.booking.time}`.localeCompare(`${b.booking.date} ${b.booking.time}`);
      });
  }, [conversations, filter, q]);

  const selected = conversations.find((c) => String(c.booking.id) === selectedId) || null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={<MessageCircle className="h-4 w-4" />} label="Needs reply" value={counts.attention} sub="Last message not from you" tone="bg-blue-50 text-blue-600" onClick={() => setFilter('attention')} />
        <StatCard icon={<span className="h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-500" />} label="Live now" value={counts.live} sub="Active in the last 15 min" tone="bg-emerald-50 text-emerald-600" onClick={() => setFilter('live')} />
        <StatCard icon={<MessagesSquare className="h-4 w-4" />} label="Open chats" value={counts.open} sub="With messages" tone="bg-slate-100 text-slate-600" onClick={() => setFilter('open')} />
        <StatCard icon={<Lock className="h-4 w-4" />} label="Ended" value={counts.closed} sub="Closed by the office" tone="bg-slate-100 text-slate-500" onClick={() => setFilter('closed')} />
      </div>

      <Card className="overflow-hidden">
        <div className="grid h-[min(720px,calc(100vh-14rem))] min-h-[520px] grid-cols-[minmax(0,1fr)] lg:grid-cols-[360px_minmax(0,1fr)]">
          {/* List */}
          <div className={`min-h-0 min-w-0 flex-col border-r border-slate-200 ${selected ? 'hidden lg:flex' : 'flex'}`}>
            <div className="space-y-3 border-b border-slate-200 p-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search client, address, cleaner…"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <Segmented<ClientFilter>
                ariaLabel="Chat filter"
                value={filter}
                onChange={setFilter}
                items={[
                  { id: 'attention', label: 'Needs reply', count: counts.attention },
                  { id: 'live', label: 'Live', count: counts.live },
                  { id: 'open', label: 'Open', count: counts.open },
                  { id: 'quiet', label: 'No messages', count: counts.quiet },
                  { id: 'closed', label: 'Ended', count: counts.closed },
                ]}
              />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {list.length === 0 ? (
                <div className="px-6 py-14 text-center">
                  <MessagesSquare className="mx-auto h-9 w-9 text-slate-300" />
                  <p className="mt-2 text-sm font-bold text-slate-500">
                    {filter === 'attention' ? 'All caught up' : filter === 'live' ? 'Nobody is chatting right now' : 'No chats here'}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-400">{filter === 'attention' ? 'Every chat has a reply from the office.' : 'Try another filter.'}</p>
                </div>
              ) : (
                list.map((c) => {
                  const b = c.booking;
                  const on = String(b.id) === selectedId;
                  return (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => setSelectedId(String(b.id))}
                      className={`flex w-full items-start gap-3 border-b border-slate-100 px-3 py-3 text-left transition ${on ? 'bg-blue-50' : 'hover:bg-slate-50'}`}
                    >
                      <span className="relative">
                        <Avatar name={b.contact?.name || 'Client'} />
                        {c.live ? <span className="absolute -right-0.5 -top-0.5 h-3 w-3 animate-pulse rounded-full border-2 border-white bg-emerald-500" /> : null}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className={`truncate text-sm ${c.needsReply ? 'font-black text-slate-900' : 'font-bold text-slate-800'}`}>{b.contact?.name || 'Client'}</span>
                          <span className="ml-auto shrink-0 text-[11px] text-slate-400">{c.lastAt ? timeAgo(c.lastAt) : b.date}</span>
                        </span>
                        <span className={`mt-0.5 block truncate text-xs ${c.needsReply ? 'font-semibold text-slate-700' : 'text-slate-500'}`}>
                          {c.lastText ? `${c.lastSenderRole === 'admin' ? 'You' : c.lastSenderName || roleLabel(c.lastSenderRole || '')}: ${c.lastText}` : `${b.serviceType} · ${b.time}`}
                        </span>
                        <span className="mt-1 flex items-center gap-1.5">
                          {c.closed ? <Lock className="h-3 w-3 text-slate-400" /> : null}
                          <span className="truncate text-[11px] text-slate-400">{c.staffNames.length ? c.staffNames.join(', ') : 'Unassigned'}</span>
                          {c.needsReply ? <span className="ml-auto h-2 w-2 shrink-0 rounded-full bg-blue-600" aria-label="Needs reply" /> : null}
                        </span>
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Thread */}
          <div className={`min-h-0 min-w-0 flex-col ${selected ? 'flex' : 'hidden lg:flex'}`}>
            {selected ? (
              <ClientThread key={selected.booking.id} conv={selected} adminName={adminName} onBack={() => setSelectedId(null)} />
            ) : (
              <div className="flex flex-1 items-center justify-center bg-slate-50 p-8">
                <div className="text-center">
                  <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-blue-600 shadow-sm ring-1 ring-slate-200">
                    <MessagesSquare className="h-6 w-6" />
                  </span>
                  <p className="mt-3 text-sm font-black text-slate-900">Pick a conversation</p>
                  <p className="mt-1 max-w-xs text-xs text-slate-500">Read what clients and cleaners are saying, step in with a reply, or end a chat when the job is done.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}

/* ───────────────────────── Team messages ───────────────────────── */

function TeamMessages({ staffList, onUnreadChange }: { staffList: Staff[]; onUnreadChange?: (n: number) => void }) {
  const { showFlyer } = useFlyer();
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [unseen, setUnseen] = useState<Set<number>>(new Set());
  const [selected, setSelected] = useState<number | 'all' | null>(null);
  const [q, setQ] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const team = useMemo(
    () =>
      staffList
        .filter((s) => !['Admin', 'Superadmin'].includes(String(s.role)) && Number((s as unknown as { userId?: number }).userId) > 0)
        .map((s) => ({ ...s, uid: Number((s as unknown as { userId?: number }).userId) })),
    [staffList],
  );

  const load = useCallback(async () => {
    try {
      const msgs: DirectMessage[] = await apiAdmin.getDirectMessages();
      const list = Array.isArray(msgs) ? msgs : [];
      setMessages(list);
      const fresh = list.filter((m) => m.senderRole === 'staff' && !m.isRead).map((m) => m.id);
      if (fresh.length) {
        setUnseen((prev) => new Set([...prev, ...fresh]));
        void apiAdmin.markDirectMessagesRead().catch(() => undefined);
      }
    } catch {
      /* keep */
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 20000);
    const off = subscribeNnSync(() => void load());
    return () => {
      clearInterval(t);
      off();
    };
  }, [load]);

  const threadFor = useCallback(
    (uid: number | 'all') =>
      messages
        .filter((m) =>
          uid === 'all'
            ? m.senderRole === 'admin' && Number(m.recipientUserId) === 0
            : (m.senderRole === 'staff' && m.senderUserId === uid) || (m.senderRole === 'admin' && Number(m.recipientUserId) === uid),
        )
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [messages],
  );

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return team
      .map((s) => {
        const thread = threadFor(s.uid);
        const last = thread[thread.length - 1];
        const unread = thread.filter((m) => unseen.has(m.id)).length;
        return { s, last, unread };
      })
      .filter((r) => !needle || r.s.name.toLowerCase().includes(needle))
      .sort((a, b) => (b.last?.createdAt || '').localeCompare(a.last?.createdAt || '') || a.s.name.localeCompare(b.s.name));
  }, [team, threadFor, unseen, q]);

  const totalUnread = rows.reduce((n, r) => n + r.unread, 0);
  useEffect(() => onUnreadChange?.(totalUnread), [totalUnread, onUnreadChange]);

  const thread = selected == null ? [] : threadFor(selected);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [thread.length, selected]);

  const open = (id: number | 'all') => {
    setSelected(id);
    if (id !== 'all') {
      const ids = threadFor(id).map((m) => m.id);
      setUnseen((prev) => new Set([...prev].filter((x) => !ids.includes(x))));
    }
  };

  const person = selected != null && selected !== 'all' ? team.find((t) => t.uid === selected) : null;
  const allLast = threadFor('all').slice(-1)[0];

  return (
    <Card className="overflow-hidden">
      <div className="grid h-[min(720px,calc(100vh-12rem))] min-h-[520px] grid-cols-[minmax(0,1fr)] lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className={`min-h-0 min-w-0 flex-col border-r border-slate-200 ${selected != null ? 'hidden lg:flex' : 'flex'}`}>
          <div className="border-b border-slate-200 p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Find a team member…"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <button
              type="button"
              onClick={() => open('all')}
              className={`flex w-full items-center gap-3 border-b border-slate-100 px-3 py-3 text-left ${selected === 'all' ? 'bg-blue-50' : 'hover:bg-slate-50'}`}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                <Megaphone className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-black text-slate-900">Whole team</span>
                <span className="block truncate text-xs text-slate-500">{allLast ? allLast.text : 'Send one message to every cleaner'}</span>
              </span>
            </button>
            {rows.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-slate-500">No team members with a login yet.</p>
            ) : (
              rows.map(({ s, last, unread }) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => open(s.uid)}
                  className={`flex w-full items-center gap-3 border-b border-slate-100 px-3 py-3 text-left ${selected === s.uid ? 'bg-blue-50' : 'hover:bg-slate-50'}`}
                >
                  <Avatar name={s.name} tone="bg-teal-100 text-teal-700" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className={`truncate text-sm ${unread ? 'font-black text-slate-900' : 'font-bold text-slate-800'}`}>{s.name}</span>
                      {last ? <span className="ml-auto shrink-0 text-[11px] text-slate-400">{timeAgo(last.createdAt)}</span> : null}
                    </span>
                    <span className={`block truncate text-xs ${unread ? 'font-semibold text-slate-700' : 'text-slate-500'}`}>
                      {last ? `${last.senderRole === 'admin' ? 'You: ' : ''}${last.text}` : s.role || 'Cleaner'}
                    </span>
                  </span>
                  {unread ? <span className="rounded-full bg-blue-600 px-1.5 py-0.5 text-[10px] font-black text-white">{unread}</span> : null}
                </button>
              ))
            )}
          </div>
        </div>

        <div className={`min-h-0 min-w-0 flex-col ${selected != null ? 'flex' : 'hidden lg:flex'}`}>
          {selected == null ? (
            <div className="flex flex-1 items-center justify-center bg-slate-50 p-8">
              <div className="text-center">
                <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-teal-600 shadow-sm ring-1 ring-slate-200">
                  <Users className="h-6 w-6" />
                </span>
                <p className="mt-3 text-sm font-black text-slate-900">Message your team</p>
                <p className="mt-1 max-w-xs text-xs text-slate-500">Pick a cleaner to chat one to one, or Whole team to send a notice to everyone. They get a phone alert.</p>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
                <button type="button" onClick={() => setSelected(null)} className="-ml-1 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 lg:hidden" aria-label="Back">
                  <ArrowLeft className="h-5 w-5" />
                </button>
                {person ? (
                  <Avatar name={person.name} tone="bg-teal-100 text-teal-700" />
                ) : (
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                    <Megaphone className="h-4 w-4" />
                  </span>
                )}
                <div className="min-w-0">
                  <p className="truncate font-black text-slate-900">{person ? person.name : 'Whole team'}</p>
                  <p className="text-xs text-slate-500">{person ? person.role || 'Cleaner' : `${team.length} team members`}</p>
                </div>
              </div>
              <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-slate-50 px-4 py-4">
                {thread.length === 0 ? (
                  <p className="py-14 text-center text-sm text-slate-400">No messages yet. Say hello.</p>
                ) : (
                  groupByDay<DirectMessage>(thread, (m) => m.createdAt).map((g) => (
                    <div key={g.day} className="space-y-2.5">
                      <p className="text-center text-[10px] font-black uppercase tracking-widest text-slate-400">{g.day}</p>
                      {g.items.map((m) => {
                        const own = m.senderRole === 'admin';
                        return (
                          <div key={m.id} className={`flex flex-col ${own ? 'items-end' : 'items-start'}`}>
                            <div
                              className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm shadow-sm sm:max-w-[70%] ${
                                own ? 'rounded-br-md bg-blue-600 text-white' : 'rounded-bl-md bg-white text-slate-800 ring-1 ring-slate-200'
                              }`}
                            >
                              {m.text}
                            </div>
                            <span className="mt-0.5 px-1 text-[10px] text-slate-400">
                              {own && selected !== 'all' && Number(m.recipientUserId) === 0 ? 'To whole team · ' : ''}
                              {new Date(m.createdAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ))
                )}
              </div>
              <Composer
                placeholder={person ? `Message ${person.name.split(' ')[0]}…` : 'Message the whole team…'}
                note={person ? 'Only this team member sees it. They get a phone alert.' : 'Every cleaner sees this in their inbox and gets a phone alert.'}
                onSend={async (text) => {
                  try {
                    await apiAdmin.sendDirectMessage(text, selected === 'all' ? undefined : selected);
                    await load();
                  } catch (e) {
                    showFlyer('Message not sent.', 'error');
                    throw e;
                  }
                }}
              />
            </>
          )}
        </div>
      </div>
    </Card>
  );
}

/* ───────────────────────── Page ───────────────────────── */

export default function ChatOversightPanel({
  bookings,
  chatSummaries,
  staffList,
  adminName,
}: {
  bookings: Booking[];
  chatSummaries: ChatSummary[];
  staffList: Staff[];
  adminName?: string;
}) {
  const [view, setView] = useState<View>('clients');
  const [teamUnread, setTeamUnread] = useState(0);

  const conversations = useMemo<Conversation[]>(() => {
    const byId = new Map(chatSummaries.map((s) => [String(s.bookingId), s]));
    const staffName = new Map(staffList.map((s) => [String(s.id), s.name]));
    const now = Date.now();
    return bookings
      .filter((b) => b.status === BookingStatus.PENDING || b.status === BookingStatus.CONFIRMED || b.status === BookingStatus.COMPLETED)
      .map((b) => {
        const s = byId.get(String(b.id));
        const closed = s ? s.chatClosed : Boolean(b.chatClosedByAdmin);
        const msgCount = s?.msgCount ?? 0;
        const lastAt = s?.lastMessageAt ?? null;
        const lastRole = s?.lastSenderRole ?? null;
        const ids = [...new Set([...(b.assignedStaffIds || []), ...(b.assignedStaffId ? [b.assignedStaffId] : [])].map(String))];
        return {
          booking: b,
          closed,
          msgCount,
          lastAt,
          lastText: s?.lastText ?? null,
          lastSenderName: s?.lastSenderName ?? null,
          lastSenderRole: lastRole,
          needsReply: !closed && msgCount > 0 && !!lastRole && lastRole !== 'admin',
          live: !closed && !!lastAt && lastRole !== 'admin' && now - new Date(lastAt).getTime() < LIVE_MS,
          staffNames: ids.map((id) => staffName.get(id)).filter(Boolean) as string[],
        };
      });
  }, [bookings, chatSummaries, staffList]);

  const needsReply = conversations.filter((c) => c.needsReply).length;

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 space-y-6">
      <div className="flex flex-col gap-4 border-b border-slate-100 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="text-3xl font-black tracking-tight text-slate-900">Chat Oversight</h3>
          <p className="text-sm font-medium text-slate-500">Watch and join client chats on every job, and message your team directly.</p>
        </div>
        <Segmented<View>
          ariaLabel="Chat type"
          value={view}
          onChange={setView}
          items={[
            { id: 'clients', label: 'Client chats', count: needsReply || undefined },
            { id: 'team', label: 'Team messages', count: teamUnread || undefined },
          ]}
        />
      </div>
      {view === 'clients' ? <ClientChats conversations={conversations} adminName={adminName} /> : null}
      {/* Kept mounted so the unread count stays current while on Client chats. */}
      <div className={view === 'team' ? '' : 'hidden'}>
        <TeamMessages staffList={staffList} onUnreadChange={setTeamUnread} />
      </div>
    </div>
  );
}

