import Keycloak from 'keycloak-js';

// Keycloak is exposed via the NGINX ingress at /auth
// In production: http://miniproject.local/auth
// In dev: vite proxy forwards /auth → http://miniproject.local
const keycloak = new Keycloak({
    url: '/auth',        // relative — resolved by vite proxy in dev, ingress in production
    realm: 'miniproject',
    clientId: 'react-web-app',
});

export const getKeycloakToken = () => keycloak.token;

export default keycloak;
