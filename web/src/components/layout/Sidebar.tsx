import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Rss, Briefcase, CalendarDays, FlaskConical, Bell, User, LogOut } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import './Sidebar.css';

interface NavItemProps {
    to: string;
    icon: React.ReactNode;
    label: string;
}

const NavItem: React.FC<NavItemProps> = ({ to, icon, label }) => (
    <NavLink
        to={to}
        className={({ isActive }) => `sidebar-nav-item ${isActive ? 'active' : ''}`}
    >
        <div className="sidebar-nav-icon">{icon}</div>
        <span className="sidebar-nav-label">{label}</span>
    </NavLink>
);

export const Sidebar: React.FC = () => {
    const { logout, hasRole } = useAuth();

    return (
        <aside className="sidebar">
            <div className="sidebar-header">
                <h2 className="sidebar-logo">Collabhub</h2>
            </div>

            <div className="sidebar-content">
                <div className="sidebar-section">
                    <h3 className="sidebar-section-title">Main</h3>
                    <nav className="sidebar-nav">
                        <NavItem to="/" icon={<LayoutDashboard size={20} />} label="Dashboard" />
                        <NavItem to="/feed" icon={<Rss size={20} />} label="Feed" />
                        <NavItem to="/jobs" icon={<Briefcase size={20} />} label="Jobs & Internships" />
                        <NavItem to="/events" icon={<CalendarDays size={20} />} label="Events" />
                    </nav>
                </div>

                <div className="sidebar-section">
                    <h3 className="sidebar-section-title">Collaborate</h3>
                    <nav className="sidebar-nav">
                        <NavItem to="/research" icon={<FlaskConical size={20} />} label="Research" />
                    </nav>
                </div>

                <div className="sidebar-section">
                    <h3 className="sidebar-section-title">Account</h3>
                    <nav className="sidebar-nav">
                        <NavItem to="/notifications" icon={<Bell size={20} />} label="Notifications" />
                        <NavItem to="/profile" icon={<User size={20} />} label="Profile" />
                    </nav>
                </div>

                {hasRole('admin') && (
                    <div className="sidebar-section">
                        <h3 className="sidebar-section-title">Admin</h3>
                        <nav className="sidebar-nav">
                            <NavItem to="/analytics" icon={<LayoutDashboard size={20} />} label="Analytics" />
                            <NavItem to="/infra" icon={<LayoutDashboard size={20} />} label="Infrastructure" />
                        </nav>
                    </div>
                )}
            </div>

            <div className="sidebar-footer">
                <button onClick={logout} className="sidebar-logout-btn">
                    <LogOut size={20} />
                    <span>Logout</span>
                </button>
            </div>
        </aside>
    );
};
