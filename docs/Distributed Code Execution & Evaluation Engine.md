# Backend System Documentation: Distributed Code Execution & Evaluation Engine

## 1. System Overview
The Distributed Code Execution and Evaluation Engine is the most resource-intensive and mission-critical subsystem of Ranbhoomi. In a production-grade competitive programming and remote interview platform, executing untrusted user code synchronously within the main API thread is a catastrophic anti-pattern that leads to CPU starvation, connection exhaustion, and severe security vulnerabilities.

This module aggressively decouples code execution from the web tier using an event-driven, dual-path architecture:

- **Fast-Path (Ephemeral)**: Real-time execution over WebSockets for quick "Run Code" actions against sample test cases.
- **Formal-Path (Persistent)**: Asynchronous, BullMQ-driven execution for "Submit Code" actions against hidden, comprehensive test suites with strict database persistence, optimistic concurrency controls, and leaderboard updates.

## 2. Functional Requirements
- **Dual Execution Modes**: Support both in-memory ephemeral execution (Run) and database-persisted evaluation (Submit).
- **Multi-Language Support**: Compile and execute code securely in various programming languages via Judge0 sandboxing.
- **Driver Code Injection**: Automatically and invisibly merge hidden driver code/stubs with user-submitted code before execution.
- **Real-Time Telemetry**: Stream live execution status (Queued, Compiling, Judging, Accepted, WA) back to the client via WebSockets.
- **Idempotency & Retry Logic**: Prevent users from double-submitting while allowing the system to safely retry failed internal dispatches.
- **Leaderboard Integration**: Emit asynchronous events to update user rankings upon successful ("Accepted") submissions.

## 3. Non-Functional Requirements
- **Scalability**: The background worker nodes (dispatchers and pollers) must scale horizontally independent of the API web servers.
- **Performance**: "Run Code" must return within < 2 seconds. "Submit Code" must return within < 5 seconds (P95).
- **Reliability**: Zero dropped submissions. Guaranteed execution and state resolution even if API nodes crash mid-request.
- **Availability**: Resilient to downstream execution engine (Judge0) timeouts, applying Circuit Breakers to prevent cascading failures.
- **Memory Safety (OOM Protection)**: Protect Node.js and MongoDB from Out-Of-Memory crashes caused by hydrating massive stdout/stderr logs (16MB BSON limit).

## 4. Data Model Design
### Database Schema (MongoDB)
The module separates lightweight metadata from heavy execution logs using the Bounded Aggregate Pattern.

- **Submissions Collection**: Stores only lightweight metadata (user, problem, status, score, executionTime, memoryUsed, language). Optimized for rapid history fetching.
- **Submission_Details Collection**: Stores massive arrays of detailed test case results, stdout, stderr, and compiler errors. Separated to prevent the main Submissions table from breaching the 16MB document limit.
- **InterviewSessions Collection**: Links live collaborative code execution to specific WebSocket rooms.

### Redis Keys & Queues
- `samples:{slug}`: JSON string of sample test cases for Fast-Path execution (TTL: 1 hour).
- `eval_data:{slug}`: JSON string of full test cases and driver code for Formal-Path (TTL: 1 hour).
- `rate:run:{userId}`: Atomic counter for ephemeral run rate limiting (TTL: 60s).
- `circuit_breaker:judge0`: Flag set when Judge0 fails repeatedly, shedding load (TTL: 30s).
- **Queues (BullMQ)**: `dispatch-queue` (sends code to Judge0), `polling-queue` (fetches results), `leaderboard-queue` (updates ranks).

### Design Strategy & Indexing
- **Defensive Deserialization**: Cache reads use `typeof data === "string" ? JSON.parse(data) : data` to seamlessly support both Upstash HTTP auto-parsing and raw ioredis TCP strings, preventing `[object Object]` crashes.
- **Partial Unique Index**: MongoDB index on `{ problem: 1, user: 1, status: "Queued" }` acts as a hard database-level idempotency guard against double-submissions.

## 5. API Design
| Endpoint / Event | Type | Description | Auth Required |
|------------------|------|-------------|---------------|
| `/api/submissions` | POST (REST) | Enqueues a formal code submission. | User |
| `/api/submissions/status/:id` | GET (REST) | Fallback polling endpoint for UI resolution. | User |
| `run_code` | Socket on | Client sends raw code for ephemeral execution. | User |
| `run_status` | Socket emit | Server pushes state changes ("Compiling..."). | User |
| `run_result` | Socket emit | Server pushes final stdout/stderr to client. | User |
| `submission-events` | Socket emit | Pub/Sub bridge broadcasts formal submission results. | User |

## 6. System Flow
### Fast-Path: Ephemeral Execution (WebSockets)
```
[Client] -> Emit `run_code`
   │
   ▼
[Socket Gateway] -> Verify JWT & Extract `userId`
   │
   ├─► [Redis] Check Rate Limit (`rate:run:{userId}`)
   ├─► [Redis] Fetch `samples:{slug}` (Cache Miss -> DB -> Cache)
   │
   ▼
[Run Handler] -> Merge Driver Code & User Code
   │
   ├─► Emit `run_status` ("Compiling...")
   ├─► POST to Judge0 API -> Get Tokens
   │
   ▼
[In-Memory Polling Loop]
   │
   ├─► Batch Poll Judge0 (`pollJudge0Batch`) every 2s.
   ├─► Break loop if `!socket.connected` (Memory leak guard).
   │
   ▼
[Format & Truncate Results] -> Decode Base64 -> Emit `run_result` -> [Client]
```
### Formal-Path: Persistent Execution (BullMQ + Redis Pub/Sub)
```
[CLIENT] 
   │
   ├── (1) POST /submissions ──────────────────────────┐
   │                                                   ▼
   │                                             [API SERVER]
   │                                                   │ (2) Insert "Queued" to MongoDB
   │                                                   │ (3) Push to 'dispatch-queue'
   │                                                   ▼
   │                                              [REDIS TCP]
   │                                                   │
   │                                                   ▼
   │                                            [DISPATCH WORKER]
   │                                                   │ (4) Fetch TestCases (Redis Cache)
   │                                                   │ (5) Submit to Judge0
   │                                                   │ (6) Push to 'polling-queue'
   │                                                   ▼
   │                                             [POLLING WORKER]
   │                                                   │ (7) Batch Poll Judge0
   │                                                   │ (8) OCC DB Update -> "Accepted/WA"
   │                                                   │ (9) Publish to Redis Pub/Sub
   │                                                   ▼
   │                                       [REDIS PUB/SUB CHANNEL]
   │                                                   │
   │                                                   ▼
   ├── (10) Event 'submission-events' <──────── [SOCKET GATEWAY]
   │
[CLIENT UI UPDATES]
```
## 7. Performance Optimization
- **Asynchronous Non-Blocking Workers**: If Judge0 returns a "Processing" status, the BullMQ polling worker does not sleep/block the thread. It immediately re-queues the job with a delay, freeing the Node.js thread to process other submissions.
- **Batch Polling**: The worker evaluates execution tokens in batches (`pollJudge0Batch`) to drastically minimize TCP overhead and network I/O with the execution engine.
- **Closure-Proof UI Poller**: The frontend utilizes a `useRef` coordinated fallback poller. If the WebSocket connection drops, the REST poller seamlessly takes over, ensuring the UI always resolves without stale state bugs.
- **Base64 Decoding & Truncation**: Output from Judge0 is aggressively decoded from Base64 and safely truncated (`safeTruncate`) to 2000 characters before hitting the network, preventing massive payload latency.

## 8. Fault Tolerance
- **Optimistic Concurrency Control (OCC)**: The polling worker uses a strict state-match (`status: "Judging"`) when saving results. If a network blip causes BullMQ to retry a job, the OCC guard prevents the second worker thread from blindly overwriting the finished database record.
- **Circuit Breaker**: If Judge0 fails repeatedly (e.g., 20+ API timeouts), a Redis MULTI transaction trips a circuit breaker (`circuit_breaker:judge0`). The API immediately sheds load by returning `503 Service Unavailable` instead of queueing doomed submissions.
- **Cache Healing**: If Upstash evicts the `eval_data` key mid-flight due to LRU memory policies, the worker gracefully catches the cache miss, re-queries MongoDB, and repairs the cache inline before crashing.
- **Dead Letter Queue (DLQ)**: Submissions polled more than 15 times without a result are automatically marked as `Internal Error`, triggering a DLQ event to notify the user and purge the poisoned job.

## 9. Consistency Model
- **Eventual Consistency (Real-Time UI)**: The transition from `Judging` to `Accepted` is eventually consistent. The client is notified via the Redis Pub/Sub to Socket bridge.
- **Strong Consistency (Database State)**: Database updates for submissions utilize MongoDB Atomic Operators (`$set`) coupled with the OCC pattern to guarantee no race conditions occur during concurrent worker processing.
- **Decoupled Leaderboard**: Rank calculations are strictly eventually consistent. They are pushed to a separate `leaderboard-queue`, preventing complex distributed locking mechanisms from blocking the primary evaluation thread.

## 10. Security Considerations
- **Sandboxed Execution**: User code is executed in isolated Judge0 Docker containers with strict memory (e.g., 256MB) and time limits (e.g., 2.0s) to prevent fork bombs and crypto-mining abuse.
- **Atomic Rate Limiting**: Redis MULTI blocks are used to `INCR` and `EXPIRE` request counts atomically. Ephemeral runs are hard-capped at 2 per minute, and formal submissions are locked to prevent spam.
- **Queue Backpressure Guard**: The API checks `dispatchQueue.getWaitingCount()` before accepting submissions. If the queue exceeds 5000 items, it rejects new submissions (503) to protect the Redis memory limit.

## 11. Trade-offs
- **Polling vs. Webhooks (Judge0)**:
  - **Decision**: Implemented asynchronous polling via BullMQ instead of Judge0 Webhooks.
  - **Reasoning**: Webhooks require exposing a public ingress endpoint, introducing security risks and requiring complex signature verification. Polling keeps the execution pipeline securely within the private VPC, at the minor cost of slightly higher internal network I/O.
- **Pub/Sub Bridge vs. Direct DB Watch**:
  - **Decision**: Used Redis Pub/Sub to bridge background workers to WebSockets instead of MongoDB Change Streams.
  - **Reasoning**: MongoDB Change Streams add significant load to the replica set's CPU. Redis Pub/Sub is lightweight, ephemeral, and instantly routes the success event to the correct Socket room.
- **Socket (Run) vs. REST (Submit)**:
  - **Decision**: Ephemeral runs use pure Sockets, while formal submissions use REST.
  - **Reasoning**: Formal submissions require strict HTTP status codes (429 Too Many Requests, 503 Service Unavailable) and immediate `submissionId` generation for persistence. Sockets lack standard HTTP failure semantics.

## 12. Future Improvements
- **Kubernetes KEDA Auto-scaling**: Implement KEDA to auto-scale the BullMQ worker pods (horizontal pod autoscaling) dynamically based on the `dispatch-queue` depth during massive contest surges.
- **gRPC Internal Microservices**: Migrate the Judge0 REST API interactions to gRPC to reduce serialization overhead (JSON parsing) during massive batch evaluations.
- **Multi-Region Execution Routing**: Deploy isolated Judge0 clusters in different geographic regions (e.g., AWS us-east-1, ap-south-1) and route execution payloads geographically based on the user's socket connection point to minimize latency.