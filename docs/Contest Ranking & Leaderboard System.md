# Backend System Documentation: Contest Ranking & Leaderboard System

## 1. System Overview
The Ranking & Leaderboard System is the mathematical and analytical core of the contest arena. Generating dynamic ranks for thousands of concurrent users in real-time using SQL/NoSQL aggregations is a known bottleneck that crashes standard platforms.

Ranbhoomi solves this by completely offloading live ranking to Redis Sorted Sets (ZSETs) and Hashes, utilizing a decoupled Pub/Sub architecture. It features a 3-second Micro-Cache paired with In-Memory Request Coalescing (Promise Memoization) to mathematically eliminate the "Thundering Herd" effect. It also includes a secure, OOM-protected Cron finalizer for permanent archival.

## 2. Functional Requirements
- **$O(\log N)$ Live Ranking**: Maintain a constantly updating leaderboard calculated via complex penalty mathematics (Time Elapsed + (Wrong Attempts * 20 mins)).
- **Synchronous Redis Processing**: Leaderboard updates execute directly within the evaluation worker (bypassing unnecessary BullMQ queues) since Redis Hash/ZSET writes resolve in < 1ms.
- **Thundering Herd Protection**: The system must survive 100,000+ users refreshing the leaderboard in the exact same millisecond without crashing the database.
- **Indestructible Finalization**: Securely calculate, populate, and archive the absolute final rankings when a contest timer expires, making the problems public afterward.

## 3. Non-Functional Requirements
- **Performance**: Reads to `GET /ranking` must resolve in < 50ms, regardless of user count.
- **Memory Safety (OOM)**: Cron finalizers must use `.lean()` and batched processing to prevent V8 Engine memory limits from being breached when hydrating thousands of user records.
- **Resilience**: The system must survive Redis network stalls (via `Promise.race` timeouts) and corrupt state data (via strict JSON parsing guards).
- **Scalability**: The Promise Memoization map effortlessly scales horizontally across multiple Render/cloud instances without cross-node memory leaks.

## 4. Data Model Design
### Redis Core (In-Memory Fast Tier)
- `live_leaderboard:{contestId}`: ZSET storing `userId` sorted by an internally packed score `(totalScore - (totalPenalty / 1000000))`.
- `contest:{contestId}:users`: Hash storing a stringified JSON of individual user stats (Accepted problems, penalties, failed attempts) for $O(1)$ read/write access.
- `live_leaderboard_cache:{contestId}`: String (TTL: 3s) storing the fully hydrated, populated JSON response of the Top 100 users.

### Database Schema (MongoDB Persistent Tier)
- **ContestRanking**: A materialized view storing the finalized array of user ranks, populated with User and Problem details. Written exactly once when the contest ends.

## 5. API Design
| Endpoint / Event | Type | Description | Auth Required |
|------------------|------|-------------|---------------|
| `/api/contests/:slug/ranking` | GET | Fetches the 3s Micro-Cache (Live) or MongoDB (Finalized). | Public |
| `/api/cron/finalize-contests` | POST | Triggers the OOM-protected batch finalization. | Admin / Secret |
| `leaderboard-events` | Socket emit | Pings the specific contest room that a score changed. | User |

## 6. System Flow
### Real-Time Update & Request Coalescing Read
```
[POLLING WORKER] -> Determines "Accepted" or "Wrong Answer"
   │
   ├─► Calls `updateLeaderboard(userId, problem, status)` directly (No Queue)
   │
[REDIS SERVICE]
   ├─► (1) Fetch `contest:{id}:users` [Hash]
   ├─► (2) Calculate Penalty (Elapsed Time + (Attempts * 20))
   ├─► (3) Update Hash & Update ZSET `live_leaderboard:{id}`
   └─► (4) Publish `leaderboard-events` (userId, newScore)
   │
[SOCKET GATEWAY]
   ├─► Broadcasts event to room: `contest_{id}`
   │
[REACT FRONTEND] -> Receives event -> Debounces 2 seconds -> GET /ranking
   │
[API SERVER] -> GET /api/contests/:slug/ranking
   │
   ├─► Checks `live_leaderboard_cache:{id}` (3s TTL)
   │     ├─► CACHE HIT: Return instantly.
   │     │
   │     └─► CACHE MISS (100,000 concurrent requests):
   │           ├─► Request #1 checks `activeLeaderboardFetches` Map. Empty.
   │           ├─► Request #1 creates `fetchPromise` and stores it in the Map.
   │           ├─► Requests #2 - #100,000 arrive, see the Map, and instantly `await fetchPromise`.
   │           │
   │           ├─► [Inside fetchPromise - Runs ONLY ONCE]: 
   │           │     ├─► ZREVRANGE top 100 users (with 2s timeout guard).
   │           │     ├─► HMGET detailed stats (with 2s timeout guard).
   │           │     ├─► MongoDB `User.find()` + O(1) Map hydration (No .populate() crashes).
   │           │     ├─► JSON.parse() integrity checks.
   │           │     └─► Save to 3s Cache.
   │           │
   │           └─► Request #1 finishes. ALL 100,000 requests receive data simultaneously.
   │           └─► `finally` block deletes the Promise from the Map.
```
## 7. Performance Optimization
- **Request Coalescing (Promise Memoization)**: Solves the Thundering Herd. If a cache expires and 50,000 users request the leaderboard simultaneously, Node.js groups them into a single `fetchPromise`. The database receives exactly 1 query, and the result is fanned out to all 50,000 waiting requests instantly.
- **O(1) Manual MongoDB Hydration**: Instead of relying on Mongoose's `.populate()` (which struggles with raw Redis arrays), the system fetches a lean array of users and maps them via an $O(1)$ Javascript dictionary (`userMap[userId]`), drastically reducing CPU serialization overhead.
- **Direct Worker Execution**: Removed the BullMQ leaderboard queue. Because Redis updates (`HSET`, `ZADD`) take < 1ms, adding them to a separate queue introduced unnecessary latency and points of failure. The evaluation worker now updates the leaderboard synchronously.

## 8. Fault Tolerance
- **Corrupt JSON Guarding**: Wrapped Redis HMGET JSON parsing in `try...catch` blocks. If a manual database edit corrupts a user's state string, that specific user defaults to an `UNKNOWN_USER` fallback rather than crashing the entire leaderboard API.
- **Redis Timeout Guards**: Heavy `ZREVRANGE` and `HMGET` calls are wrapped in `Promise.race()` with a 2000ms timeout. If the Redis server hangs, the request elegantly fails rather than keeping HTTP sockets open indefinitely.
- **Cron Lock Safety**: `finalizeEndedContests` utilizes a distributed Redis lock `{ NX: true, EX: 60 }`. If two cron triggers fire simultaneously, only one process acquires the lock.
- **Cache Healing**: If the contest startTime drops out of Redis, the ranking service self-heals by querying MongoDB inline before computing penalties.

## 9. Consistency Model
- **Strong Consistency**: Mathematical score and penalty updates inside the Redis ZSET/Hash are strongly consistent and atomic per worker thread.
- **Eventual Consistency**: Viewers of the leaderboard may see state delayed by up to 3 seconds due to the Micro-Cache layer. Finalized rankings are completely locked and strongly consistent post-contest.

## 10. Security Considerations
- **BSON ObjectId Formatting**: MongoDB `_id` objects are explicitly serialized to primitive `.toString()` variants before interacting with Redis to prevent `[object Object]` cache key corruption.
- **Pagination Guarding**: The live ZSET fetch is hard-capped at 100 users (`ZREVRANGE 0 99`) to prevent the API from attempting to JSON-serialize and transfer 10,000 user objects in a single unpaginated HTTP request.

## 11. Trade-offs
- **In-Memory Promise Map vs. Distributed Lock for Coalescing**:
  - **Decision**: Used a local Node.js Map to coalesce requests instead of a Redis distributed lock (Redlock).
  - **Reasoning**: A distributed lock requires multiple Redis round-trips. A local memory map is 100% lock-free, synchronous, and scales perfectly across horizontal cloud instances (e.g., 4 Render instances will result in a maximum of 4 DB queries, which is well within safe thresholds).
- **Micro-Caching vs. Socket Payload**:
  - **Decision**: Sockets only send a "ping" to refresh, rather than sending the full leaderboard array.
  - **Reasoning**: Broadcasting a 50KB JSON array to 10,000 WebSocket connections simultaneously consumes massive bandwidth. Pinging and letting the Coalesced Micro-Cache absorb the REST requests is vastly more network-efficient.

## 12. Future Improvements
- **Global Multi-Region Leaderboards**: Transition to Redis Enterprise Active-Active (CRDTs) to allow seamless, conflict-free leaderboard syncing if the platform expands to multi-region architectures.
