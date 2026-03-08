import React, { useState, useEffect, useRef } from 'react';
import { FlaskConical, Users, FileText, Upload, Plus, X, UserPlus, FileArchive } from 'lucide-react';
import { api } from '../../lib/axios';
import { useAuth } from '../../contexts/AuthContext';
import { useSearch } from '../../contexts/SearchContext';
import './Research.css';

interface Document {
    _id: string;
    name: string;
    url: string;
    size: number;
    uploadedAt: string;
}

interface Project {
    _id: string;
    title: string;
    description: string;
    status: 'active' | 'completed' | 'archived';
    ownerId: string;
    collaborators: { userId: string; email: string; role: string }[];
    documents: Document[];
}

export const Research: React.FC = () => {
    const { user } = useAuth();
    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(false);

    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newProject, setNewProject] = useState({ title: '', description: '' });

    const [inviteModalProjId, setInviteModalProjId] = useState<string | null>(null);
    const [inviteEmail, setInviteEmail] = useState('');
    const [inviteRole, setInviteRole] = useState('researcher');

    const fileInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});
    const [uploadingDocId, setUploadingDocId] = useState<string | null>(null);

    const fetchProjects = async () => {
        try {
            setLoading(true);
            const res = await api.get('/api/v1/research-service/research');
            const raw = Array.isArray(res.data) ? res.data : (res.data?.projects ?? res.data?.items ?? []);
            setProjects(raw.map((p: any) => ({
                ...p,
                collaborators: (p.collaborators ?? []).map((c: any) => ({
                    ...c,
                    email: c.email ?? c.userId ?? 'unknown',
                    role: c.role ?? 'collaborator',
                })),
                documents: p.documents ?? [],
                status: p.status ?? 'active',
            })));
        } catch (err) {
            console.error('Failed to load projects', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchProjects();
    }, []);

    const handleCreateProject = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const res = await api.post('/api/v1/research-service/research', newProject);
            setProjects(prev => [res.data, ...prev]);
            setShowCreateModal(false);
            setNewProject({ title: '', description: '' });
        } catch (err) {
            alert('Failed to create project.');
        }
    };

    const handleInvite = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!inviteModalProjId) return;
        try {
            const res = await api.post(`/api/v1/research-service/research/${inviteModalProjId}/invite`, {
                email: inviteEmail,
                role: inviteRole
            });
            // API typically returns the updated project
            setProjects(prev => prev.map(p => p._id === inviteModalProjId ? res.data : p));
            setInviteModalProjId(null);
            setInviteEmail('');
        } catch (err) {
            alert('Failed to invite collaborator.');
        }
    };

    const handleFileUpload = async (projectId: string, file: File) => {
        try {
            setUploadingDocId(projectId);
            const formData = new FormData();
            formData.append('file', file);

            const res = await api.post(`/api/v1/research-service/research/${projectId}/documents`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            setProjects(prev => prev.map(p => p._id === projectId ? res.data : p));
        } catch (err) {
            alert('Failed to upload document.');
        } finally {
            setUploadingDocId(null);
            if (fileInputRefs.current[projectId]) {
                fileInputRefs.current[projectId]!.value = '';
            }
        }
    };

    const { query } = useSearch();
    const filteredProjects = query
        ? projects.filter(p => `${p.title ?? ''} ${p.description ?? ''}`.toLowerCase().includes(query.toLowerCase()))
        : projects;

    return (
        <div className="research-page">
            <div className="page-header">
                <div>
                    <h1>Research Collaboration</h1>
                    <p className="subtitle">Manage research projects, share datasets, and collaborate with peers.</p>
                </div>
                <button className="primary-btn" onClick={() => setShowCreateModal(true)}>
                    <Plus size={18} />
                    <span>New Project</span>
                </button>
            </div>

            <div className="projects-grid">
                {loading ? (
                    <div className="loading-state">Loading projects...</div>
                ) : filteredProjects.length > 0 ? (
                    filteredProjects.map(project => (
                        <div key={project._id} className="project-card card">
                            <div className="project-header">
                                <div>
                                    <div className="title-row">
                                        <h3>{project.title}</h3>
                                        <span className={`status-badge ${project.status}`}>{project.status}</span>
                                    </div>
                                    <p className="project-desc">{project.description}</p>
                                </div>
                            </div>

                            <div className="project-section">
                                <div className="section-header-small">
                                    <span className="section-title"><Users size={16} /> Collaborators</span>
                                    {project.ownerId === (user?.sub || 'me') && (
                                        <button className="text-btn" onClick={() => setInviteModalProjId(project._id)}>
                                            <UserPlus size={14} /> Invite
                                        </button>
                                    )}
                                </div>
                                <div className="collaborators-list">
                                    <div className="collab-avatar owner tooltip" title="Project Owner">O</div>
                                    {project.collaborators?.map((c, idx) => (
                                        <div key={idx} className="collab-avatar tooltip" title={`${c.email} (${c.role})`}>
                                            {(c.email ?? '?').charAt(0).toUpperCase()}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="project-section">
                                <div className="section-header-small">
                                    <span className="section-title"><FileArchive size={16} /> Documents</span>
                                    <button
                                        className="text-btn"
                                        onClick={() => fileInputRefs.current[project._id]?.click()}
                                        disabled={uploadingDocId === project._id}
                                    >
                                        <Upload size={14} /> Upload
                                    </button>
                                    <input
                                        type="file"
                                        style={{ display: 'none' }}
                                        ref={el => { fileInputRefs.current[project._id] = el; }}
                                        onChange={(e) => {
                                            if (e.target.files && e.target.files[0]) {
                                                handleFileUpload(project._id, e.target.files[0]);
                                            }
                                        }}
                                    />
                                </div>
                                <div className="documents-list">
                                    {uploadingDocId === project._id && <div className="doc-item loading">Uploading...</div>}
                                    {project.documents?.length > 0 ? (
                                        project.documents.map(doc => (
                                            <div key={doc._id} className="doc-item">
                                                <FileText size={16} className="doc-icon" />
                                                <div className="doc-info">
                                                    <a href={doc.url} target="_blank" rel="noopener noreferrer" className="doc-name">{doc.name}</a>
                                                    <span className="doc-size">{((doc.size ?? 0) / 1024).toFixed(1)} KB</span>
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        uploadingDocId !== project._id && <div className="empty-docs">No documents uploaded yet.</div>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="empty-state card">
                        <FlaskConical size={48} className="empty-icon" />
                        <h3>No active research projects</h3>
                        <p>Create a new project to start collaborating.</p>
                    </div>
                )}
            </div>

            {/* Create Project Modal */}
            {showCreateModal && (
                <div className="modal-overlay">
                    <div className="modal-content card">
                        <div className="modal-header">
                            <h2>New Research Project</h2>
                            <button className="icon-btn" onClick={() => setShowCreateModal(false)}><X size={24} /></button>
                        </div>
                        <form className="modal-form" onSubmit={handleCreateProject}>
                            <div className="form-group">
                                <label>Project Title</label>
                                <input required type="text" value={newProject.title} onChange={e => setNewProject({ ...newProject, title: e.target.value })} />
                            </div>
                            <div className="form-group">
                                <label>Abstract / Description</label>
                                <textarea required rows={4} value={newProject.description} onChange={e => setNewProject({ ...newProject, description: e.target.value })}></textarea>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="cancel-btn" onClick={() => setShowCreateModal(false)}>Cancel</button>
                                <button type="submit" className="primary-btn">Create Project</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Invite Modal */}
            {inviteModalProjId && (
                <div className="modal-overlay">
                    <div className="modal-content card small">
                        <div className="modal-header">
                            <h2>Invite Collaborator</h2>
                            <button className="icon-btn" onClick={() => setInviteModalProjId(null)}><X size={24} /></button>
                        </div>
                        <form className="modal-form" onSubmit={handleInvite}>
                            <div className="form-group">
                                <label>Email Address</label>
                                <input required type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} />
                            </div>
                            <div className="form-group">
                                <label>Role</label>
                                <select value={inviteRole} onChange={e => setInviteRole(e.target.value)}>
                                    <option value="researcher">Researcher</option>
                                    <option value="supervisor">Supervisor</option>
                                    <option value="reviewer">Reviewer</option>
                                </select>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="cancel-btn" onClick={() => setInviteModalProjId(null)}>Cancel</button>
                                <button type="submit" className="primary-btn">Send Invite</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};
