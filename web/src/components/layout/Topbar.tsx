import React, { useState, useEffect } from 'react';
import { Bell, Search } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useSearch } from '../../contexts/SearchContext';
import { api } from '../../lib/axios';
import './Topbar.css';

// Pages where the search bar is not relevant
const SEARCH_HIDDEN_PATHS = ['/', '/profile', '/analytics', '/infra'];

export const Topbar: React.FC = () => {
    const { user, hasRole } = useAuth();
    const { query, setQuery } = useSearch();
    const navigate = useNavigate();
    const location = useLocation();
    const [unreadCount, setUnreadCount] = useState(0);
    const [profileName, setProfileName] = useState<string>('');
    const hideSearch = SEARCH_HIDDEN_PATHS.includes(location.pathname);

    const getDisplayRole = () => {
        if (hasRole('admin')) return 'Admin';
        if (hasRole('alumni')) return 'Alumni';
        if (hasRole('student')) return 'Student';
        return 'User';
    };

    // Derive display name: prefer DB-stored name, fallback to Keycloak profile
    const displayName = profileName
        || (user?.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : '')
        || user?.username
        || 'Guest';

    const avatarInitial = displayName.charAt(0).toUpperCase() || 'U';

    useEffect(() => {
        // Re-fetch profile name on every route change so edits are reflected immediately
        api.get('/api/v1/user-service/users/me')
            .then(res => { if (res.data?.name) setProfileName(res.data.name); })
            .catch(() => { });
        // Clear search query on every page navigation
        setQuery('');
    }, [location.pathname]);

    useEffect(() => {
        // Fetch unread notification count
        const fetchCount = () => {
            api.get('/api/v1/notification-service/notifications/count')
                .then(res => setUnreadCount(res.data.count || 0))
                .catch(() => { });
        };
        fetchCount();
        const interval = setInterval(fetchCount, 30000);
        return () => clearInterval(interval);
    }, []);

    return (
        <header className="topbar">
            <div className="topbar-left">
                {!hideSearch && (
                    <div className="search-bar">
                        <Search size={18} className="search-icon" />
                        <input
                            type="text"
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            placeholder="Search..."
                            className="search-input"
                        />
                    </div>
                )}
            </div>

            <div className="topbar-right">
                <button className="notification-btn" onClick={() => navigate('/notifications')} title="Notifications">
                    <Bell size={22} />
                    {unreadCount > 0 && <span className="notification-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>}
                </button>

                <div className="user-profile" onClick={() => navigate('/profile')} style={{ cursor: 'pointer' }} title="Go to profile">
                    <div className="user-info">
                        <span className="user-name">{displayName}</span>
                        <span className="user-role">{getDisplayRole()}</span>
                    </div>
                    <div className="user-avatar">
                        {avatarInitial}
                    </div>
                </div>
            </div>
        </header>
    );
};
