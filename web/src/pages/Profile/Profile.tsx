import React, { useState, useEffect } from 'react';
import { Edit2, Shield, Settings, X } from 'lucide-react';
import { api } from '../../lib/axios';
import { useAuth } from '../../contexts/AuthContext';
import './Profile.css';

interface UserProfile {
    _id: string;
    email: string;
    displayName?: string;
    bio?: string;
    department?: string;
    skills: string[];
    roles: string[];
}

export const Profile: React.FC = () => {
    const { user, hasRole } = useAuth();
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(false);
    const [isEditing, setIsEditing] = useState(false);

    const [editFormData, setEditFormData] = useState({
        displayName: '', bio: '', department: '', skills: ''
    });

    const fetchProfile = async () => {
        try {
            setLoading(true);
            const res = await api.get('/api/v1/user-service/users/me');
            setProfile(res.data);
            setEditFormData({
                displayName: res.data.displayName || user?.firstName + ' ' + user?.lastName || '',
                bio: res.data.bio || '',
                department: res.data.department || '',
                skills: res.data.skills?.join(', ') || ''
            });
        } catch (err) {
            console.error('Failed to load profile from backend', err);
            // Fallback to Keycloak JS token info
            setProfile({
                _id: user?.sub,
                email: user?.email,
                displayName: user?.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : user?.username,
                skills: [],
                roles: []
            } as any);
            setEditFormData({
                displayName: user?.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : user?.username || '',
                bio: '',
                department: '',
                skills: ''
            });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchProfile(); }, []);

    const handleUpdateProfile = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const payload = {
                displayName: editFormData.displayName,
                bio: editFormData.bio,
                department: editFormData.department,
                skills: editFormData.skills.split(',').map(s => s.trim()).filter(Boolean)
            };
            const res = await api.patch('/api/v1/user-service/users/me', payload);
            setProfile(res.data);
            setIsEditing(false);
        } catch (err) {
            alert('Failed to update profile. Ensure the User Service is responding.');
        }
    };

    const getBadges = () => {
        const roles = [];
        if (hasRole('admin')) roles.push('Admin');
        if (hasRole('alumni')) roles.push('Alumni');
        if (hasRole('student')) roles.push('Student');
        if (roles.length === 0) roles.push('User');
        return roles;
    };

    return (
        <div className="profile-page">
            <div className="page-header">
                <div>
                    <h1>My Profile</h1>
                    <p className="subtitle">Manage your personal information and preferences.</p>
                </div>
            </div>

            {loading ? (
                <div className="loading-state">Loading profile...</div>
            ) : profile ? (
                <div className="profile-grid">
                    <div className="profile-main">
                        <div className="card profile-header-card">
                            <div className="profile-cover"></div>
                            <div className="profile-header-content">
                                <div className="profile-avatar-large">
                                    {profile.displayName?.charAt(0) || user?.firstName?.charAt(0) || 'U'}
                                </div>
                                <div className="profile-header-info">
                                    <div className="profile-name-row">
                                        <h2>{profile.displayName || user?.name || 'Unnamed User'}</h2>
                                        <button className="secondary-btn small" onClick={() => setIsEditing(true)}>
                                            <Edit2 size={16} /> Edit Profile
                                        </button>
                                    </div>
                                    <p className="profile-email">{profile.email || user?.email}</p>
                                    <p className="profile-department">{profile.department || 'No department specified'}</p>

                                    <div className="profile-badges">
                                        {getBadges().map(role => (
                                            <span key={role} className={`role-badge ${role.toLowerCase()}`}>{role}</span>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="card profile-details-card">
                            <h3>About Me</h3>
                            <p className="profile-bio">{profile.bio || 'No bio provided yet.'}</p>

                            <h3 className="mt-4">Skills & Expertise</h3>
                            <div className="skills-list">
                                {profile.skills?.length > 0 ? (
                                    profile.skills.map((skill, idx) => (
                                        <span key={idx} className="skill-tag">{skill}</span>
                                    ))
                                ) : (
                                    <p className="text-tertiary">No skills added.</p>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="profile-sidebar">
                        <div className="card auth-info-card">
                            <div className="card-header-icon">
                                <Shield size={20} className="icon-primary" />
                                <h3>Authentication</h3>
                            </div>
                            <div className="auth-status-list">
                                <div className="auth-stat-row">
                                    <span className="label">Identity Provider</span>
                                    <span className="value">Keycloak (OIDC)</span>
                                </div>
                                <div className="auth-stat-row">
                                    <span className="label">Account Status</span>
                                    <span className="value success">Active</span>
                                </div>
                                <div className="auth-stat-row">
                                    <span className="label">Session SSO</span>
                                    <span className="value">Verified</span>
                                </div>
                            </div>
                        </div>

                        <div className="card settings-card mt-6">
                            <div className="card-header-icon">
                                <Settings size={20} className="icon-tertiary" />
                                <h3>Preferences</h3>
                            </div>
                            <button className="settings-btn disabled" disabled>Change Password (SSO)</button>
                            <button className="settings-btn disabled" disabled>Email Notifications</button>
                            <button className="settings-btn disabled" disabled>Privacy Settings</button>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="error-state">Failed to load profile data.</div>
            )}

            {isEditing && (
                <div className="modal-overlay">
                    <div className="modal-content card small">
                        <div className="modal-header">
                            <h2>Edit Profile</h2>
                            <button className="icon-btn" onClick={() => setIsEditing(false)}><X size={24} /></button>
                        </div>
                        <form className="modal-form" onSubmit={handleUpdateProfile}>
                            <div className="form-group">
                                <label>Display Name</label>
                                <input required type="text" value={editFormData.displayName} onChange={e => setEditFormData({ ...editFormData, displayName: e.target.value })} />
                            </div>
                            <div className="form-group">
                                <label>Department / Major</label>
                                <input type="text" value={editFormData.department} onChange={e => setEditFormData({ ...editFormData, department: e.target.value })} />
                            </div>
                            <div className="form-group">
                                <label>Skills (comma separated)</label>
                                <input type="text" value={editFormData.skills} onChange={e => setEditFormData({ ...editFormData, skills: e.target.value })} />
                            </div>
                            <div className="form-group">
                                <label>Bio</label>
                                <textarea rows={4} value={editFormData.bio} onChange={e => setEditFormData({ ...editFormData, bio: e.target.value })}></textarea>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="cancel-btn" onClick={() => setIsEditing(false)}>Cancel</button>
                                <button type="submit" className="primary-btn">Save Changes</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};
