import React, { createContext, useContext, useEffect, useState } from 'react';
import keycloak, { keycloakInitPromise } from '../lib/keycloak';

// keycloakInitPromise is defined in lib/keycloak.ts so the axios interceptor
// can also await it — ensuring no API call fires without a token.

interface AuthContextType {
    isAuthenticated: boolean;
    isInitialized: boolean;
    user: any;
    login: () => void;
    logout: () => void;
    hasRole: (role: string) => boolean;
}

export const AuthContext = createContext<AuthContextType>({
    isAuthenticated: false,
    isInitialized: false,
    user: null,
    login: () => { },
    logout: () => { },
    hasRole: () => false,
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [isInitialized, setIsInitialized] = useState(false);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [user, setUser] = useState<any>(null);

    useEffect(() => {
        let isMounted = true;

        keycloakInitPromise
            .then(async (authenticated) => {
                if (!isMounted) return;
                setIsAuthenticated(authenticated);
                if (authenticated) {
                    const profile = await keycloak.loadUserProfile();
                    if (isMounted) setUser(profile);
                }
                setIsInitialized(true);
            })
            .catch((error) => {
                console.error('Keycloak init failed', error);
                if (isMounted) setIsInitialized(true);
            });

        return () => {
            isMounted = false;
        };
    }, []);

    const login = () => keycloak.login();
    const logout = () => keycloak.logout();
    const hasRole = (role: string) => keycloak.hasResourceRole(role) || keycloak.hasRealmRole(role);

    return (
        <AuthContext.Provider value={{ isAuthenticated, isInitialized, user, login, logout, hasRole }}>
            {children}
        </AuthContext.Provider>
    );
};
