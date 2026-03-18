import Keycloak from 'keycloak-js';

// Keycloak is exposed via the NGINX ingress at /auth
// In production: https://miniproject.local/auth
// In dev: vite proxy forwards /auth → https://miniproject.local
const keycloak = new Keycloak({
    url: '/auth',        // relative — resolved by vite proxy in dev, ingress in production
    realm: 'miniproject',
    clientId: 'react-web-app',
});

// Module-level singleton — init runs ONCE at module load time.
// Both AuthContext and the axios interceptor share this same promise so
// API calls always wait for authentication to complete before attaching tokens.
export const keycloakInitPromise: Promise<boolean> = keycloak.init({
    onLoad: 'login-required',  // redirects to Keycloak if not authenticated,
                               // exchanges ?code= for token on the way back
    pkceMethod: 'S256',
    checkLoginIframe: false,   // prevents background iframe pings through proxy
});

export const getKeycloakToken = () => keycloak.token;

export default keycloak;
