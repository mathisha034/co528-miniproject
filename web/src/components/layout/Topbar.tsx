import React, { useState, useEffect } from 'react';
import { Bell, Search } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { api } from '../../lib/axios';
import './Topbar.css';

export const Topbar: React.FC = () => {
    const { user, hasRole } = useAuth();
    const [unreadCount, setUnreadCount] = useState(0);

    const getDisplayRole = () => {
        if (hasRole('admin')) return 'Admin';
        if (hasRole('alumni')) return 'Alumni';
        if (hasRole('student')) return 'Student';
        return 'User';
    };

    useEffect(() => {
        const fetchCount = () => {
            api.get('/api/v1/notification-service/notifications/count')
                .then(res => setUnreadCount(res.data.count || 0))
                .catch(() => { });
        };

        fetchCount();
        const interval = setInterval(fetchCount, 30000); // poll every 30s
        return () => clearInterval(interval);
    }, []);

    return (
        <header className="topbar">
            <div className="topbar-left">
                <div className="search-bar">
                    <Search size={18} className="search-icon" />
                    <input type="text" placeholder="Search..." className="search-input" />
                </div>
            </div>

            <div className="topbar-right">
                <button className="notification-btn">
                    <Bell size={22} />
                    {unreadCount > 0 && <span className="notification-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>}
                </button>

                <div className="user-profile">
                    <div className="user-info">
                        <span className="user-name">{user?.firstName || 'Guest'} {user?.lastName || ''}</span>
                        <span className="user-role">{getDisplayRole()}</span>
                    </div>
                    <div className="user-avatar">
                        {user?.firstName?.charAt(0) || 'U'}
                    </div>
                </div>
            </div>
        </header>
    );
};
