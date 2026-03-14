# Backend System Documentation: Roadmap & User Progress Tracking Module

## 1. System Overview

The Roadmap & User Progress Tracking System is a core gamification and structured learning module within the Ranbhoomi platform. It provides users with a highly organized, hierarchical curriculum (Roadmap -> Topics -> Subtopics -> Questions).

In a real-world scalable coding platform, this module is critical for user retention. It must handle extremely high read throughput (users loading their dashboard) and high concurrency write throughput (users rapidly toggling checkboxes, stars, and notes during a study session) without introducing race conditions, negative counters, or database locks.

---

## 2. Functional Requirements

- **Curriculum Viewing:** Users can view deeply nested roadmaps containing topics, subtopics, and questions.
- **Progress Tracking:** Users can toggle solved status, which automatically aggregates statistics (Easy/Medium/Hard counts, Total Solved) and tracks active calendar days.
- **Bookmarking:** Users can pin/star questions for later revision.
- **Personal Notes:** Users can save, edit, and delete personal Markdown/text notes attached to specific questions.
- **Activity Tracking:** System tracks daily active problem-solving streaks (`activeDays`).

---

## 3. Non-Functional Requirements

- **Scalability:** Must handle thousands of concurrent state toggles without locking the database.
- **Performance:** Roadmap payloads must be fetched in $O(1)$ database trips with minimal memory footprints via strict projections.
- **Reliability:** No "ghost writes" or negative statistical counters, even if a user double-clicks rapidly or network retries occur.
- **Availability:** High availability for reads.
- **Latency Constraints:** Progress toggles must execute in < 50ms to align with Optimistic UI updates on the frontend.
- **Concurrency Considerations:** Thread-safe updates are mandatory to prevent race conditions during parallel API calls.

---

## 4. Data Model Design

To achieve $O(1)$ lookups and atomic updates, we abandoned deeply nested Mongoose Arrays in favor of **Flat Dictionaries (Hash Maps)**.

### Database Schema (MongoDB)

#### 1. `RoadmapTemplate` Collection
Stores the curriculum structure.

| Field | Type | Notes |
|---|---|---|
| `roadmapId` | String | Indexed, Unique |
| `sheet` | Mixed | |
| `topics`, `subTopics`, `questions` | Mixed | |

> **Reasoning:** Using `mongoose.Schema.Types.Mixed` combined with `{ minimize: false }` allows for dynamic, high-speed dictionary lookups (`questions.q1.title`) without Mongoose arbitrarily stripping empty dictionaries, bypassing slow positional array operators (`$`).

#### 2. `UserProgress` Collection
Stores user-specific state separately from the template to keep the template infinitely cacheable.

| Field | Type |
|---|---|
| `userId` | ObjectId |
| `roadmapId` | String |
| `solved` | Map of Booleans |
| `bookmarked` | Map of Booleans |
| `notes` | Map of Strings |
| `stats` | Object: `easy`, `medium`, `hard`, `totalSolved` |
| `activeDays` | Map of Numbers |

### Indexing Strategy

- `RoadmapTemplate.index({ roadmapId: 1 }, { unique: true })` — Prevents collection scans on load, ensuring instant $O(1)$ retrieval.
- `UserProgress.index({ userId: 1, roadmapId: 1 }, { unique: true })` — Compound index ensuring $O(1)$ state retrieval and preventing duplicate progress trackers.

---

## 5. API Design

All routes are mounted under `/api/v1/roadmap` (or similar base) and protected by the `isAuth` middleware.

| Method | Endpoint | Description | Request Body |
|---|---|---|---|
| GET | `/` | Fetches lightweight metadata of all roadmaps. | N/A |
| GET | `/:roadmapId` | Fetches full roadmap template + user's progress. | N/A |
| PATCH | `/:roadmapId/progress/status` | Toggles solved status & updates stats. | `{ questionId, difficulty }` |
| PATCH | `/:roadmapId/progress/bookmark` | Toggles revision star. | `{ questionId }` |
| PATCH | `/:roadmapId/progress/note` | Saves or deletes a user note. | `{ questionId, noteText }` |

---

## 6. System Flow

### User Toggling a "Solved" Checkbox (Atomic Flow)

```
[Client/React UI]
   │ 1. User clicks checkbox
   │ 2. Optimistic UI update (Instant visual feedback)
   ▼
[Express Router: /:roadmapId/progress/status]
   │ 3. Authenticate JWT (`isAuth` middleware)
   ▼
[Roadmap Controller]
   │ 4. Validate payload (questionId, difficulty constraint checking)
   │ 5. Fetch specific `{ 'solved.qId': 1 }` to determine toggle direction
   │ 6. Construct dynamic `$set`/`$unset` and safely bounded `$inc` query
   ▼
[MongoDB Engine]
   │ 7. findOneAndUpdate({userId, roadmapId}, updateQuery, {upsert: true})
   │ 8. DB executes transaction atomically in-memory using C++ engine
   ▼
[Response]
   │ 9. Return updated stats & activeDays to sync Client UI bounds
```

---

## 7. Performance Optimization

- **Parallel Execution:** `getRoadmapData` utilizes `Promise.all()` to fetch the Template and Progress concurrently, cutting response time in half.
- **Strict Projection (`.select()`):** Queries explicitly whitelist only necessary fields (e.g., `.select('solved bookmarked notes stats activeDays')`). This prevents 16MB template definitions from saturating Node.js RAM during simple operations.
- **Hydration Stripping (`.lean()`):** All read-only queries use Mongoose's `.lean()`, returning Plain Old JavaScript Objects (POJOs). This makes JSON serialization significantly faster and drastically reduces memory overhead.
- **Zero-Read Updates:** The `saveNote` controller implements a pure atomic operation. It does not read from the database first; it blindly writes the new note via `$set` or removes it via `$unset`, saving an entire database round-trip.

---

## 8. Fault Tolerance

- **Negative Counter Prevention:** `$inc` logic is strictly bounded using ternary operators (`isCurrentlySolved ? -1 : 1`) combined with safeguards (`currentProgress?.activeDays?.[today] > 0 ? -1 : 0`). This ensures that UI retries or double-clicks never drop a user's `totalSolved` below zero.
- **Input Validation / Payload Injection:** The `difficulty` parameter is strictly checked against an allowed list (`["basic", "easy", "medium", "hard"]`). If a malicious user sends `{ difficulty: "admin" }`, it defaults to `"medium"`, preventing NoSQL object injection into the stats dictionary.
- **Upsert Initialization:** Users do not have a progress document created when they sign up. It is dynamically created via `{ upsert: true, setDefaultsOnInsert: true }` upon their first interaction, preventing dead DB rows for inactive users.
- **Database Write Conflicts:** Bypassing Mongoose document versioning (`.save()`) via `findOneAndUpdate` ensures parallel updates to different keys do not overwrite each other.

---

## 9. Consistency Model

- **Eventual Consistency Acceptable (Progress):** User statistics and global leaderboard rankings based on solved counts can tolerate slight replication lag across MongoDB secondary nodes.
- **Strong Consistency (Writes):** `findOneAndUpdate` executes directly on the MongoDB Primary node, ensuring that the return value sent to the frontend is strictly consistent with the latest write.

---

## 10. Security Considerations

- **Authentication:** All progress routes are guarded by a stateless JWT middleware (`isAuth`).
- **Input Validation:** Required parameters (`roadmapId`, `questionId`) are explicitly checked. Missing parameters throw `400 ApiError` before hitting the database.
- **Resource Isolation:** Progress fetches and updates strictly enforce the `userId` extracted securely from the JWT, preventing Insecure Direct Object Reference (IDOR) vulnerabilities.

---

## 11. Trade-offs

**Fat Documents vs Relational Tables:** We chose to embed the entire roadmap curriculum into a single massive document rather than creating separate Topics, SubTopics, and Questions collections.
- **Trade-off:** Documents approach the 16MB BSON limit.
- **Benefit:** Fetching the entire curriculum requires exactly 1 database read ($O(1)$) instead of complex `$lookup` aggregation pipelines.

**Atomic Updates vs Mongoose Middleware:** We abandoned Mongoose `.save()` hooks for progress tracking.
- **Trade-off:** We lose pre/post save validation middleware.
- **Benefit:** 10x faster write throughput and absolute immunity to parallel versioning crashes.

---

## 12. Future Improvements

As the platform scales to millions of active users, the architecture will evolve to handle massive concurrent traffic and unlock deeper analytics capabilities.
## 1. Redis Write-Behind Caching (Write Optimization)
Currently, every checkbox toggle performs a direct atomic write to MongoDB. As concurrency scales (e.g., during peak interview seasons), direct DB writes will bottleneck. We will implement a Write-Behind Cache where status updates happen instantly in a Redis Hash (`HSET roadmap:progress:{userId}:{roadmapId}`). A background worker (via BullMQ or Kafka) will asynchronously batch-flush these changes to MongoDB every few minutes, reducing database write IOPS by ~90% while maintaining sub-millisecond API response times.
## 2. CDN Edge Caching (Read Optimization)
The `RoadmapTemplate` JSON payload is heavy but rarely changes. We will cache the output of `getAllRoadmaps` and specific template fetches at the edge using Cloudflare Workers or AWS CloudFront. Users will download the 100KB+ curriculum matrix directly from a geographic edge node closest to them, achieving single-digit millisecond latency and completely bypassing the Node.js backend.
## 3. Event-Driven Gamification (Kafka/RabbitMQ)
To support advanced gamification without slowing down the core progress API, we will transition to an event-driven architecture. When a user solves a problem, the API will instantly update Redis and publish an event (e.g., `UserSolvedProblem`) to a message broker. Independent consumer microservices will listen to this topic to asynchronously calculate streaks, update global leaderboards, or unlock achievement badges, keeping the critical path lightning fast.
## 4. Horizontal Database Sharding
As the `UserProgress` collection grows to tens of millions of documents, a single MongoDB replica set will hit storage and memory limits. We will implement hash-based sharding on the `UserProgress` collection using the compound shard key `{ userId: "hashed", roadmapId: 1 }`. This guarantees even data distribution across multiple database shards while ensuring a specific user's roadmap progress is always queried from a single targeted node.

