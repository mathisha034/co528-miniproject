import axios from 'axios';
import keycloak, { keycloakInitPromise } from './keycloak';

// baseURL is intentionally empty — each component constructs the full path
// Service routes follow the ingress pattern: /{service-name}/api/v1/{endpoint}
// Example: /feed-service/api/v1/posts
export const api = axios.create({
    baseURL: '',
    timeout: 10000,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Request interceptor to attach Bearer token.
// Awaits keycloakInitPromise first so that requests fired during initial render
// (before the token is available) still get the Authorization header.
api.interceptors.request.use(
    async (config) => {
        // Wait for Keycloak to finish the auth code exchange before trying to
        // read the token — fixes 401s on the first batch of requests after login.
        await keycloakInitPromise;

        if (keycloak.token) {
            try {
                await keycloak.updateToken(30); // Refresh if it expires in <= 30 seconds
                config.headers.Authorization = `Bearer ${keycloak.token}`;
            } catch (error) {
                console.error('Failed to refresh token', error);
                keycloak.login();
            }
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);
