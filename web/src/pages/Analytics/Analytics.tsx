import React, { useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend } from 'recharts';
import { Activity, Users, Database, Server, AlertTriangle } from 'lucide-react';
import { api } from '../../lib/axios';
import { useAuth } from '../../contexts/AuthContext';
import './Analytics.css';

interface SystemMetric {
    timestamp: string;
    cpu: number;
    memory: number;
}

interface EngagementMetric {
    date: string;
    posts: number;
    jobs: number;
    events: number;
}

export const Analytics: React.FC = () => {
    const { hasRole } = useAuth();

    // Dummy data representing analytics-service aggregation
    const [systemMetrics, setSystemMetrics] = useState<SystemMetric[]>([]);
    const [engagementMetrics, setEngagementMetrics] = useState<EngagementMetric[]>([]);
    const [alerts, setAlerts] = useState<{ id: string, message: string, severity: string, time: string }[]>([]);

    useEffect(() => {
        // In a real app, this hits /analytics-service/metrics
        const fetchAnalytics = async () => {
            try {
                await api.get('/api/v1/analytics-service/analytics/overview');

                const sysData = [];
                const now = new Date();
                for (let i = 24; i >= 0; i--) {
                    const t = new Date(now.getTime() - i * 60 * 60 * 1000);
                    sysData.push({
                        timestamp: `${t.getHours()}:00`,
                        cpu: Math.floor(Math.random() * 40) + 10,
                        memory: Math.floor(Math.random() * 30) + 40
                    });
                }
                setSystemMetrics(sysData);

                const engData = [];
                for (let i = 6; i >= 0; i--) {
                    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
                    engData.push({
                        date: d.toLocaleDateString([], { weekday: 'short' }),
                        posts: Math.floor(Math.random() * 50) + 10,
                        jobs: Math.floor(Math.random() * 10) + 2,
                        events: Math.floor(Math.random() * 5)
                    });
                }
                setEngagementMetrics(engData);

                setAlerts([
                    { id: '1', message: 'High CPU utilization detected on research-service pod', severity: 'warning', time: '10 mins ago' },
                    { id: '2', message: 'MongoDB replica set synchronization delay', severity: 'error', time: '1 hour ago' },
                    { id: '3', message: 'Rate limit threshold reached for Guest API requests', severity: 'info', time: '3 hours ago' }
                ]);
            } catch (err) {
                console.error('Failed to load analytics', err);
            }
        };

        fetchAnalytics();
    }, []);

    if (!hasRole('admin')) {
        return (
            <div className="analytics-page restricted">
                <div className="empty-state card">
                    <AlertTriangle size={64} className="icon-danger" />
                    <h2>Access Denied</h2>
                    <p>You must be an administrator to view system analytics.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="analytics-page">
            <div className="page-header">
                <div>
                    <h1>Analytics & Infrastructure Hub</h1>
                    <p className="subtitle">Real-time system telemetry and platform engagement metrics.</p>
                </div>
            </div>

            <div className="analytics-overview-cards">
                <div className="stat-card blue">
                    <div className="stat-content">
                        <span className="stat-label">Active Pods</span>
                        <span className="stat-value">24<span className="stat-trend positive">↑ 2</span></span>
                    </div>
                    <div className="stat-icon"><Server /></div>
                </div>
                <div className="stat-card purple">
                    <div className="stat-content">
                        <span className="stat-label">Total Users</span>
                        <span className="stat-value">1,248<span className="stat-trend positive">↑ 12%</span></span>
                    </div>
                    <div className="stat-icon"><Users /></div>
                </div>
                <div className="stat-card green">
                    <div className="stat-content">
                        <span className="stat-label">API Requests / min</span>
                        <span className="stat-value">845<span className="stat-trend neutral">- 0%</span></span>
                    </div>
                    <div className="stat-icon"><Activity /></div>
                </div>
                <div className="stat-card orange">
                    <div className="stat-content">
                        <span className="stat-label">DB Storage Used</span>
                        <span className="stat-value">4.2 GB<span className="stat-trend negative">↑ 1GB</span></span>
                    </div>
                    <div className="stat-icon"><Database /></div>
                </div>
            </div>

            <div className="charts-grid">
                <div className="chart-card card col-span-2">
                    <div className="chart-header">
                        <h3>System Resource Utilization (24h)</h3>
                    </div>
                    <div className="chart-container">
                        <ResponsiveContainer width="100%" height={300}>
                            <AreaChart data={systemMetrics} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="colorCpu" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                                    </linearGradient>
                                    <linearGradient id="colorMem" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <XAxis dataKey="timestamp" stroke="var(--text-tertiary)" fontSize={12} tickMargin={10} />
                                <YAxis stroke="var(--text-tertiary)" fontSize={12} unit="%" />
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-light)" />
                                <Tooltip
                                    contentStyle={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-strong)', borderRadius: '8px' }}
                                    itemStyle={{ fontSize: '14px' }}
                                />
                                <Legend iconType="circle" />
                                <Area type="monotone" dataKey="cpu" name="CPU Usage" stroke="#6366f1" strokeWidth={2} fillOpacity={1} fill="url(#colorCpu)" />
                                <Area type="monotone" dataKey="memory" name="Memory Usage" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorMem)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="chart-card card">
                    <div className="chart-header">
                        <h3>Platform Engagement (7 Days)</h3>
                    </div>
                    <div className="chart-container">
                        <ResponsiveContainer width="100%" height={300}>
                            <BarChart data={engagementMetrics} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-light)" />
                                <XAxis dataKey="date" stroke="var(--text-tertiary)" fontSize={12} tickMargin={10} />
                                <YAxis stroke="var(--text-tertiary)" fontSize={12} />
                                <Tooltip
                                    cursor={{ fill: 'var(--bg-hover)' }}
                                    contentStyle={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-strong)', borderRadius: '8px' }}
                                />
                                <Legend iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
                                <Bar dataKey="posts" name="Feed Posts" fill="#6366f1" radius={[4, 4, 0, 0]} stackId="a" />
                                <Bar dataKey="jobs" name="Job Applications" fill="#f59e0b" radius={[4, 4, 0, 0]} stackId="a" />
                                <Bar dataKey="events" name="Event RSVPs" fill="#ec4899" radius={[4, 4, 0, 0]} stackId="a" />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="alerts-card card">
                    <div className="chart-header">
                        <h3>System Alerts</h3>
                        <span className="badge-danger">{alerts.length} Active</span>
                    </div>
                    <div className="alerts-list">
                        {alerts.map(alert => (
                            <div key={alert.id} className={`alert-item ${alert.severity}`}>
                                <div className="alert-icon">
                                    <AlertTriangle size={18} />
                                </div>
                                <div className="alert-content">
                                    <p>{alert.message}</p>
                                    <span>{alert.time}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};
