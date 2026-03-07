# Functional Requirements & User Flows

## Roles
| Role | Description |
|---|---|
| `student` | Can view feed, apply for jobs, RSVP events, send messages, collaborate on research |
| `alumni` | All student permissions + can post jobs, create events |
| `admin` | Full access — manage users, view analytics, moderate content |

---

## User Flows

### 1. Authentication Flow
1. User opens app → Redirected to Keycloak login page
2. User enters credentials → Keycloak issues JWT (access + refresh token)
3. Client stores JWT → attaches `Authorization: Bearer <token>` to all API calls
4. Service validates token via Keycloak public key
5. On expiry → refresh token used to get new access token

### 2. User Profile Flow
1. After login → `user-service` syncs user info from Keycloak
2. User can view own profile (`GET /api/v1/users/me`)
3. User can update profile info (`PATCH /api/v1/users/me`)
4. Admin can view any profile (`GET /api/v1/users/:id`)

### 3. Feed (Social Posts) Flow
1. User creates a post with optional image (`POST /api/v1/feed`)
2. Image uploaded to MinIO → presigned URL returned → client uploads directly
3. Feed paginated by `createdAt` descending (`GET /api/v1/feed?page=1&limit=10`)
4. User likes a post (`POST /api/v1/feed/:id/like`)
5. User comments on a post (`POST /api/v1/feed/:id/comments`)
6. Cache: first page of feed cached in Redis (TTL: 60s)

### 4. Job Posting & Application Flow
1. Alumni/Admin creates job posting (`POST /api/v1/jobs`) — role-enforced
2. Student views job listings (`GET /api/v1/jobs`)
3. Student applies to a job (`POST /api/v1/jobs/:id/apply`)
4. Alumni/Admin updates application status (`PATCH /api/v1/jobs/:id/applications/:appId`)
5. Notification triggered on new application and status change

### 5. Events Flow
1. Alumni/Admin creates event (`POST /api/v1/events`)
2. Any user RSVPs to event (`POST /api/v1/events/:id/rsvp`)
3. View RSVP list (`GET /api/v1/events/:id/attendees`) — admin/alumni only
4. Notification sent to RSVP'd users before event

### 6. Messaging Flow
1. User opens conversation with another user
2. WebSocket connection established via `messaging-service`
3. Message sent → stored in MongoDB → delivered in real-time to recipient via Redis Pub/Sub
4. Message history retrieved via REST (`GET /api/v1/messages/:conversationId`)

### 7. Research Collaboration Flow
1. Any user creates a research project (`POST /api/v1/research`)
2. Project owner invites collaborators (`POST /api/v1/research/:id/invite`)
3. Documents uploaded to MinIO (`POST /api/v1/research/:id/documents`)
4. Collaborators view project details (`GET /api/v1/research/:id`)

### 8. Notification Flow
1. Events from feed, jobs, events → trigger notifications asynchronously
2. Notifications stored in DB (`notification-service`)
3. User fetches notifications (`GET /api/v1/notifications`)
4. Notification marked as read (`PATCH /api/v1/notifications/:id/read`)

### 9. Analytics Flow (Admin only)
1. Admin accesses dashboard (`GET /api/v1/analytics/summary`)
2. MongoDB aggregation queries compute: active users, popular posts, job stats, event participation
3. Results cached in Redis (TTL: 5 minutes)

---

## API Endpoint Inventory

### User Service (`/api/v1/users`)
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/me` | any | Get own profile |
| PATCH | `/me` | any | Update own profile |
| GET | `/:id` | admin | Get any user profile |
| GET | `/` | admin | List all users |

### Feed Service (`/api/v1/feed`)
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/` | any | Create a post |
| GET | `/` | any | Paginated feed |
| POST | `/:id/like` | any | Like a post |
| DELETE | `/:id/like` | any | Unlike a post |
| POST | `/:id/comments` | any | Comment on post |
| GET | `/:id/comments` | any | Get comments |

### Job Service (`/api/v1/jobs`)
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/` | alumni/admin | Create job |
| GET | `/` | any | List jobs |
| GET | `/:id` | any | Get job detail |
| POST | `/:id/apply` | student | Apply for job |
| PATCH | `/:id/applications/:appId` | alumni/admin | Update application status |

### Event Service (`/api/v1/events`)
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/` | alumni/admin | Create event |
| GET | `/` | any | List events |
| POST | `/:id/rsvp` | any | RSVP to event |
| GET | `/:id/attendees` | alumni/admin | List attendees |

### Messaging Service (`/api/v1/messages`)
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/:conversationId` | any | Get message history |
| WS | `/ws` | any | Real-time messaging |

### Notification Service (`/api/v1/notifications`)
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | any | Get own notifications |
| PATCH | `/:id/read` | any | Mark as read |

### Research Service (`/api/v1/research`)
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/` | any | Create project |
| GET | `/:id` | collaborator/admin | View project |
| POST | `/:id/invite` | owner/admin | Invite collaborator |
| POST | `/:id/documents` | collaborator | Upload document |

### Analytics Service (`/api/v1/analytics`)
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/summary` | admin | Dashboard summary |
| GET | `/posts` | admin | Popular posts stats |
| GET | `/jobs` | admin | Job application stats |

---

## Data Models

### User
```json
{
  "_id": "ObjectId",
  "keycloakId": "string (unique)",
  "email": "string (unique, indexed)",
  "name": "string",
  "role": "student | alumni | admin",
  "bio": "string",
  "avatar": "string (MinIO URL)",
  "createdAt": "Date",
  "updatedAt": "Date"
}
```

### Post (Feed)
```json
{
  "_id": "ObjectId",
  "userId": "ObjectId (indexed)",
  "content": "string",
  "imageUrl": "string (MinIO URL, optional)",
  "likes": ["ObjectId"],
  "commentCount": "number",
  "createdAt": "Date (indexed)"
}
```

### Comment
```json
{
  "_id": "ObjectId",
  "postId": "ObjectId",
  "userId": "ObjectId",
  "content": "string",
  "createdAt": "Date"
}
```

### Job
```json
{
  "_id": "ObjectId",
  "postedBy": "ObjectId (alumni/admin)",
  "title": "string",
  "description": "string",
  "company": "string",
  "status": "open | closed",
  "deadline": "Date (indexed)",
  "createdAt": "Date"
}
```

### Application
```json
{
  "_id": "ObjectId",
  "jobId": "ObjectId",
  "applicantId": "ObjectId",
  "status": "pending | reviewed | accepted | rejected (indexed)",
  "coverLetter": "string",
  "appliedAt": "Date"
}
```

### Event
```json
{
  "_id": "ObjectId",
  "createdBy": "ObjectId",
  "title": "string",
  "description": "string",
  "eventDate": "Date (indexed)",
  "location": "string",
  "rsvps": ["ObjectId"]
}
```

### Message
```json
{
  "_id": "ObjectId",
  "conversationId": "string",
  "senderId": "ObjectId",
  "recipientId": "ObjectId",
  "content": "string",
  "sentAt": "Date"
}
```

### Notification
```json
{
  "_id": "ObjectId",
  "userId": "ObjectId",
  "type": "like | comment | job_posted | application_update | event_reminder",
  "referenceId": "ObjectId",
  "read": "boolean",
  "createdAt": "Date"
}
```

### Research Project
```json
{
  "_id": "ObjectId",
  "ownerId": "ObjectId",
  "title": "string",
  "description": "string",
  "collaborators": ["ObjectId"],
  "documents": [{"name": "string", "url": "string"}],
  "createdAt": "Date"
}
```

---

## Edge Cases

| Scenario | Handling |
|---|---|
| Student tries to post a job | 403 Forbidden — role check in service middleware |
| Duplicate like on same post | Idempotent — ignore or return 200 |
| Message to offline user | Stored in MongoDB, delivered on reconnect |
| Image upload failure | Return error; do not save post record |
| Notification delivery fails | Retry up to 3 times with exponential backoff |
| Duplicate RSVP | Idempotent — no duplicate in array |
| Invalid JWT | 401 Unauthorized at Ingress or service level |
| Expired token | 401 — client must refresh |
| Admin deletes user | Soft delete — preserve data reference integrity |
