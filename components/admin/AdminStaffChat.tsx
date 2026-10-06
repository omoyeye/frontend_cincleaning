import React, { useState, useEffect, useRef } from 'react';
import { MessageSquare, Send, Users, RefreshCw } from 'lucide-react';
import type { Staff } from '../../types';

interface DirectMessage {
  id: number;
  senderUserId: number;
  senderName: string;
  senderRole: string;
  recipientRole: string;
  recipientUserId: number;
  text: string;
  isRead: boolean;
  createdAt: string;
}

interface AdminStaffChatProps {
  api: {
    getDirectMessages: () => Promise<DirectMessage[]>;
    sendDirectMessage: (text: string, recipientUserId?: number) => Promise<unknown>;
    markDirectMessagesRead: () => Promise<unknown>;
  };
  showFlyer: (msg: string, type: 'success' | 'error' | 'info') => void;
  staffList: Staff[];
}

const AdminStaffChat: React.FC<AdminStaffChatProps> = ({ api, showFlyer, staffList }) => {
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedStaffUserId, setSelectedStaffUserId] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const loadMessages = async () => {
    setLoading(true);
    try {
      const msgs = await api.getDirectMessages();
      setMessages(Array.isArray(msgs) ? msgs : []);
      await api.markDirectMessagesRead().catch(() => {});
    } catch {
      setMessages([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadMessages();
    const interval = setInterval(loadMessages, 20000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const filteredMessages = selectedStaffUserId
    ? messages.filter(
        (m) =>
          (m.senderRole === 'staff' && m.senderUserId === selectedStaffUserId) ||
          (m.senderRole === 'admin' && m.recipientUserId === selectedStaffUserId) ||
          (m.senderRole === 'admin' && m.recipientUserId === 0)
      )
    : messages;

  const displayMessages = [...filteredMessages].reverse();

  const staffWithMessages = React.useMemo(() => {
    const senderIds = new Set(messages.filter(m => m.senderRole === 'staff').map(m => m.senderUserId));
    return staffList.filter(s => {
      const userId = (s as unknown as Record<string, unknown>).userId;
      return senderIds.has(Number(userId));
    });
  }, [messages, staffList]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text) return;
    try {
      await api.sendDirectMessage(text, selectedStaffUserId || undefined);
      setInput('');
      await loadMessages();
    } catch {
      showFlyer('Failed to send message.', 'error');
    }
  };

  return (
    <div className="mt-10 bg-white rounded-[2rem] border border-slate-100 overflow-hidden">
      <div className="p-5 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-teal-100 text-teal-600 flex items-center justify-center">
            <MessageSquare className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-lg font-black text-slate-900">Staff Direct Messages</h4>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Chat with your team</p>
          </div>
        </div>
        <button
          onClick={() => void loadMessages()}
          className="p-2 rounded-xl hover:bg-slate-50 text-slate-400 hover:text-slate-600 transition-colors"
          title="Refresh messages"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="flex min-h-[400px] max-h-[500px]">
        <div className="w-48 shrink-0 border-r border-slate-100 overflow-y-auto p-3 space-y-1">
          <button
            onClick={() => setSelectedStaffUserId(null)}
            className={`w-full text-left px-3 py-2 rounded-xl text-xs font-bold transition-all ${
              selectedStaffUserId === null ? 'bg-teal-50 text-teal-700 border border-teal-200' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Users className="w-3.5 h-3.5 inline mr-1.5" />
            All Messages
          </button>
          {staffWithMessages.map((s) => {
            const userId = Number((s as unknown as Record<string, unknown>).userId);
            const unread = messages.filter(m => m.senderRole === 'staff' && m.senderUserId === userId && !m.isRead).length;
            return (
              <button
                key={s.id}
                onClick={() => setSelectedStaffUserId(userId)}
                className={`w-full text-left px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                  selectedStaffUserId === userId ? 'bg-teal-50 text-teal-700 border border-teal-200' : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <span className="block truncate">{s.name}</span>
                {unread > 0 && (
                  <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded-full bg-teal-500 text-white text-[9px] font-black">
                    {unread}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="flex-1 flex flex-col min-w-0">
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
            {loading && messages.length === 0 ? (
              <div className="flex items-center justify-center py-10">
                <div className="w-6 h-6 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : displayMessages.length === 0 ? (
              <div className="text-center py-10 text-slate-400">
                <MessageSquare className="w-10 h-10 mx-auto mb-2 opacity-40" />
                <p className="font-bold text-sm">No messages yet</p>
              </div>
            ) : (
              displayMessages.map((m) => (
                <div
                  key={m.id}
                  className={`max-w-[80%] px-4 py-3 rounded-2xl text-sm ${
                    m.senderRole === 'admin'
                      ? 'ml-auto bg-teal-600 text-white'
                      : 'bg-slate-100 text-slate-900'
                  }`}
                >
                  <div className="text-[10px] font-black uppercase opacity-70 mb-1">
                    {m.senderName} {m.senderRole === 'staff' ? '(Staff)' : '(Admin)'}
                  </div>
                  <p className="whitespace-pre-wrap">{m.text}</p>
                  <div className="text-[9px] opacity-50 mt-1">
                    {m.createdAt
                      ? new Date(m.createdAt).toLocaleString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : ''}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="p-4 border-t border-slate-100 flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void sendMessage();
                }
              }}
              placeholder={selectedStaffUserId ? 'Reply to staff member...' : 'Broadcast to all staff...'}
              className="flex-1 p-3 rounded-xl border border-slate-200 text-sm font-medium focus:border-teal-400 focus:ring-2 focus:ring-teal-200/60 outline-none"
            />
            <button
              onClick={() => void sendMessage()}
              disabled={!input.trim()}
              className="px-4 py-3 rounded-xl bg-teal-600 text-white text-xs font-black uppercase tracking-widest disabled:opacity-50 hover:bg-teal-700 transition-colors"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminStaffChat;
