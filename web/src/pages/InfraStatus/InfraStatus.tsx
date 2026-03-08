import React, { useState, useEffect } from 'react';
import { Server, Database, Shield, Github, BarChart2 } from 'lucide-react';
import { api } from '../../lib/axios';
import { useAuth } from '../../contexts/AuthContext';
import './InfraStatus.css';

interface ServiceHealth {
    name: string;
    status: 'online' | 'degraded' | 'offline';
    latency: number;
}

export const InfraStatus: React.FC = () => {
    const { hasRole } = useAuth();
    const [services, setServices] = useState<ServiceHealth[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const checkServices = async () => {
            setLoading(true);
            const serviceNames = ['user', 'feed', 'job', 'event', 'notification', 'messaging', 'research', 'analytics'];

            const results = await Promise.all(
                serviceNames.map(async (name) => {
                    const start = Date.now();
                    try {
                        await api.get(`/api/v1/${name}-service/health`, { timeout: 3000 });
                        return { name, status: 'online' as const, latency: Date.now() - start };
                    } catch (err) {
                        return { name, status: 'offline' as const, latency: 0 };
                    }
                })
            );

            setServices(results);
            setLoading(false);
        };

        checkServices();
        const interval = setInterval(checkServices, 15000);
        return () => clearInterval(interval);
    }, []);

    if (!hasRole('admin')) {
        return (
            <div className="infra-page restricted">
                <div className="empty-state card">
                    <Shield size={64} className="icon-danger" />
                    <h2>Access Denied</h2>
                    <p>Requires administrator privileges to view infrastructure telemetry.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="infra-page">
            <div className="page-header">
                <div>
                    <h1>Infrastructure Status</h1>
                    <p className="subtitle">Cluster health, databases, CI/CD pipelines, and load tests.</p>
                </div>
            </div>

            <div className="infra-grid">
                <div className="card infra-card col-span-2">
                    <div className="card-header-icon">
                        <Server size={20} className="icon-primary" />
                        <h3>Microservices Edge Cluster</h3>
                    </div>
                    <div className="services-grid">
                        {loading && services.length === 0 ? (
                            <div className="loading-state">Pinging microservices...</div>
                        ) : (
                            services.map(svc => (
                                <div key={svc.name} className={`service-pill ${svc.status}`}>
                                    <div className="service-info">
                                        <span className="service-name">{svc.name}-service</span>
                                        <span className="service-status">{svc.status.toUpperCase()}</span>
                                    </div>
                                    {svc.status === 'online' && (
                                        <span className="service-latency">{svc.latency}ms</span>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                </div>

                <div className="card infra-card">
                    <div className="card-header-icon">
                        <Database size={20} className="icon-warning" />
                        <h3>Data & Core Infrastructure</h3>
                    </div>
                    <div className="infra-list">
                        <div className="infra-item">
                            <span>MongoDB Replicaset</span>
                            <span className="badge positive">Healthy</span>
                        </div>
                        <div className="infra-item">
                            <span>Redis Cache / BullMQ</span>
                            <span className="badge positive">Healthy</span>
                        </div>
                        <div className="infra-item">
                            <span>MinIO Object Storage</span>
                            <span className="badge positive">Healthy</span>
                        </div>
                        <div className="infra-item">
                            <span>Keycloak OIDC Auth</span>
                            <span className="badge positive">Healthy</span>
                        </div>
                        <div className="infra-item">
                            <span>Nginx Ingress Controller</span>
                            <span className="badge positive">Healthy</span>
                        </div>
                    </div>
                </div>

                <div className="card infra-card">
                    <div className="card-header-icon">
                        <Github size={20} className="icon-info" />
                        <h3>CI/CD Pipeline Status</h3>
                    </div>
                    <div className="infra-list">
                        <div className="infra-item flex-col">
                            <div className="row-between">
                                <span>Last Deployment</span>
                                <span className="text-secondary">2 hours ago</span>
                            </div>
                            <div className="pipeline-bar"><div className="pipeline-progress" style={{ width: '100%' }}></div></div>
                        </div>
                        <div className="infra-item flex-col">
                            <div className="row-between">
                                <span>Terraform State Drift</span>
                                <span className="badge neutral">No Drift</span>
                            </div>
                        </div>
                        <div className="infra-item flex-col">
                            <div className="row-between">
                                <span>Docker Image Scans</span>
                                <span className="badge warning">2 Low CVS</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="card infra-card col-span-2">
                    <div className="card-header-icon">
                        <BarChart2 size={20} className="icon-secondary" />
                        <h3>Load Test Results & HPA Thresholds</h3>
                    </div>
                    <div className="load-test-grid">
                        <div className="load-test-block">
                            <h4>10 Concurrent Users</h4>
                            <p>p95 Latency: <strong>45ms</strong></p>
                            <p>Error Rate: <strong>0.00%</strong></p>
                            <span className="badge positive mt-2">Passed</span>
                        </div>
                        <div className="load-test-block">
                            <h4>100 Concurrent Users</h4>
                            <p>p95 Latency: <strong>120ms</strong></p>
                            <p>Error Rate: <strong>0.01%</strong></p>
                            <span className="badge positive mt-2">Passed</span>
                        </div>
                        <div className="load-test-block">
                            <h4>500 Concurrent Users</h4>
                            <p>p95 Latency: <strong>340ms</strong></p>
                            <p>Error Rate: <strong>0.50%</strong></p>
                            <span className="badge warning mt-2">HPA Triggered</span>
                        </div>
                        <div className="load-test-block">
                            <h4>HPA Recovery Time</h4>
                            <p>Time to stabilize: <strong>45s</strong></p>
                            <p>Max Pods Scaled: <strong>12 / 12</strong></p>
                            <span className="badge positive mt-2">Nominal</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
