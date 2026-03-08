import React from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

export const Layout: React.FC = () => {
    return (
        <div className="app-container">
            <Sidebar />
            <div className="main-wrapper">
                <Topbar />
                <main className="main-content">
                    <Outlet />
                </main>
            </div>
        </div>
    );
};
