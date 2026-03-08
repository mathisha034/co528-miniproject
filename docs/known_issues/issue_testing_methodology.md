# Issue Testing Methodology

This document defines the standard template and procedure for testing every resolved issue.

---

## 📐 Testing Protocol

### Rules
1. **One issue at a time.** Test one issue fully before asking to proceed to the next.
2. **No shortcuts.** If a test fails, analyse the root implementation — identify why it persists, fix the source, rebuild/redeploy if needed, then re-run.
3. **Update both trackers.** On pass: update `testing_tracker.md` and `errors_log.md`.
4. **Propagate all side-effects.** If fixing an issue changes shared files (schemas, DTOs, services), update all usages so no future regressions are introduced.

---

## 📋 Issue Test Template

```
### Issue N: <Title>
- **Status:** 🔄 In Progress | ✅ Passed | ❌ Failed
- **Test Date:** YYYY-MM-DD
- **Test Script / Method:** `<filename>` | Manual | Source Audit

#### Phase 1 — Pre-Test Implementation Audit
> Before writing any test, verify the fix is correctly implemented end-to-end:
- Read the source file(s) modified
- Confirm fix compiles (live pod grep / tsc check)
- Check all usages of changed functions/schemas are updated

#### Phase 2 — Test Cases
| ID | Description | Expected | Actual | Result |
|---|---|---|---|---|
| A | <test description> | <status code / behaviour> | | ⬜ |

#### Phase 3 — Test Execution
> Paste actual test output here

#### Phase 4 — Result
- **Pass/Fail:** ✅ / ❌
- **Issues found during testing:** <any bugs found while testing>
- **Follow-up fixes applied:** <any additional changes made>
```

---

## 📊 Master Test Status Table

| Issue | Title | Category | Status |
|---|---|---|---|
| 1  | Frontend API Route Mismatch | Web App | ✅ Passed |
| 2  | Missing Keycloak Admin User & Realm | Infrastructure | ✅ Passed |
| 3  | NestJS Services Rejecting Valid JWTs | Auth | ✅ Passed |
| 4  | Missing User Profile in MongoDB | User Service | ✅ Passed |
| 5  | UUID BSON Casting Crash in Mongoose | Feed / Notification | ✅ Passed |
| 6  | Web App → Feed Service: Wrong URL path | Web App | ✅ Passed |
| 7  | Feed Service: Response format mismatch | Feed Service | ✅ Passed |
| 8  | Web App → Analytics Service: Wrong URL path | Web App | ✅ Passed |
| 9  | Web App → Research Service: Wrong URL path | Web App | ✅ Passed |
| 10 | Notification Service: Missing GET /count endpoint | Notification | ✅ Passed |
| 11 | Empty UI Components Directory | Web App | ✅ Passed |
| 12 | Empty Hooks Directory | Web App | ✅ Passed |
| 13 | Messaging Service Has No Health Endpoint | Messaging | 🔵 Future |
| 14 | CI/CD uses `npm ci` but `package-lock.json` is missing | CI/CD | ✅ Passed |
| 15 | Analytics Service HPA CPU threshold inconsistency | Infrastructure | ⬜ Not Started |
| 16 | User Service: `upsertFromKeycloak()` never called | User Service | ✅ Passed |
| 17 | User Service: `findById(id)` raw string mapping error | User Service | ✅ Passed |
| 18 | Feed Service: Web App integration URL mismatch | Web App | ✅ Passed |
| 19 | Feed Service: Envelope wrapper mismatch on `getFeed()` | Feed Service | ✅ Passed |
| 20 | Feed Service: Missing query filter support in `getFeed()` | Feed Service | ✅ Passed |
| 21 | Feed Service: `MulterModule` Default Implicit Storage | Feed Service | ✅ Passed |
| 22 | Job Service: No Duplicate-Application Guard | Job Service | ✅ Passed |
| 23 | Job Service: `withRetry()` Deterministic Delay | Job Service | ✅ Passed |
| 24 | Event Service: Missing `GET /:id` Endpoint | Event Service | ✅ Passed |
| 25 | Event Service: Mongoose `findById()` CastError String | Event Service | ✅ Passed |
| 26 | Event Service: Race Condition Typing on `rsvp()` | Event Service | ✅ Passed |
| 27 | Notification Service: Missing GET /notifications/count | Notification | ✅ Passed |
| 28 | Notification Service: Silent Null on `markRead` | Notification | ✅ Passed |
| 29 | Notification Service: Inter-Service Authenticative Tokens | Notification | ✅ Passed |
| 30 | Research Service: Missing Validation Constraints | Research Service | ✅ Passed |
| 31 | Research Service: `uploadDocument()` Undefined Attachment | Research Service | ✅ Passed |
| 32 | Research Service: Upload Operation Atomicity | Research Service | ✅ Passed |
| 33 | Research Service: Blind Collaborator Appendings | Research Service | ✅ Passed |
| 34 | Analytics Service: Hardcoded Target Collection Flaw | Analytics Service | ✅ Passed |
| 35 | Analytics Service: Unverified Payload Attributes | Analytics Service | ✅ Passed |
| 36 | Analytics Service: Tightly Coupled TSD PromQL Formatting | Analytics Service | ✅ Passed |
| 37 | Messaging Service: Bare App Scaffolding | Messaging | 🔵 Future |
| 38 | Messaging Service: No `HealthController` Established | Messaging | 🔵 Future |
| 39 | JWT Strategy Reads Non-Existent Keycloak Claim | User Service | ✅ Passed |
| 40 | `minikube image load` Silently Ignores Cached Tags | DevOps | ✅ Passed |
| 41 | `test_issue16_4.js` Used Wrong MongoDB Schema Fields | Test Infra | ✅ Passed |
| 42 | `setup_temp_users.sh` Cleanup Did Not Purge MongoDB | Test Infra | ✅ Passed |
| 43 | Kubernetes Deployment Image Tag Drift | DevOps | ✅ Passed |

---

## 🔄 Active Test Session

**Current Issue:** Issue 15 — Analytics Service HPA CPU threshold inconsistency *(awaiting approval)*
**Previously Completed:** Issue 14 — CI/CD uses `npm ci` but `package-lock.json` is missing ✅

---

## 📝 Completed Issue Test Records

> Full records are in `testing_tracker.md`. Summaries below.

| Issue | Test Script | Cases | Outcome | Date |
|---|---|---|---|---|
| 1 | E2E manual sweep | Multiple | ✅ | 2026-03-08 |
| 3 | `test_issue3.js` | 4 | ✅ | 2026-03-08 |
| 4 | `test_issue16_4.js` | 8 | ✅ | 2026-03-08 |
| 5 | `test_issue5.js` | 5 | ✅ | 2026-03-08 |
| 6 | `test_issue6.js` | 4 | ✅ | 2026-03-08 |
| 7 | `test_issue7.js` | 7+ | ✅ | 2026-03-08 |
| 8 | `test_issue8.js` | 3 | ✅ | 2026-03-08 |
| 9 | `test_issue9.js` | 6+ | ✅ | 2026-03-08 |
| 11 | `test_issue11.js` | 37 | ✅ | 2026-03-08 |
| 12 | `test_issue12.js` | 26 | ✅ | 2026-03-08 |
| 16 | `test_issue16_4.js` | 8 | ✅ | 2026-03-08 |
| 17 | `test_issue17.js` | 10 | ✅ | 2026-03-08 |
| 21 | `test_issue21.js` | 8 | ✅ | 2026-03-08 |
| 22 | `test_issue22_23.js` | 13 | ✅ | 2026-03-08 |
| 23 | `test_issue22_23.js` | 13 | ✅ | 2026-03-08 |
| 24 | `test_issue24_25_26.js` | 16 | ✅ | 2026-03-08 |
| 25 | `test_issue24_25_26.js` | 16 | ✅ | 2026-03-08 |
| 26 | `test_issue24_25_26.js` | 16 | ✅ | 2026-03-08 |
| 28 | `test_issue28_29.js` | 16 | ✅ | 2026-03-08 |
| 29 | `test_issue28_29.js` | 16 | ✅ | 2026-03-08 |
| 30 | `test_issue30_31_32_33.js` | 14 | ✅ | 2026-03-08 |
| 31 | `test_issue30_31_32_33.js` | 14 | ✅ | 2026-03-08 |
| 32 | `test_issue30_31_32_33.js` | 14 | ✅ | 2026-03-08 |
| 33 | `test_issue30_31_32_33.js` | 14 | ✅ | 2026-03-08 |
| 34 | `test_issue34_35_36.js` | 17 | ✅ | 2026-03-08 |
| 35 | `test_issue34_35_36.js` | 17 | ✅ | 2026-03-08 |
| 36 | `test_issue34_35_36.js` | 17 | ✅ | 2026-03-08 |
| 14 | `test_issue14.js` | 11 | ✅ | 2026-03-08 |
