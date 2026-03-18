import React, { createContext, useContext, useEffect, useState } from 'react';
import keycloak, { keycloakInitPromise } from '../lib/keycloak';

// keycloakInitPromise is defined in lib/keycloak.ts so the axios interceptor
// can also await it — ensuring no API call fires without a token.

interface AuthContextType {
    isAuthenticated: boolean;
    isInitialized: boolean;
    authError: string | null;
    user: any;
    login: () => void;
    logout: () => void;
    hasRole: (role: string) => boolean;
}

export const AuthContext = createContext<AuthContextType>({
    isAuthenticated: false,
    isInitialized: false,
    authError: null,
    user: null,
    login: () => { },
    logout: () => { },
    hasRole: () => false,
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [isInitialized, setIsInitialized] = useState(false);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [authError, setAuthError] = useState<string | null>(null);
    const [user, setUser] = useState<any>(null);

    useEffect(() => {
        let isMounted = true;

        keycloakInitPromise
            .then(async (authenticated) => {
                if (!isMounted) return;
                setIsAuthenticated(authenticated);
                if (authenticated) {
                    const token = keycloak.tokenParsed as Record<string, any> | undefined;
                    const tokenUser = {
                        sub: token?.sub,
                        username: token?.preferred_username,
                        firstName: token?.given_name,
                        lastName: token?.family_name,
                        email: token?.email,
                    };

                    if (isMounted) setUser(tokenUser);

                    try {
                        const profile = await keycloak.loadUserProfile();
                        if (isMounted) setUser({ ...tokenUser, ...profile, sub: token?.sub });
                    } catch (profileError) {
                        // Some Keycloak setups block /account cross-origin; token claims are enough for UI identity.
                        console.warn('Keycloak profile fetch failed; using token claims only', profileError);
                    }
                }
                setIsInitialized(true);
            })
            .catch((error) => {
                console.error('Keycloak init failed', error);
                if (isMounted) {
                    setAuthError(error instanceof Error ? error.message : 'Authentication initialization failed.');
                    setIsInitialized(true);
                }
            });

        return () => {
            isMounted = false;
        };
    }, []);

    const login = () => keycloak.login();
    const logout = () => keycloak.logout();
    const hasRole = (role: string) => keycloak.hasResourceRole(role) || keycloak.hasRealmRole(role);

    return (
        <AuthContext.Provider value={{ isAuthenticated, isInitialized, authError, user, login, logout, hasRole }}>
            {children}
        </AuthContext.Provider>
    );
};
