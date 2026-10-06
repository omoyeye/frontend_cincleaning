import React, { useEffect, useMemo, useState } from 'react';
import { X, MessageSquare, Send, Lock, Unlock } from 'lucide-react';
import { Booking } from '../../types';
import { apiAdmin } from '../../services/api';

interface ChatOversightFlyoutProps {
    booking: Booking;
    adminName?: string;
    onClose: () => void;
}

type ChatMessage = {
    id: string;
    senderName: string;
    senderRole: string;
    text: string;
    timestamp: string;
};

const ChatOversightFlyout: React.FC<ChatOversightFlyoutProps> = ({ booking, adminName, onClose }) => {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [messageText, setMessageText] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [loading, setLoading] = useState(true);
    const [chatClosedByAdmin, setChatClosedByAdmin] = useState(false);

    const loadMessages = async () => {
        try {
            const payload = await apiAdmin.getBookingChat(booking.id);
            setMessages(payload?.messages || []);
            setChatClosedByAdmin(Boolean(payload?.chatClosedByAdmin));
        } catch {
            setMessages([]);
        } finally {
            setLoading(false);
        }
    };

    const handleCloseChat = async () => {
        try {
            await apiAdmin.closeBookingChat(booking.id);
            await loadMessages();
        } catch {
            // no-op, UI can stay as-is
        }
    };

    const handleReopenChat = async () => {
        try {
            await apiAdmin.reopenBookingChat(booking.id);
            await loadMessages();
        } catch {
            /* ignore */
        }
    };

    useEffect(() => {
        void loadMessages();
        const id = setInterval(() => void loadMessages(), 5000);
        return () => clearInterval(id);
    }, [booking.id]);

    const handleSend = async () => {
        if (!messageText.trim() || isSending) return;
        setIsSending(true);
        try {
            await apiAdmin.sendBookingChat(booking.id, messageText.trim());
            setMessageText('');
            await loadMessages();
        } finally {
            setIsSending(false);
        }
    };

    const formattedMessages = useMemo(
        () => messages.map((m) => ({
            ...m,
            time: new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            own: m.senderRole === 'admin',
        })),
        [messages]
    );

    return (
        <div className="fixed inset-0 z-[200] flex justify-end">
            <div className="absolute inset-0 bg-slate-900/20 backdrop-blur-sm animate-in fade-in" onClick={onClose} />
            <div className="w-full max-w-md bg-white h-full relative z-10 shadow-2xl animate-in slide-in-from-right flex flex-col">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-indigo-50/50">
                    <div>
                        <h2 className="text-xl font-black text-slate-900 flex items-center">
                            <MessageSquare className="w-5 h-5 mr-2 text-indigo-600" />
                            Chat Oversight
                        </h2>
                        <p className="text-xs font-bold text-slate-500 mt-1 uppercase tracking-widest truncate max-w-[250px]">
                            Job #{booking.bookingId.substring(0, 8)}
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-400">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-4 bg-slate-50 border-b border-slate-100 flex flex-wrap gap-2 justify-between items-center">
                    <div>
                        <div className="text-sm font-bold text-slate-900">Client: {booking.contact?.name}</div>
                        <div className="text-xs font-bold text-slate-500 mt-0.5">Staff ID: {booking.assignedStaffId || 'Unassigned'}</div>
                    </div>
                    <div className="flex flex-wrap gap-2 justify-end">
                        {!chatClosedByAdmin ? (
                            <button
                                type="button"
                                onClick={() => void handleCloseChat()}
                                disabled={booking.status === 'Cancelled'}
                                className="px-3 py-1.5 bg-red-100 text-red-600 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center hover:bg-red-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <Lock className="w-3 h-3 mr-1" /> End chat
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={() => void handleReopenChat()}
                                disabled={booking.status === 'Cancelled'}
                                className="px-3 py-1.5 bg-emerald-100 text-emerald-700 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center hover:bg-emerald-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <Unlock className="w-3 h-3 mr-1" /> Reopen chat
                            </button>
                        )}
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-50/30">
                    <div className="text-center text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6">
                        Live conversation
                    </div>

                    {loading && (
                        <div className="text-center text-sm font-bold text-slate-400 py-8">Loading chat...</div>
                    )}
                    {!loading && formattedMessages.length === 0 && (
                        <div className="text-center text-sm font-bold text-slate-400 py-8">No messages yet.</div>
                    )}

                    {formattedMessages.map((msg) => (
                        <div key={msg.id} className={`flex flex-col ${msg.own ? 'items-end' : 'items-start'}`}>
                            <div className="text-[10px] font-bold text-slate-400 mb-1 ml-1 mr-1">
                                {msg.senderName} ({msg.senderRole})
                            </div>
                            <div className={`max-w-[80%] p-3 rounded-2xl text-sm ${msg.own
                                ? 'bg-white border border-slate-200 text-slate-700 rounded-tl-sm shadow-sm'
                                : 'bg-blue-600 text-white rounded-tr-sm shadow-sm'
                                }`}>
                                {msg.text}
                            </div>
                            <div className="text-[9px] font-bold text-slate-400 mt-1 mx-2">{msg.time}</div>
                        </div>
                    ))}
                </div>

                <div className="p-4 border-t border-slate-100 bg-white">
                    <div className="relative">
                        <input
                            type="text"
                            placeholder="Type an admin message..."
                            value={messageText}
                            onChange={(e) => setMessageText(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') void handleSend();
                            }}
                            className="w-full pl-4 pr-12 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 ring-indigo-500/20"
                            disabled={chatClosedByAdmin}
                        />
                        <button
                            onClick={() => void handleSend()}
                            disabled={!messageText.trim() || isSending || chatClosedByAdmin}
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-indigo-600 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <Send className="w-4 h-4" />
                        </button>
                    </div>
                    <p className="text-[9px] font-bold text-slate-400 mt-2 text-center uppercase tracking-widest">
                        Admin messages are visible to clients and staff • {adminName || 'Admin'}
                    </p>
                </div>
            </div>
        </div>
    );
};

export default ChatOversightFlyout;
