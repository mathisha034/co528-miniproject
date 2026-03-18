# Auth HTTPS Migration Note (Cookie Error Fix)

Date: 2026-03-18
Status: Implemented and validated in cluster

## Purpose

This change records the migration from HTTP auth ingress to HTTPS-first auth ingress to fix the Keycloak login error:

Cookie not found. Please make sure cookies are enabled in your browser.

## Problem Summary

When auth traffic was served over HTTP, Keycloak session cookies (with Secure + SameSite=None attributes) could be rejected by browser policy during redirect callbacks.

Result:
- Login flow intermittently or consistently failed with cookie/session errors.

## Previous vs New Implementation

Previous implementation:
- Auth commonly used through http://miniproject.local/auth
- No enforced SSL redirect on ingress
- Cookie behavior depended on browser leniency for non-HTTPS flow

New implementation:
- HTTPS-first auth via https://miniproject.local/auth
- Enforced redirects from HTTP to HTTPS
- TLS secret attached to ingress resources
- Stable cookie/session behavior aligned with modern browser policy

## Files Updated (Implementation)

Kubernetes ingress resources:
- k8s/auth-ingress.yaml
- k8s/ingress.yaml
- k8s/minio-ingress.yaml

Applied settings:
- nginx.ingress.kubernetes.io/ssl-redirect: "true"
- nginx.ingress.kubernetes.io/force-ssl-redirect: "true"
- spec.tls.hosts includes miniproject.local
- spec.tls.secretName set to miniproject-tls-secret

## Environment Note

cert-manager CRDs were not available in the active cluster during implementation.

Fallback used:
- Generated self-signed certificate locally
- Created/updated TLS secret miniproject-tls-secret
- Applied ingress manifests with TLS and SSL redirect enabled

When cert-manager is available, k8s/certificate.yaml remains the preferred managed path.

## Validation Performed

1. Ingress TLS binding:
- All relevant ingresses reference miniproject-tls-secret

2. Redirect behavior:
- HTTP auth endpoint returns 308 redirect to HTTPS

3. HTTPS auth endpoint:
- OIDC well-known endpoint returns 200 over HTTPS

4. Cookie/session behavior:
- Keycloak authorize endpoint over HTTPS returns AUTH_SESSION_ID cookie with expected secure attributes

## Operational Guidance

For development and testing:
- Use HTTPS auth path: https://miniproject.local/auth
- If using self-signed certs, trust the cert locally to avoid browser warnings

For long-term production-like setup:
- Install cert-manager CRDs
- Use k8s/certificate.yaml for certificate lifecycle management
- Keep frontend Keycloak URL as relative /auth so ingress controls protocol

## Traceability

Related records were also updated in:
- docs/known_issues/errors_log.md
- docs/known_issues/error_fixing_tasks.md
- docs/task.md
- docs/implementation_plan_v5.md
- GETTING_STARTED.md
