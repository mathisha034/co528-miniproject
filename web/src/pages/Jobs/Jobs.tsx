import React, { useState, useEffect } from 'react';
import { Briefcase, MapPin, Clock, Plus, X } from 'lucide-react';
import { api } from '../../lib/axios';
import { useAuth } from '../../contexts/AuthContext';
import './Jobs.css';

interface Job {
    _id: string;
    title: string;
    company: string;
    location: string;
    type: string;
    description: string;
    requirements: string[];
    deadline: string;
    postedBy: string;
    applications: string[];
    createdAt: string;
}

export const Jobs: React.FC = () => {
    const { user, hasRole } = useAuth();
    const [jobs, setJobs] = useState<Job[]>([]);
    const [loading, setLoading] = useState(false);
    const [filter, setFilter] = useState('all'); // all, full-time, part-time, internship, research

    const [showModal, setShowModal] = useState(false);
    const [formData, setFormData] = useState({
        title: '', company: '', location: '', type: 'full-time', description: '', requirements: '', deadline: ''
    });

    const fetchJobs = async (currentFilter: string) => {
        try {
            setLoading(true);
            const res = await api.get('/api/v1/job-service/jobs', {
                params: { type: currentFilter !== 'all' ? currentFilter : undefined }
            });
            setJobs(res.data || []);
        } catch (err) {
            console.error('Failed to load jobs', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchJobs(filter);
    }, [filter]);

    const handleApply = async (jobId: string) => {
        try {
            await api.post(`/api/v1/job-service/jobs/${jobId}/apply`);
            alert('Application submitted successfully!');

            // Update UI optimistically
            const userId = user?.sub || 'me';
            setJobs(prev => prev.map(job =>
                job._id === jobId ? { ...job, applications: [...job.applications, userId] } : job
            ));
        } catch (err) {
            console.error('Application failed', err);
            alert('Failed to submit application. You might have already applied.');
        }
    };

    const handleCreateJob = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const payload = {
                ...formData,
                requirements: formData.requirements.split(',').map(req => req.trim())
            };
            const res = await api.post('/api/v1/job-service/jobs', payload);
            setJobs(prev => [res.data, ...prev]);
            setShowModal(false);
            setFormData({ title: '', company: '', location: '', type: 'full-time', description: '', requirements: '', deadline: '' });
        } catch (err) {
            console.error('Failed to create job', err);
            alert('Failed to post opportunity.');
        }
    };

    const canPostJob = hasRole('admin') || hasRole('alumni');

    return (
        <div className="jobs-page">
            <div className="page-header">
                <div>
                    <h1>Jobs & Internships</h1>
                    <p className="subtitle">Discover opportunities posted by the alumni network and administration.</p>
                </div>
                {canPostJob && (
                    <button className="primary-btn" onClick={() => setShowModal(true)}>
                        <Plus size={18} />
                        <span>Post Opportunity</span>
                    </button>
                )}
            </div>

            <div className="filter-tabs">
                {['all', 'full-time', 'internship', 'research'].map(tab => (
                    <button
                        key={tab}
                        className={`filter-tab ${filter === tab ? 'active' : ''}`}
                        onClick={() => setFilter(tab)}
                    >
                        {tab.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
                    </button>
                ))}
            </div>

            <div className="jobs-grid">
                {loading ? (
                    <div className="loading-state">Loading opportunities...</div>
                ) : jobs.length > 0 ? (
                    jobs.map(job => {
                        const hasApplied = job.applications.includes(user?.sub || 'me');

                        return (
                            <div key={job._id} className="job-card card">
                                <div className="job-card-header">
                                    <div className="job-title-wrapper">
                                        <h3 className="job-title">{job.title}</h3>
                                        <span className={`job-type-badge ${job.type}`}>{job.type}</span>
                                    </div>
                                    <button
                                        className={`apply-btn ${hasApplied ? 'applied' : ''}`}
                                        onClick={() => handleApply(job._id)}
                                        disabled={hasApplied}
                                    >
                                        {hasApplied ? 'Applied ✓' : 'Apply Now'}
                                    </button>
                                </div>

                                <h4 className="job-company">{job.company}</h4>

                                <div className="job-meta">
                                    <span className="meta-item"><MapPin size={16} /> {job.location}</span>
                                    <span className="meta-item"><Clock size={16} /> Deadline: {new Date(job.deadline).toLocaleDateString()}</span>
                                </div>

                                <p className="job-description">{job.description.substring(0, 150)}{job.description.length > 150 ? '...' : ''}</p>

                                <div className="job-tags">
                                    {job.requirements.slice(0, 3).map((req, idx) => (
                                        <span key={idx} className="job-tag">{req}</span>
                                    ))}
                                    {job.requirements.length > 3 && <span className="job-tag">+{job.requirements.length - 3} more</span>}
                                </div>
                            </div>
                        );
                    })
                ) : (
                    <div className="empty-state card">
                        <Briefcase size={48} className="empty-icon" />
                        <h3>No opportunities found</h3>
                        <p>Check back later or try changing your filters.</p>
                    </div>
                )}
            </div>

            {showModal && (
                <div className="modal-overlay">
                    <div className="modal-content card">
                        <div className="modal-header">
                            <h2>Post a New Opportunity</h2>
                            <button className="icon-btn" onClick={() => setShowModal(false)}><X size={24} /></button>
                        </div>
                        <form className="job-form" onSubmit={handleCreateJob}>
                            <div className="form-group">
                                <label>Job Title</label>
                                <input required type="text" value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value })} />
                            </div>
                            <div className="form-row">
                                <div className="form-group">
                                    <label>Company</label>
                                    <input required type="text" value={formData.company} onChange={e => setFormData({ ...formData, company: e.target.value })} />
                                </div>
                                <div className="form-group">
                                    <label>Location</label>
                                    <input required type="text" value={formData.location} onChange={e => setFormData({ ...formData, location: e.target.value })} />
                                </div>
                            </div>
                            <div className="form-row">
                                <div className="form-group">
                                    <label>Job Type</label>
                                    <select value={formData.type} onChange={e => setFormData({ ...formData, type: e.target.value })}>
                                        <option value="full-time">Full Time</option>
                                        <option value="part-time">Part Time</option>
                                        <option value="internship">Internship</option>
                                        <option value="research">Research</option>
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>Application Deadline</label>
                                    <input required type="date" value={formData.deadline} onChange={e => setFormData({ ...formData, deadline: e.target.value })} />
                                </div>
                            </div>
                            <div className="form-group">
                                <label>Requirements (comma-separated)</label>
                                <input required type="text" placeholder="e.g. React, Node.js, 2 years exp" value={formData.requirements} onChange={e => setFormData({ ...formData, requirements: e.target.value })} />
                            </div>
                            <div className="form-group">
                                <label>Description</label>
                                <textarea required rows={4} value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })}></textarea>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="cancel-btn" onClick={() => setShowModal(false)}>Cancel</button>
                                <button type="submit" className="primary-btn">Post Job</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};
