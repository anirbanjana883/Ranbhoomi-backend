# Backend System Documentation: Problem Management Module

## 1. System Overview
The Problem Management System is the core content-delivery backbone of the Ranbhoomi platform. Similar to LeetCode or HackerRank, this module is responsible for serving coding challenges to millions of concurrent users while providing administrators with robust, transactional tools to curate content (problems, test cases, code stubs, and solutions).

Given the highly asymmetrical read-to-write ratio (99% Reads / 1% Writes), this system is aggressively optimized for read throughput via distributed caching, while enforcing strict ACID guarantees and concurrency guards on write operations to ensure data integrity.

## 2. Functional Requirements
- **Problem Discovery**: Paginated browsing of problems with faceted filtering (difficulty, tags, company tags) and full-text search.
- **Problem Retrieval**: High-speed retrieval of problem descriptions, boilerplate code, and sample test cases.
- **Solution Gating**: Secure delivery of problem editorials/solutions, locked behind Premium subscription status or an "Accepted" submission record.
- **Content Management (Admin)**: Creation, modification, and soft-deletion of problems.
- **Test Case Management (Admin)**: Atomic addition and removal of hidden and sample test cases, with strict upper limits to prevent document bloat.

## 3. Non-Functional Requirements
- **Scalability**: Must effortlessly serve 10,000+ concurrent problem reads without degrading database performance.
- **Performance**: Read latency for a single problem must be < 50ms (P99).
- **Reliability**: Ensure zero orphaned test cases or broken references during concurrent admin edits.
- **Availability**: 99.99% uptime. The system must degrade gracefully (e.g., fallback to DB if Redis dies).
- **Concurrency Considerations**: Prevent race conditions when multiple admins attempt to attach test cases to a problem simultaneously.

## 4. Data Model Design
### Database Schema (MongoDB)
The module utilizes a normalized approach for test cases to bypass MongoDB's 16MB document size limit for heavily tested problems.

- **Problems Collection**: Contains title, slug, description, difficulty, tags, companyTags, starterCode, driverCode, solution, isPremium, isPublished, and an array of testCases (ObjectIds).
- **TestCases Collection**: Contains problem (Ref), input, expectedOutput, isSample.

### Redis Keys
- `problem:{slug}`: Caches the heavily read, sanitized problem payload (TTL: 10 mins).
- `lock:problem:{slug}`: Mutex lock to prevent Cache Stampedes (TTL: 5 seconds).
- `solution_unlock:{userId}:{problemId}`: Caches user's authorization to view a solution (TTL: 30 days).

### Design Strategy & Indexing
- **Soft Deletion**: `isDeleted` boolean prevents breaking historical user submissions while hiding the problem from the catalog.
- **Text Index**: A B-Tree Text Index (`$text`) on title and description for O(log N) search performance, replacing slow O(N) Regex collection scans.
- **Compound Indexes**: `{ isPublished: 1, isDeleted: 1, createdAt: -1 }` to optimize catalog pagination.

## 5. API Design
| Endpoint | Method | Description | Auth Required |
|----------|--------|-------------|---------------|
| `/api/problems` | GET | Get paginated, filtered, and searched problems. | Public / User |
| `/api/problems/admin` | GET | Get all problems including unpublished. | Admin / Master |
| `/api/problems/:slug` | GET | Get single problem details (cached). | Public / User |
| `/api/problems/createproblem` | POST | Transactional problem & testcase creation. | Admin / Master |
| `/api/problems/:slug` | PATCH | Update problem details & invalidate cache. | Admin / Master |
| `/api/problems/:slug` | DELETE | Soft-delete a problem. | Admin / Master |
| `/api/problems/:slug/testcases` | POST | Atomically add a test case with size guards. | Admin / Master |
| `/api/problems/testcases/:id` | DELETE | Transactionally remove a test case. | Admin / Master |
| `/api/problems/:slug/solution` | GET | Fetch solution (requires AC or Premium). | User |

## 6. System Flow
### Highly Available Read Flow (Thundering Herd Prevention)
```
[Client] 
   │ 
   ▼
[API Gateway / Router]
   │ 
   ▼
[Problem Controller] ──► Query Redis: GET `problem:{slug}`
   │
   ├─► IF CACHE HIT: Return 200 OK directly to Client.
   │
   └─► IF CACHE MISS:
         │
         ├─► Attempt to acquire Mutex: SET `lock:problem:{slug}` NX EX 5
         │
         ├─► IF LOCK FAILED (Another thread is fetching):
         │     └─► Poll Redis every 50ms (up to 200ms) waiting for cache.
         │
         └─► IF LOCK ACQUIRED:
               ├─► Fetch from MongoDB (`.lean()`)
               ├─► Store in Redis: SET `problem:{slug}` EX 600
               ├─► Delete Mutex Lock
               └─► Return 200 OK to Client.
```

### Transactional Write Flow (Problem Creation)
```
[Admin Client] -> POST /createproblem
   │
   ▼
[Start ACID Session]
   │
   ├─► Validate constraints & normalize tags.
   ├─► Insert Problem Document.
   ├─► Insert N Test Case Documents natively linked to Problem ID.
   ├─► Update Problem Document with array of Test Case ObjectIds.
   │
[Commit Transaction] -> IF Fail: Rollback everything (No orphaned data)
   │
   ▼
[Return 201 Created]
```
## 7. Performance Optimization
- **Distributed Lock (Cache Stampede Prevention)**: If a popular problem's cache expires during a contest, thousands of requests could crash MongoDB. The Redis NX EX lock ensures only one thread queries the DB, while others wait briefly for the new cache.
- **Lean Queries**: All MongoDB `find()` and `findOne()` operations use `.lean()` to bypass Mongoose hydration, resulting in ~3x faster serialization and reduced memory overhead.
- **Parallel I/O**: The Solution endpoint checks the Redis Cache (isUnlocked) and the MongoDB Submissions table simultaneously using `Promise.all()`, effectively cutting the endpoint latency in half.
- **Write-Time Precomputation**: Tags and slugs are normalized and sanitized during the write phase, saving CPU cycles during the read-heavy phase.

## 8. Fault Tolerance
- **Database Write Conflicts**: Mongoose `session.withTransaction()` handles write conflicts. If the server crashes between creating a problem and inserting test cases, the entire transaction is rolled back.
- **Deadlock Prevention**: The Redis Mutex lock has a strict 5-second Expiration (TTL). If the Node.js worker crashes while holding the lock, it releases automatically, preventing infinite hangs for other users.
- **Redis Failure Degradation**: If Redis becomes unreachable, the asyncHandler and Try/Catch blocks are configured to gracefully bypass the cache layer and route traffic directly to MongoDB to maintain availability (though at reduced performance).

## 9. Consistency Model
- **Strong Consistency (Writes)**: Administrative actions (Creating/Editing problems, adding test cases) use MongoDB's snapshot read concern and majority write concern to guarantee absolute data integrity.
- **Eventual Consistency (Reads)**: The public-facing problem catalog uses a Redis cache with a 10-minute TTL. Admin updates invalidate the cache immediately (`redisClient.del()`), ensuring the eventual consistency gap is near-zero for direct problem lookups.
- **Atomic Concurrency**: When admins add test cases, the system uses `$expr: { $lt: [{ $size: "$testCases" }, "$maxTestCases"] }` inside a `findOneAndUpdate`. This pushes the array-length validation directly into the MongoDB locking engine, entirely preventing Race Conditions where simultaneous API calls might bypass maximum test case limits.

## 10. Security Considerations
- **Role-Based Access Control (RBAC)**: Middleware heavily guards write endpoints (`isAdmin`, `isMaster`). Standard users are strictly isolated to GET endpoints.
- **Content Gating**: Solutions are heavily verified on the backend. A user cannot fetch a solution unless they have an Accepted status in the Submissions collection or hold a Premium JWT payload.
- **NoSQL Injection Prevention**: Explicit schema type casting and avoiding raw user input in query objects protect against `$where` and `$ne` injection attacks.
- **Data Sanitization**: Markdown descriptions and solutions are sanitized on the frontend via DOMPurify, but backend validation rejects malformed HTML structures.

## 11. Trade-offs
- **Soft Delete vs. Hard Delete**: We chose Soft Deletion (`isDeleted: true`). Trade-off: Consumes slightly more disk space over time. Benefit: O(1) deletion time and preserves referential integrity for users who submitted code to that problem in the past.
- **Normalized Test Cases vs. Embedded**: Test cases are stored in a separate collection rather than an embedded array. Trade-off: Requires an extra `$lookup`/populate during fetch. Benefit: Prevents the Problem document from exceeding the 16MB BSON limit when a problem has hundreds of massive test cases.
- **Polling Lock vs. Pub/Sub**: For cache stampedes, we used a 50ms interval polling mechanism instead of Redis Pub/Sub. Trade-off: Slightly more CPU polling overhead. Benefit: Significantly less architectural complexity and connection overhead compared to maintaining active Pub/Sub listeners.

## 12. Future Improvements
- **Elasticsearch Integration**: Offload the text index search to Elasticsearch or Algolia to provide typo-tolerance, fuzzy matching, and faster complex faceted queries.
- **Content Delivery Network (CDN)**: Store problem descriptions, images, and heavy markdown assets in an S3 bucket fronted by Cloudflare to reduce Node.js bandwidth consumption.
- **GraphQL Migration**: Transition the Problem catalog to GraphQL, allowing the frontend to selectively request fields (e.g., fetching only the title and difficulty for lists without transferring the heavy description strings).
