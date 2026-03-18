import Keycloak from 'keycloak-js';

// Use explicit Keycloak host to keep all auth cookies and login-actions on the
// same origin. Using proxied localhost /auth can break cookie continuity when
// Keycloak emits absolute action URLs on miniproject.local.
const KEYCLOAK_URL = import.meta.env.VITE_KEYCLOAK_URL || 'https://miniproject.local/auth';

const keycloak = new Keycloak({
    url: KEYCLOAK_URL,
    realm: 'miniproject',
    clientId: 'react-web-app',
});

export const insecureOriginAuthMessage =
    'Authentication requires HTTPS origin. Start the web app with `npm run dev:https` and use https://localhost:5174, or use https://miniproject.local.';

const isInsecureLocalhostAuthContext =
    typeof window !== 'undefined' &&
    window.location.hostname === 'localhost' &&
    window.location.protocol !== 'https:';

// Module-level singleton — init runs ONCE at module load time.
// Both AuthContext and the axios interceptor share this same promise so
// API calls always wait for authentication to complete before attaching tokens.
export const keycloakInitPromise: Promise<boolean> = isInsecureLocalhostAuthContext
    ? Promise.reject(new Error(insecureOriginAuthMessage))
    : keycloak.init({
        onLoad: 'login-required',  // redirects to Keycloak if not authenticated,
                                   // exchanges ?code= for token on the way back
        pkceMethod: 'S256',
        checkLoginIframe: false,   // prevents background iframe pings through proxy
    });

export const getKeycloakToken = () => keycloak.token;

export default keycloak;
