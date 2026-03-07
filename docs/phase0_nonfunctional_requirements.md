# Non-Functional Requirements

## Performance
| Metric | Target |
|---|---|
| API response time (p95) | < 500ms |
| Feed load time (cached) | < 100ms |
| WebSocket message latency | < 200ms |
| Image upload (< 5MB) | < 3s |
| DB query time (with indexes) | < 50ms |

## Scalability
| Metric | Target |
|---|---|
| Concurrent users (initial) | 100 |
| Concurrent users (scaled) | 500+ via HPA |
| Min pod replicas (critical services) | 2 |
| Max pod replicas (HPA limit) | 10 |
| HPA CPU trigger threshold | 70% |

## Availability
| Metric | Target |
|---|---|
| System availability | 99.5% uptime |
| Deployment strategy | Rolling update (zero downtime) |
| Pod self-healing | Kubernetes restarts on failure |
| DB persistence | PersistentVolumeClaim (survives pod restart) |

## Backup & Recovery
| Metric | Target |
|---|---|
| Backup frequency | Daily (CronJob at 02:00 UTC) |
| Backup retention | 7 days in MinIO |
| Recovery Time Objective (RTO) | < 1 hour |
| Recovery Point Objective (RPO) | < 24 hours |

## Security
| Requirement | Implementation |
|---|---|
| Authentication | Keycloak OAuth2 / OIDC |
| Authorization | JWT + RBAC (role claims) |
| Transport encryption | TLS via cert-manager + Let's Encrypt |
| secrets storage | Kubernetes `Secret` objects only |
| Rate limiting | NGINX Ingress: 10 req/s per IP, burst: 20 |
| Non-root containers | `securityContext.runAsNonRoot: true` |
| Image scanning (optional) | Trivy in CI/CD |

## Observability
| Requirement | Implementation |
|---|---|
| Log format | Structured JSON with `service`, `level`, `requestId`, `timestamp` |
| Log aggregation | Grafana Loki + Promtail |
| Metrics | Prometheus scraping `/metrics` |
| Dashboards | Grafana with CPU, memory, latency, error rate panels |
| Health endpoints | `/health` (liveness), `/ready` (readiness), `/metrics` |
| Distributed tracing (optional) | Jaeger / OpenTelemetry |

## Testing
| Type | Scope |
|---|---|
| Unit tests | Per service, Jest |
| Integration tests | Service + DB in Docker Compose |
| E2E tests | Full flow in staging namespace |
| Load tests | k6 / Artillery, 100–500 concurrent users |
| CI pipeline | GitHub Actions on every PR and push to `main` |
