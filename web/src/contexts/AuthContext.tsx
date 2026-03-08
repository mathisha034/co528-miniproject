import React, { createContext, useContext, useEffect, useState } from 'react';
import keycloak from '../lib/keycloak';

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
        const initKeycloak = async () => {
            try {
                const authenticated = await keycloak.init({
                    onLoad: 'check-sso',
                    silentCheckSsoRedirectUri: window.location.origin + '/silent-check-sso.html',
                    pkceMethod: 'S256',
                });

                if (isMounted) {
                    setIsAuthenticated(authenticated);
                    if (authenticated) {
                        const profile = await keycloak.loadUserProfile();
                        setUser(profile);
                    }
                    setIsInitialized(true);
                }
            } catch (error) {
                console.error('Keycloak init failed', error);
                if (isMounted) setIsInitialized(true);
            }
        };

        initKeycloak();

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
