import React, { useState, useEffect } from 'react';
import { Bell, Check, CheckCircle2, MessageSquare, Briefcase, Calendar } from 'lucide-react';
import { api } from '../../lib/axios';
import './Notifications.css';

interface Notification {
    _id: string;
    userId: string;
    type: string; // 'POST_LIKE', 'EVENT_INVITE', 'JOB_APPLICATION', etc.
    title: string;
    content: string;
    isRead: boolean;
    relatedEntityId: string;
    createdAt: string;
}

export const Notifications: React.FC = () => {
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [loading, setLoading] = useState(false);

    const fetchNotifications = async () => {
        try {
            setLoading(true);
            const res = await api.get('/api/v1/notification-service/notifications');
            const raw = Array.isArray(res.data) ? res.data : (res.data?.items ?? res.data?.notifications ?? []);
            setNotifications(raw.map((n: any) => ({
                ...n,
                type: n.type ?? '',
                title: n.title ?? '',
                content: n.message ?? n.content ?? '',
                isRead: n.isRead ?? n.read ?? false,
            })));
        } catch (err) {
            console.error('Failed to load notifications', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchNotifications();
        const interval = setInterval(() => { fetchNotifications(); }, 30000);
        return () => clearInterval(interval);
    }, []);

    const handleMarkAllRead = async () => {
        try {
            await api.patch('/api/v1/notification-service/notifications/read-all');
            setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
        } catch (err) {
            console.error('Failed to mark as read', err);
            alert('Failed to mark notifications as read.');
        }
    };

    const handleMarkOneRead = async (id: string) => {
        try {
            await api.patch(`/api/v1/notification-service/notifications/${id}/read`);
            setNotifications(prev => prev.map(n => n._id === id ? { ...n, isRead: true } : n));
        } catch {
            // silently fail — optimistic update still applied
        }
    };

    const getTitleForType = (type: string, fallback: string) => {
        if (fallback) return fallback; // backend supplied a real title
        const map: Record<string, string> = {
            post_liked: 'Post Liked',
            job_applied: 'Job Application',
            job_status_changed: 'Job Status Updated',
            event_status_changed: 'Event Update',
            general: 'Notification',
        };
        return map[type] ?? 'Notification';
    };

    const getIconForType = (type: string = '') => {
        const t = (type ?? '').toLowerCase();
        if (t.includes('post')) return <MessageSquare size={20} className="notif-icon info" />;
        if (t.includes('job')) return <Briefcase size={20} className="notif-icon success" />;
        if (t.includes('event')) return <Calendar size={20} className="notif-icon warning" />;
        return <Bell size={20} className="notif-icon primary" />;
    };

    return (
        <div className="notifications-page">
            <div className="page-header">
                <div>
                    <h1>Notifications</h1>
                    <p className="subtitle">Stay updated on your interactions, events, and jobs.</p>
                </div>
                <button
                    className="secondary-btn"
                    onClick={handleMarkAllRead}
                    disabled={!notifications.some(n => !n.isRead)}
                >
                    <CheckCircle2 size={18} />
                    <span>Mark all as read</span>
                </button>
            </div>

            <div className="notifications-list card">
                {loading && notifications.length === 0 ? (
                    <div className="loading-state">Loading actual notifications...</div>
                ) : notifications.length > 0 ? (
                    notifications.map(notif => (
                        <div
                            key={notif._id}
                            className={`notification-item ${!notif.isRead ? 'unread' : ''}`}
                            onClick={() => !notif.isRead && handleMarkOneRead(notif._id)}
                            style={{ cursor: !notif.isRead ? 'pointer' : 'default' }}
                        >
                            <div className="notif-icon-wrapper">
                                {getIconForType(notif.type)}
                            </div>

                            <div className="notif-content">
                                <div className="notif-title-row">
                                    <h4>{getTitleForType(notif.type, notif.title)}</h4>
                                    <span className="notif-time">{new Date(notif.createdAt).toLocaleString()}</span>
                                </div>
                                <p className="notif-text">{notif.content}</p>
                            </div>

                            {!notif.isRead && (
                                <div className="unread-dot" title="Unread"></div>
                            )}
                        </div>
                    ))
                ) : (
                    <div className="empty-state">
                        <Check size={48} className="empty-icon success-color" />
                        <h3>You're all caught up!</h3>
                        <p>No new notifications right now.</p>
                    </div>
                )}
            </div>
        </div>
    );
};
