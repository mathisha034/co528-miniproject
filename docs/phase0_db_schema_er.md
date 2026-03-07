# Database Schema & ER Diagram

## MongoDB Collections

All collections live in a logical database named `miniproject_db`.

---

### `users`
```
users
├── _id               : ObjectId (PK)
├── keycloakId        : String (unique)
├── email             : String (unique, indexed)
├── name              : String
├── role              : Enum["student","alumni","admin"] (indexed)
├── bio               : String (optional)
├── avatar            : String (MinIO URL, optional)
├── createdAt         : Date
└── updatedAt         : Date
```

### `posts`
```
posts
├── _id               : ObjectId (PK)
├── userId            : ObjectId → users._id (indexed)
├── content           : String
├── imageUrl          : String (MinIO URL, optional)
├── likes             : [ObjectId] → users._id
├── commentCount      : Number (denormalized for performance)
├── createdAt         : Date (indexed)
└── updatedAt         : Date
Compound index: (userId, createdAt)
```

### `comments`
```
comments
├── _id               : ObjectId (PK)
├── postId            : ObjectId → posts._id (indexed)
├── userId            : ObjectId → users._id
├── content           : String
└── createdAt         : Date
```

### `jobs`
```
jobs
├── _id               : ObjectId (PK)
├── postedBy          : ObjectId → users._id (alumni/admin)
├── title             : String
├── description       : String
├── company           : String
├── status            : Enum["open","closed"] (indexed)
├── deadline          : Date (indexed)
└── createdAt         : Date
```

### `applications`
```
applications
├── _id               : ObjectId (PK)
├── jobId             : ObjectId → jobs._id (indexed)
├── applicantId       : ObjectId → users._id
├── status            : Enum["pending","reviewed","accepted","rejected"] (indexed)
├── coverLetter       : String (optional)
└── appliedAt         : Date
```

### `events`
```
events
├── _id               : ObjectId (PK)
├── createdBy         : ObjectId → users._id
├── title             : String
├── description       : String
├── eventDate         : Date (indexed)
├── location          : String
└── rsvps             : [ObjectId] → users._id
```

### `messages`
```
messages
├── _id               : ObjectId (PK)
├── conversationId    : String (indexed) — derived as sorted join of two userIds
├── senderId          : ObjectId → users._id
├── recipientId       : ObjectId → users._id
├── content           : String
└── sentAt            : Date
```

### `notifications`
```
notifications
├── _id               : ObjectId (PK)
├── userId            : ObjectId → users._id (indexed)
├── type              : Enum["like","comment","job_posted","application_update","event_reminder"]
├── referenceId       : ObjectId (polymorphic — post/job/event id)
├── read              : Boolean (indexed)
└── createdAt         : Date
```

### `research_projects`
```
research_projects
├── _id               : ObjectId (PK)
├── ownerId           : ObjectId → users._id
├── title             : String
├── description       : String
├── collaborators     : [ObjectId] → users._id
├── documents         : [{ name: String, url: String (MinIO) }]
└── createdAt         : Date
```

---

## ER Diagram (Text Representation)

```
┌─────────────┐       ┌──────────────────┐
│   USERS     │──────►│   POSTS          │
│ email(u)    │1     N│ userId (indexed) │
│ role(idx)   │       │ createdAt(idx)   │
└──────┬──────┘       └────────┬─────────┘
       │                       │
       │N                      │1
       ▼                       ▼
┌──────────────┐       ┌──────────────────┐
│ APPLICATIONS │       │   COMMENTS       │
│ applicantId  │       │ postId           │
│ jobId        │       │ userId           │
└──────────────┘       └──────────────────┘
       │
       │N
       ▼
┌──────────────┐
│     JOBS     │
│ postedBy     │
│ status(idx)  │
│ deadline(idx)│
└──────────────┘

┌─────────────┐        ┌─────────────────────┐
│   USERS     │───────►│     EVENTS          │
│             │1      N│ createdBy           │
│             │        │ rsvps[ ]            │
└─────────────┘        │ eventDate(idx)      │
                       └─────────────────────┘

┌─────────────┐        ┌─────────────────────┐
│   USERS     │───────►│  NOTIFICATIONS      │
│             │1      N│ userId(idx)         │
│             │        │ read(idx)           │
└─────────────┘        └─────────────────────┘

┌─────────────┐        ┌─────────────────────┐
│   USERS     │───────►│ RESEARCH_PROJECTS   │
│             │1      N│ ownerId             │
│             │        │ collaborators[ ]    │
└─────────────┘        │ documents[ ]        │
                       └─────────────────────┘

┌─────────────┐        ┌─────────────────────┐
│   USERS     │───────►│     MESSAGES        │
│             │       N│ senderId            │
│             │        │ recipientId         │
└─────────────┘        │ conversationId(idx) │
                       └─────────────────────┘
```
