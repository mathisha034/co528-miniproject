import React, { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

interface ProtectedRouteProps {
    children: React.ReactNode;
    roles?: string[];
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, roles }) => {
    const { isAuthenticated, isInitialized, hasRole, login } = useAuth();

    // Trigger login AFTER render — calling side effects during render is forbidden in React
    // and causes redirect loops in StrictMode.
    useEffect(() => {
        if (isInitialized && !isAuthenticated) {
            login();
        }
    }, [isInitialized, isAuthenticated, login]);

    if (!isInitialized) {
        return (
            <div className="loading-screen" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'var(--font-body)' }}>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>⏳</div>
                    <p style={{ color: 'var(--text-secondary, #555)' }}>Loading authentication...</p>
                </div>
            </div>
        );
    }

    if (!isAuthenticated) {
        return (
            <div className="loading-screen" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'var(--font-body)' }}>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>🔐</div>
                    <p style={{ color: 'var(--text-secondary, #555)' }}>Redirecting to login...</p>
                </div>
            </div>
        );
    }

    if (roles && roles.length > 0) {
        const hasRequiredRole = roles.some(role => hasRole(role));
        if (!hasRequiredRole) {
            return <Navigate to="/unauthorized" replace />;
        }
    }

    return <>{children}</>;
};
