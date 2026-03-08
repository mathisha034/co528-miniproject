import React, { useEffect, useState } from 'react';
import { Users, Briefcase, FlaskConical, CalendarDays, Activity, Server } from 'lucide-react';
import { api } from '../../lib/axios';
import { useAuth } from '../../contexts/AuthContext';
import './Dashboard.css';

interface StatData {
    users: number;
    posts: number;
    jobs: number;
    events: number;
}

interface ServiceHealth {
    name: string;
    status: 'online' | 'offline' | 'loading';
    latency: number;
}

const SERVICES = ['user-service', 'feed-service', 'job-service', 'event-service', 'notification-service', 'research-service', 'analytics-service'];

export const Dashboard: React.FC = () => {
    const { user, hasRole } = useAuth();
    const [stats, setStats] = useState<StatData>({ users: 0, posts: 0, jobs: 0, events: 0 });
    const [healthStatus, setHealthStatus] = useState<ServiceHealth[]>(
        SERVICES.map(name => ({ name, status: 'loading', latency: 0 }))
    );
    const [feedPreview, setFeedPreview] = useState<any[]>([]);

    useEffect(() => {
        // analytics/overview is admin-only — skip call for non-admins to avoid 403
        if (hasRole('admin')) {
            api.get('/api/v1/analytics-service/analytics/overview')
                .then(res => setStats(res.data))
                .catch(() => console.warn('Analytics overview unavailable, showing defaults'));
        }

        // Fetch feed preview
        api.get('/api/v1/feed-service/feed?page=1&limit=3')
            .then(res => setFeedPreview(res.data.items || res.data || []))
            .catch(() => console.warn('Feed preview unavailable'));

        // Health checks — always run regardless of auth
        SERVICES.forEach(service => {
            const startTime = performance.now();
            api.get(`/api/v1/${service}/health`, { timeout: 3000 })
                .then(() => {
                    const latency = Math.round(performance.now() - startTime);
                    setHealthStatus(prev => prev.map(s => s.name === service ? { ...s, status: 'online', latency } : s));
                })
                .catch(() => {
                    setHealthStatus(prev => prev.map(s => s.name === service ? { ...s, status: 'offline', latency: 0 } : s));
                });
        });
    }, []);

    const displayName = user?.firstName || user?.username || 'there';

    return (
        <div className="dashboard-page">
            <div className="dashboard-header">
                <h1>Dashboard Overview</h1>
                <p className="subtitle">Welcome back, <strong>{displayName}</strong> 👋</p>
            </div>

            <div className="stats-grid">
                <div className="stat-card">
                    <div className="stat-icon-wrapper users"><Users size={24} /></div>
                    <div className="stat-content">
                        <span className="stat-label">Active Users</span>
                        <span className="stat-value">{stats ? stats.users : '--'}</span>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon-wrapper jobs"><Briefcase size={24} /></div>
                    <div className="stat-content">
                        <span className="stat-label">Open Jobs</span>
                        <span className="stat-value">{stats ? stats.jobs : '--'}</span>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon-wrapper research"><FlaskConical size={24} /></div>
                    <div className="stat-content">
                        <span className="stat-label">Live Posts</span>
                        <span className="stat-value">{stats ? stats.posts : '--'}</span>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon-wrapper events"><CalendarDays size={24} /></div>
                    <div className="stat-content">
                        <span className="stat-label">Upcoming Events</span>
                        <span className="stat-value">{stats ? stats.events : '--'}</span>
                    </div>
                </div>
            </div>

            <div className="dashboard-columns">
                <div className="main-column">
                    <section className="dashboard-section card">
                        <div className="section-header">
                            <h2>Recent Feed Activity</h2>
                        </div>
                        <div className="feed-preview-list">
                            {feedPreview.length > 0 ? feedPreview.map(post => (
                                <div key={post._id} className="feed-preview-item">
                                    <div className="feed-preview-avatar">{post.userId?.charAt(0) || 'U'}</div>
                                    <div className="feed-preview-content">
                                        <p className="feed-preview-text">{post.content}</p>
                                        <span className="feed-preview-meta">{new Date(post.createdAt).toLocaleDateString()}</span>
                                    </div>
                                </div>
                            )) : (
                                <div className="empty-state">No recent posts found.</div>
                            )}
                        </div>
                    </section>
                </div>

                <div className="side-column">
                    <section className="dashboard-section card">
                        <div className="section-header">
                            <h2><Activity size={20} className="icon" /> Local Cluster Health</h2>
                        </div>
                        <div className="health-list">
                            {healthStatus.map(service => (
                                <div key={service.name} className="health-item">
                                    <div className="health-item-left">
                                        <Server size={16} className={`status-icon ${service.status}`} />
                                        <span className="service-name">{service.name}</span>
                                    </div>
                                    <div className="health-item-right">
                                        {service.status === 'online' ? (
                                            <span className="latency">{service.latency}ms</span>
                                        ) : (
                                            <span className="status-badge offline">Offline</span>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
};
