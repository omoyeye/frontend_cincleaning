import React, { useRef, useState } from 'react';
import { Send, Bell, Mail, Users, CheckCircle, AlertCircle, ImagePlus } from 'lucide-react';
import { apiAdmin } from '../../services/api';

const CommunicationCenter: React.FC = () => {
    const [activeTab, setActiveTab] = useState<'email' | 'notification'>('email');
    const [recipientType, setRecipientType] = useState<'all_users' | 'staff' | 'specific'>('all_users');
    const [specificEmails, setSpecificEmails] = useState('');
    const [subject, setSubject] = useState('');
    const [message, setMessage] = useState(''); // Email HTML or Notification Text
    const [status, setStatus] = useState<{ type: 'success' | 'error', text: string } | null>(null);
    const [loading, setLoading] = useState(false);
    const [imageBusy, setImageBusy] = useState(false);
    const bodyRef = useRef<HTMLTextAreaElement>(null);
    const imageInputRef = useRef<HTMLInputElement>(null);

    const insertHtmlAtCursor = (snippet: string) => {
        const ta = bodyRef.current;
        if (!ta) {
            setMessage((m) => m + snippet);
            return;
        }
        const start = ta.selectionStart;
        const end = ta.selectionEnd;
        const v = ta.value;
        const next = v.slice(0, start) + snippet + v.slice(end);
        setMessage(next);
        queueMicrotask(() => {
            ta.focus();
            const pos = start + snippet.length;
            ta.setSelectionRange(pos, pos);
        });
    };

    const onPickEmailImage = () => {
        if (activeTab !== 'email') return;
        imageInputRef.current?.click();
    };

    const onEmailImageSelected: React.ChangeEventHandler<HTMLInputElement> = async (e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file || activeTab !== 'email') return;
        const lower = file.name.toLowerCase();
        if (lower.endsWith('.heic') || lower.endsWith('.heif') || file.type === 'image/heic' || file.type === 'image/heif') {
            setStatus({
                type: 'error',
                text: 'HEIC/HEIF is not supported for email. Export or convert the photo to JPEG or PNG, then try again.',
            });
            return;
        }
        if (file.type && !/^image\/(png|jpeg|jpg|gif|webp)$/i.test(file.type)) {
            setStatus({ type: 'error', text: 'Please choose a PNG, JPEG, GIF, or WebP image.' });
            return;
        }
        setImageBusy(true);
        setStatus(null);
        try {
            const dataUrl = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(String(reader.result || ''));
                reader.onerror = () => reject(new Error('Could not read file'));
                reader.readAsDataURL(file);
            });
            const { url } = await apiAdmin.uploadBroadcastEmailImage(dataUrl);
            const alt = file.name.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
            insertHtmlAtCursor(
                `<p><img src="${url}" alt="${alt}" style="max-width:100%;height:auto;display:block;margin:12px 0;border-radius:8px" /></p>`,
            );
            setStatus({ type: 'success', text: 'Image inserted. Recipients’ mail apps load it from your site URL.' });
        } catch (err) {
            setStatus({
                type: 'error',
                text: err instanceof Error ? err.message : 'Image upload failed.',
            });
        } finally {
            setImageBusy(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setStatus(null);

        try {
            if (activeTab === 'email') {
                const recipients = recipientType === 'specific'
                    ? specificEmails.split(',').map(e => e.trim())
                    : []; // Backend handles 'all_users' and 'staff' logic based on type string

                await apiAdmin.sendBulkEmail({
                    subject,
                    content: message,
                    recipientType,
                    specificEmails: recipients
                });
                setStatus({ type: 'success', text: 'Emails sent successfully!' });
            } else {
                await apiAdmin.sendBulkNotification({
                    message,
                    recipientType
                });
                setStatus({ type: 'success', text: 'Notifications broadcasted successfully!' });
            }
            // Reset form
            setSubject('');
            setMessage('');
        } catch (err) {
            setStatus({
                type: 'error',
                text: err instanceof Error ? err.message : 'Failed to send. Please try again.',
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 sm:p-6 lg:p-8 w-full">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-6">
                <div className="p-3 bg-blue-100 rounded-xl">
                    <Send className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                    <h2 className="text-xl font-bold text-slate-900">Communication Center</h2>
                    <p className="text-slate-500 text-sm">Send bulk emails and notifications to your users</p>
                </div>
            </div>

            {/* Tabs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-slate-100 p-1 rounded-xl mb-6 w-full">
                <button
                    onClick={() => setActiveTab('email')}
                    className={`flex items-center justify-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'email' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                        }`}
                >
                    <Mail className="w-4 h-4" />
                    <span>Email Broadcast</span>
                </button>
                <button
                    onClick={() => setActiveTab('notification')}
                    className={`flex items-center justify-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'notification' ? 'bg-white text-purple-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                        }`}
                >
                    <Bell className="w-4 h-4" />
                    <span>In-App Notification</span>
                </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
                {/* Recipient Selection */}
                <div className="space-y-3">
                    <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                        <Users className="w-4 h-4" /> Recipients
                    </label>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <label className={`border rounded-xl p-4 cursor-pointer transition-all ${recipientType === 'all_users' ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500' : 'hover:border-slate-300'}`}>
                            <input type="radio" className="hidden" name="recipient" checked={recipientType === 'all_users'} onChange={() => setRecipientType('all_users')} />
                            <div className="font-medium text-slate-900">All Users</div>
                            <div className="text-xs text-slate-500">Customers & Staff</div>
                        </label>
                        <label className={`border rounded-xl p-4 cursor-pointer transition-all ${recipientType === 'staff' ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500' : 'hover:border-slate-300'}`}>
                            <input type="radio" className="hidden" name="recipient" checked={recipientType === 'staff'} onChange={() => setRecipientType('staff')} />
                            <div className="font-medium text-slate-900">Staff Only</div>
                            <div className="text-xs text-slate-500">Active team members</div>
                        </label>
                        {activeTab === 'email' && (
                            <label className={`border rounded-xl p-4 cursor-pointer transition-all ${recipientType === 'specific' ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500' : 'hover:border-slate-300'}`}>
                                <input type="radio" className="hidden" name="recipient" checked={recipientType === 'specific'} onChange={() => setRecipientType('specific')} />
                                <div className="font-medium text-slate-900">Specific Emails</div>
                                <div className="text-xs text-slate-500">Comma separated list</div>
                            </label>
                        )}
                    </div>
                </div>

                {recipientType === 'specific' && activeTab === 'email' && (
                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-2">Email List</label>
                        <input
                            type="text"
                            value={specificEmails}
                            onChange={(e) => setSpecificEmails(e.target.value)}
                            placeholder="jane@example.com, john@example.com"
                            className="w-full p-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                )}

                {/* Email Subject */}
                {activeTab === 'email' && (
                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-2">Subject</label>
                        <input
                            type="text"
                            value={subject}
                            onChange={(e) => setSubject(e.target.value)}
                            placeholder="e.g., Important Update regarding your service"
                            required
                            className="w-full p-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                )}

                {/* Message Content */}
                <div>
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                        <label className="block text-sm font-bold text-slate-700">
                            {activeTab === 'email' ? 'Email Content (HTML Supported)' : 'Notification Message'}
                        </label>
                        {activeTab === 'email' ? (
                            <>
                                <input
                                    ref={imageInputRef}
                                    type="file"
                                    accept="image/png,image/jpeg,image/jpg,image/gif,image/webp"
                                    className="hidden"
                                    onChange={onEmailImageSelected}
                                />
                                <button
                                    type="button"
                                    onClick={onPickEmailImage}
                                    disabled={imageBusy}
                                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-700 bg-slate-50 hover:bg-slate-100 disabled:opacity-50"
                                >
                                    <ImagePlus className="w-4 h-4" />
                                    {imageBusy ? 'Uploading…' : 'Add image'}
                                </button>
                            </>
                        ) : null}
                    </div>
                    {activeTab === 'email' ? (
                        <p className="text-xs text-slate-500 mb-2">
                            Images are stored on the server and linked with a public URL so they appear in inbox clients (max ~2.5MB).
                        </p>
                    ) : null}
                    <textarea
                        ref={bodyRef}
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        placeholder={activeTab === 'email' ? '<h1>Hello!</h1><p>We have an update...</p>' : 'System maintenance scheduled for tonight...'}
                        required
                        rows={6}
                        className="w-full p-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                    />
                </div>

                {status && (
                    <div className={`p-4 rounded-xl flex items-center gap-3 ${status.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                        {status.type === 'success' ? <CheckCircle className="w-5 h-5 flex-shrink-0" /> : <AlertCircle className="w-5 h-5 flex-shrink-0" />}
                        <p>{status.text}</p>
                    </div>
                )}

                <button
                    type="submit"
                    disabled={loading}
                    className={`w-full py-4 rounded-xl font-bold text-white flex items-center justify-center gap-2 transition-all ${loading ? 'bg-slate-400 cursor-not-allowed' :
                            activeTab === 'email' ? 'bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-200' :
                                'bg-purple-600 hover:bg-purple-700 shadow-lg shadow-purple-200'
                        }`}
                >
                    {loading ? 'Sending...' : (
                        <>
                            <Send className="w-5 h-5" />
                            {activeTab === 'email' ? 'Send Emails' : 'Broadcast Notification'}
                        </>
                    )}
                </button>
            </form>
        </div>
    );
};

export default CommunicationCenter;
