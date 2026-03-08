# Backend System Documentation: Contest Code Execution & Run Engine

## 1. System Overview
The Contest Code Execution Engine is a highly isolated, high-throughput subsystem of Ranbhoomi designed to handle the massive, sudden spikes in traffic (the "Stampede Effect") typical during competitive programming tournaments.

To maintain sub-second latencies under extreme load, this module aggressively decouples code execution into two distinct paths:

- **Fast-Path (Ephemeral Run)**: Real-time, strictly in-memory execution over WebSockets for quick "Run Code" actions against sample test cases. It reuses the globally optimized socket pool to avoid database overhead.
- **Formal-Path (Persistent Submit)**: Asynchronous, BullMQ-driven execution for official "Submit" actions. This path operates on physically isolated contest queues, utilizing strict Redis mutex locks and an aggressive Code Hashing Cache to intercept duplicate logic and bypass execution entirely.

## 2. Functional Requirements
- **Dual Execution Modes**: Support for ephemeral testing (Run) without database persistence, and official evaluation (Submit) with strict persistence and scoring.
- **Code Hashing (The LeetCode Trick)**: Intercept duplicate formal submissions globally, return cached evaluation results instantly, and bypass the execution queues and Judge0 entirely.
- **Strict Time & Access Bounds**: Validate contest start/end times and O(1) user registration status before accepting any formal submit payload.
- **Job Deduplication**: Prevent UI double-clicks from flooding the queues using deterministic BullMQ `jobId` constraints.
- **Real-Time Telemetry**: Broadcast granular execution states (Compiling, Judging, Accepted) directly to isolated contest WebSocket rooms or directly to the user's socket connection.

## 3. Non-Functional Requirements
- **Scalability**: Contest background workers (`contestDispatchWorker`, `contestPollingWorker`) must scale horizontally independent of practice queues during peak tournament windows.
- **Performance**: "Run Code" must return within < 2 seconds. Formal "Submit" cache hits must resolve in < 100ms. Queue insertions must resolve in < 300ms.
- **Availability**: System must dynamically shed load (`503 Service Unavailable`) if the contest queue depth exceeds 5,000 to prevent Redis memory exhaustion.
- **Concurrency**: Handle thousands of simultaneous POST requests at T=0 (contest start) without stalling the Node.js event loop.

## 4. Data Model Design
### Database Schema (MongoDB)
- **ContestSubmission**: Lightweight metadata explicitly tied to a `contestId`. Separated from standard practice Submissions to allow targeted indexing and rapid aggregation during leaderboard finalization. Ephemeral "Runs" do not touch this or any other collection.

### Redis Keys & Queues
- `samples:{slug}`: JSON string of sample test cases for Fast-Path execution (TTL: 1 hour).
- `cache:sub:{problemId}:{codeHash}`: Stores full Judge0 execution results for formal submissions for 24 hours. Evaluated via SHA-256 hash of code-language payload.
- `lock:submit:{userId}:{problemSlug}`: 5-second Mutex lock preventing rapid-fire double submissions.
- `rate:run:{userId}`: Atomic counter for ephemeral run rate limiting (Max 2/min).
- **Queues (BullMQ)**: `contest-dispatch-queue` (Concurrency: 15) and `contest-polling-queue` (Concurrency: 30).

### Design Strategy & Indexing
- **Physical Segregation**: Contest formal submission queues are completely decoupled from practice queues to ensure blast-radius containment. Practice downtime cannot affect live tournaments.

## 5. API Design
| Endpoint / Event | Type | Description | Auth Required |
|------------------|------|-------------|---------------|
| `/api/contests/:slug/submit` | POST (REST) | Enqueues formal contest code, checks cache, and deduplicates. | User + Registered |
| `run_code` | Socket on | Client sends raw code for ephemeral execution against samples. | User |
| `run_status` / `run_result` | Socket emit | Pushes real-time ephemeral execution states and final stdout to client. | User |
| `submission-events` | Socket emit | Pub/Sub bridge broadcasts formal formal submission results to the user. | User |

## 6. System Flow
### Flow A: Fast-Path (Ephemeral Contest Run via WebSockets)
```
[CLIENT] -> Emit `run_code` (Contest Problem Slug)
   │
   ▼
[SOCKET GATEWAY] -> Verify JWT
   │
   ├─► [Redis] Check Rate Limit (`rate:run:{userId}` -> Max 2/min)
   ├─► [Redis] Fetch `samples:{slug}` (Cache Miss -> DB -> Cache)
   │
   ▼
[RUN HANDLER] -> Merge Driver Code & User Code
   │
   ├─► Emit `run_status` ("Compiling...")
   ├─► POST to Judge0 API -> Get Tokens
   │
   ▼
[IN-MEMORY POLLING LOOP]
   │
   ├─► Batch Poll Judge0 every 2s.
   ├─► Break loop if `!socket.connected` (Guard against memory leaks).
   │
   ▼
[FORMAT & TRUNCATE RESULTS] -> Decode Base64 -> Emit `run_result` -> [CLIENT]
```
### Flow B: Formal-Path (Persistent Contest Submit via BullMQ)
```
[CLIENT]
   │
   ├── (1) POST /api/contests/:slug/submit ────────────────┐
   │                                                       ▼
   │                                                 [API SERVER]
   │                                                       │ (2) Acquire Redis Mutex Lock (Double-click protection)
   │                                                       │ (3) Validate Time Bounds & Registration (MongoDB)
   │                                                       │ (4) Generate SHA-256 Code Hash
   │                                                       │ (5) Check Redis Code Cache (`cache:sub:...`)
   │                                                       │
   │                                  ┌────────────────────┴────────────────────┐
   │                           [⚡ CACHE HIT]                              [CACHE MISS]
   │                                  │                                         │
   │                   (6a) Save DB `ContestSubmission`          (6b) Save DB status: "Queued"
   │                   (7a) Update Live Leaderboard instantly    (7b) Add to `contest-dispatch-queue` (with deduplication)
   │                   (8a) Publish to Redis Pub/Sub             (8b) Release Lock & Return HTTP 201
   │                   (9a) Release Lock & Return HTTP 200                      │
   │                                  │                                         ▼
   │                                  │                                    [REDIS TCP]
   │                                  │                                         │
   │                                  │                                         ▼
   │                                  │                          [CONTEST DISPATCH WORKER] (Concurrency: 15)
   │                                  │                                         │ (9) Fetch Hidden Test Cases
   │                                  │                                         │ (10) Submit code to Judge0
   │                                  │                                         │ (11) Push tokens to `contest-polling-queue`
   │                                  │                                         ▼
   │                                  │                          [CONTEST POLLING WORKER] (Concurrency: 30)
   │                                  │                                         │ (12) Batch Poll Judge0
   │                                  │                                         │ (13) OCC DB Update -> "Accepted/WA"
   │                                  │                                         │ (14) Save result to Code Hash Cache ⚡
   │                                  │                                         │ (15) Trigger Leaderboard Worker
   │                                  │                                         │ (16) Publish to Redis Pub/Sub
   │                                  │                                         ▼
   │                                  └────────────────────────────────► [REDIS PUB/SUB]
   │                                                                            │
   │                                                                            ▼
   ├── (17) Event 'submission-events' & 'leaderboard-updated' <─────── [SOCKET GATEWAY]
   │
[CLIENT UI UPDATES]
```
## 7. Performance Optimization
- **O(1) Execution Bypassing**: The Code Hashing mechanism saves vast amounts of CPU and API quota. If 100 users submit the exact same logic (e.g., copying a standard boilerplate), 99 of them are served directly from Redis RAM without touching BullMQ or Judge0.
- **In-Memory Ephemeral Polling**: The "Run Code" logic uses a local while loop within the socket instance rather than BullMQ, eliminating queue I/O latency for trial runs.
- **Pre-emptive Load Shedding**: The Controller checks `contestDispatchQueue.getWaitingCount()`. If the queue is overwhelmed, it rejects formal requests instantly (503) rather than allowing the event loop to hang.

## 8. Fault Tolerance
- **Distributed Mutex Locks**: Using Redis `{ nx: true, ex: 5 }`, the API creates an impenetrable shield against UI bugs where a user frantically clicks "Submit" 10 times in one second during a contest.
- **Strict Idempotency Guard**: Workers check `if (submission.status !== "Queued") return;` ensuring that if BullMQ accidentally double-delivers a job during a network partition, the contest code is not re-executed.
- **Circuit Breaker**: Repeated timeouts from the Judge0 cluster automatically flip a Redis flag, halting queue dispatches and protecting the backend from cascading failures.

## 9. Consistency Model
- **Strong Consistency**: Code cache verification and Mutex locking are strongly consistent via Redis atomic operations.
- **Eventual Consistency**: The formal execution flow and Socket notifications are eventually consistent, relying on BullMQ's at-least-once delivery guarantees. Ephemeral runs are tied to the active socket state and drop if the connection closes.

## 10. Security Considerations
- **Boundary Validation**: The API verifies `isProblemInContest` to ensure users cannot maliciously submit against problems that belong to a different active contest or the public pool.
- **Payload Constraints**: Code length is strictly clamped to 20KB to prevent memory bloat during Base64 encoding/decoding.
- **Global Rate Limiting**: The "Run Code" feature utilizes a strict `rate:run:{userId}` limiter globally (Max 2/min), preventing users from spamming the Judge0 cluster via the fast-path socket.

## 11. Trade-offs
- **Hashing Overhead vs. Execution Wait**: Computing a SHA-256 hash synchronously in the API thread takes ~1ms, which is a worthy trade-off to potentially bypass a 2-second Judge0 execution queue entirely during a contest.
- **Shared Sockets vs. Isolated Queues**: "Run Code" uses the global shared socket gateway, while "Submit Code" uses dedicated contest queues. This prioritizes isolation for formal grading while keeping infrastructure costs lower for ephemeral test runs.

### ⚡Key Differences from the Practice Flow:
- **The Hash Split:** Right at the API server, the request branches. If the exact same code was submitted previously (even by someone else), it takes the left branch, completely bypassing BullMQ and Judge0.

- **Dedicated Workers:** The right branch uses contest-dispatch-queue and contest-polling-queue. These have 3x the concurrency limits of the practice workers to chew through massive traffic spikes rapidly.

- **Double Event Emission:** The Socket Gateway doesn't just ping the user that their code finished; it also broadcasts a leaderboard-updated ping to the entire contest room so everyone sees the ranks shift in real-time.

## 12. Future Improvements
- **Containerized Judge Isolation**: Move from managed Judge0 APIs to a self-hosted, auto-scaling Kubernetes cluster of Judge0 workers dedicated solely to the `contest-dispatch-queue` to guarantee unmetered throughput during grandmaster tournaments.