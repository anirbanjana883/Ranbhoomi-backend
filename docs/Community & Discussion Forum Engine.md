# System Architecture: Community & Discussion Forum Engine

## 1. System Overview

The Community Module is a high-throughput, read-heavy subsystem of the Ranbhoomi platform. Designed similarly to LeetCode Discuss or HackerRank Forums, it enables users to share interview experiences, discuss system design patterns, and resolve algorithmic doubts.

Because viral posts can attract tens of thousands of deeply nested comments, traditional recursive SQL/NoSQL queries would cause severe performance bottlenecks. To achieve web-scale performance, this system implements the Materialized Path pattern for $O(1)$ sub-tree retrieval, ESR (Equality, Sort, Range) Indexed MongoDB queries for cursor pagination, and a time-decaying Gravity Algorithm executed via distributed background cron jobs to keep the front page dynamic.

---

## 2. Functional Requirements

- **Rich Text Publishing:** Users can create posts and comments with Markdown/HTML content.
- **Feed Ranking:**
  - New Feed: Strictly chronological ordering.
  - Hot Feed: Ranked by a time-decaying gravity algorithm based on upvotes, downvotes, and post age.
- **Weighted Full-Text Search:** Discoverability of posts via keyword matching across titles (high weight) and content (low weight).
- **Deeply Nested Threads:** Reddit-style recursive commenting with a maximum allowed depth of 10 levels.
- **Idempotent Voting:** Users can upvote/downvote posts and comments without race conditions.
- **Soft Deletion:** Content removal replaces text with a `[deleted]` tombstone but preserves the UI tree structure to avoid orphaned child comments.

---

## 3. Non-Functional Requirements

- **Scalability:** Designed for a 100:1 Read-to-Write ratio. Comment retrieval scales linearly $O(N)$ relative to the number of rendered comments, not the total comments in the DB.
- **Performance:** Feed retrieval and top-level comment fetches resolve in under 100ms. Bulk writes are used for cron updates.
- **Reliability:** The system prevents duplicate votes during high-concurrency bursts via database-level unique constraints.
- **Availability:** Distributed cron locks ensure background tasks do not cause race conditions or duplicate processing across multi-instance auto-scaled deployments.
- **Security:** Strict payload byte limits (50k for posts, 10k for comments) and strict HTML sanitization protect against XSS and memory exhaustion attacks.

---

## 4. Data Model Design

### Database Schema (MongoDB)

#### 1. CommunityPost Schema
Stores the top-level forum threads.

**Key Fields:** `author`, `title`, `content`, `tags`, `upvotes`, `downvotes`, `hotScore`, `status`, `commentCount`.

**Indexing Strategy (ESR Rule):**
- `{ status: 1, createdAt: -1, _id: -1 }` → Direct B-Tree lookup for "New" feed cursor pagination.
- `{ status: 1, hotScore: -1, _id: -1 }` → Direct B-Tree lookup for "Hot" feed offset pagination.
- `{ title: "text", tags: "text", content: "text" }` → Weighted text index (title: 10, tags: 5, content: 1).

#### 2. CommunityComment Schema
Stores replies using the Materialized Path pattern to avoid recursive JOINs.

**Key Fields:** `postId`, `parentCommentId`, `content`, `path` (e.g., `,rootId,childId,`), `level`, `isDeleted`.

**Indexing Strategy:**
- `{ postId: 1, path: 1 }` → Allows RegEx prefix querying `^,rootId,` to fetch an entire subtree in one B-Tree sweep.
- `{ postId: 1, level: 1, isDeleted: 1, upvotes: -1, createdAt: -1 }` → Optimizes the 2-step root-pagination query.

#### 3. CommunityVote Schema
Acts as a ledger to enforce voting idempotency.

**Key Fields:** `userId`, `entityId`, `entityType`, `voteType` (1 or -1).

**Indexing Strategy:** Compound Unique Index on `{ userId: 1, entityId: 1 }` prevents double-voting physically at the DB level.

### Redis Keys

- `cron:hotscore:lock` — Distributed mutex (`SET NX EX 60`) for the Gravity Cron.
- `rate_limit:community_post:{IP}` — Fixed-window rate limiter for post creation.

---

## 5. API Design

| Endpoint | Method | Description | Request Body | Response |
|---|---|---|---|---|
| `/search` | GET | Weighted text search (`?q=keyword&page=1`) | null | 200 OK (Posts, TotalPages, Meta) |
| `/posts` | GET | Fetches feed (`?sort=hot\|new&cursor\|page`) | null | 200 OK (Posts, nextCursor, nextPage) |
| `/posts/:postId/comments` | GET | 2-step paginated fetch of Root comments + subtrees | null | 200 OK (Reconstructed Nested Tree) |
| `/comments/:commentId/replies` | GET | Lazy-loads deeply nested subtrees via Regex prefix | null | 200 OK (Subtree array) |
| `/post` | POST | Creates a new post (Sanitized HTML) | `title, content, tags` | 201 Created (Post Object) |
| `/comment` | POST | Adds a comment (Materialized path auto-gen) | `postId, content, parentId` | 201 Created (Comment Object) |
| `/vote` | PATCH | Toggles an upvote/downvote | `entityId, entityType, vote` | 200 OK (Updated entity scores) |
| `/posts/:postId` | DELETE | Soft-deletes a post | null | 200 OK |
| `/comments/:commentId` | DELETE | Soft-deletes a comment | null | 200 OK |

---

## 6. System Flow

### Fetching a Viral Comment Thread (2-Step Pagination Strategy)

```
Client Request -> GET /posts/:postId/comments?page=1
      │
      ▼
Step 1: Database Query (ESR Index)
Find TOP 20 Root Comments (level: 1, isDeleted: false) sorted by Upvotes.
      │
      ▼
Step 2: Path Extraction
Extract paths of those 20 roots -> [",id1,", ",id2,"]
      │
      ▼
Step 3: Database Query (Prefix Regex B-Tree Sweep)
Find all child comments where path matches RegExp ^(,id1,|,id2,)
      │
      ▼
Step 4: O(N) In-Memory Tree Reconstruction
Iterate flat array, map Parent IDs to Children arrays, apply soft-delete masks.
      │
      ▼
Return fully structured, nested JSON tree to Client.
```

---

## 7. Performance Optimization

- **In-Memory Tree Building:** Transforming the flat DB response into a nested UI tree is done in Node.js via an $O(N)$ object reference map, rather than expensive recursive database queries.
- **Mongoose `.lean()`:** Extensively used in GET requests to bypass BSON-to-Mongoose document hydration, significantly reducing CPU cycles and Garbage Collection overhead on large arrays.
- **Write-Time Path Generation:** The heavy lifting of figuring out thread hierarchy is done exactly once during creation. Reads are just blazing-fast string prefix matches.
- **Batch Polling / Bulk Writes:** The background Cron job does not update posts sequentially. It fetches the top 500 active posts, calculates their decay, and applies the updates via a single `CommunityPost.bulkWrite()`, minimizing DB round-trips.

---

## 8. Fault Tolerance

- **Duplicate Execution Prevention:** In a horizontally scaled deployment (multiple Node instances), the Gravity Cron job utilizes a Redis Distributed Lock (`SET NX EX 60`). Only the first instance to acquire the lock processes the batch; others safely abort.
- **Database Write Conflicts:** All vote tallies and comment counts use MongoDB's atomic `$inc` operator. This bypasses the classic read-modify-write overwrite flaw during concurrent vote bursts.
- **Payload Crash Prevention:** Strict character caps (50,000 for posts, 10,000 for comments) and nesting limits (Max level: 10) are enforced at the controller level to prevent malicious users from crashing the Node.js heap or forcing Stack Overflow errors on the frontend.
- **Tombstone Architecture (Soft Deletes):** Deleting content physically drops the payload text but preserves the document (`isDeleted: true`). This ensures child replies are not orphaned and tree iteration does not fail.

---

## 9. Consistency Model

### Strong Consistency
- **Vote State:** The Unique Compound Index ensures a user absolutely cannot upvote twice.
- **Tree Hierarchy:** Child comments are guaranteed to inherit their parent's exact materialized path.
- **Comment Count:** Atomic `$inc` ensures comment tallies perfectly match the document count.

### Eventual Consistency
- **Hot Feed Ranking:** When a user upvotes a post, it does not immediately rearrange the entire feed. The new `hotScore` is eventually consistent, recalculated by the background cron worker every 10 minutes.

---

## 10. Security Considerations

- **Rate Limiting:**
  - Post Creation: Limited to 5 requests per minute via `communityPostLimiter`.
  - Comment Creation: Limited to 20 requests per minute via `communityCommentLimiter`.
- **XSS Sanitization:** All user content is passed through `sanitize-html` (allowing only safe tags like `code`, `pre`, `img`) before hitting the database, preventing stored Cross-Site Scripting (XSS) attacks.
- **Data Isolation:** Soft-deletion overrides the content field with `[deleted]` on the server side dynamically before returning the payload, ensuring sensitive deleted text is never transmitted over the network.
- **Object ID Validation:** `mongoose.Types.ObjectId.isValid()` is checked universally to prevent CastErrors from crashing the Express application process.

---

## 11. Trade-offs

**Materialized Path vs Adjacency List:** We chose Materialized Paths over a simple Adjacency List (`parentId` only). Trade-off: Moving a comment tree to a different parent is incredibly expensive. However, since forums do not allow moving comments, we traded write-flexibility for massive read-speed gains.

**Offset vs Cursor Pagination:** We use highly performant Cursor Pagination (`$lt: cursor`) for the "New" feed. Trade-off: For the "Hot" feed and Search queries, we accepted the performance penalty of Offset Pagination (skip/limit) because MongoDB's dynamic `textScore` and fluid `hotScore` cannot easily be cursored.

---

## 12. Future Improvements

To scale this module to millions of active users, the following architectural upgrades can be integrated:

- **Elasticsearch Migration:** Offload the weighted `$text` index search from MongoDB to a dedicated Elasticsearch cluster to support typo-tolerance (fuzzy matching) and advanced faceting.
- **Redis Feed Caching:** Cache the top 500 "Hot" post IDs in a Redis ZSET (Sorted Set) so the primary feed can be served entirely from memory.
- **GraphQL Aggregation:** Implement a GraphQL Gateway to allow mobile clients to fetch posts, nested comments, and current user vote status in a single, strictly-typed network request, reducing over-fetching.