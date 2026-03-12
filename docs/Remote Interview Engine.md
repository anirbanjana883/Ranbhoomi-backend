# Backend System Documentation: Remote Interview Engine

## 1. System Overview

The Ranbhoomi Interview System is a real-time, low-latency collaborative environment designed to facilitate technical interviews. It seamlessly integrates real-time bidirectional code synchronization, a collaborative system design whiteboard, remote code execution (RCE), and peer-to-peer (P2P) WebRTC audio/video communication into a single unified workspace.

In a scalable competitive programming and hiring platform (akin to LeetCode or HackerRank), this module is critical. It must guarantee sub-100ms latency for code syncing, handle WebRTC signaling without dropping packets, and securely sandbox remote code execution without exposing the main backend to malicious code.

---

## 2. Functional Requirements

- **Secure Room Provisioning:** Authorized access control restricting room entry to the assigned Interviewer and Candidate.
- **Real-Time Code Sync:** Bidirectional synchronization of code and language selections across clients.
- **WebRTC Signaling:** Relay of Session Description Protocol (SDP) offers, answers, and ICE candidates to establish P2P video/audio.
- **Collaborative Whiteboarding:** Real-time synchronization of drawing vectors and cursors (Tldraw integration).
- **Remote Code Execution (RCE):** Ability to execute written code against test cases securely and return results asynchronously.
- **Problem Management:** Dynamic fetching and assignment of coding problems to the active session.
- **Presence & Status:** Real-time notifications for user connections, disconnections, and execution states.

---

## 3. Non-Functional Requirements

- **Scalability:** The websocket layer must scale horizontally across multiple Node.js instances using a Pub/Sub adapter (e.g., Redis).
- **Performance:** Code sync and whiteboard updates must achieve < 50ms latency.
- **Reliability:** WebRTC signaling must successfully traverse NATs/Firewalls using diverse STUN (and eventually TURN) servers.
- **Availability:** 99.99% uptime for the signaling server; graceful degradation (e.g., video fails, but coding continues).
- **Concurrency:** Support thousands of concurrent interview sessions without thread blocking (Node.js event loop optimization).

---

## 4. Data Model Design

### Database Schema (MongoDB)

#### Collection: InterviewSessions
Stores the immutable and persistent metadata of the interview.

- `roomID` (String, Indexed, Unique): UUID for the session.
- `interviewer` (ObjectId, Ref: User, Indexed): The host.
- `candidate` (ObjectId, Ref: User, Indexed): The interviewee.
- `problem` (ObjectId, Ref: Problem): Currently selected problem.
- `status` (Enum: SCHEDULED, ACTIVE, COMPLETED).
- `startTime` / `endTime` (Dates).

#### Collection: Problems

- `slug` (String, Unique)
- `title`, `description`, `difficulty`
- `starterCode` (Array of language/code objects)
- `testCases` (Array of inputs/expected outputs)

### Redis Keys (Ephemeral State)

We use Redis to store highly volatile data to prevent MongoDB write-thrashing.

- `interview:session:{roomID}:code` (String, TTL: 24h) - Latest code snapshot.
- `interview:session:{roomID}:language` (String, TTL: 24h) - Current language.

### Indexing Strategy

- **MongoDB:** Single-field ascending index on `roomID` for O(1) connection validation. Compound index on `{ interviewer: 1, status: 1 }` for dashboard queries.
- **Redis:** Constant time O(1) key-value lookups.

---

## 5. API Design

### REST Endpoints

| Endpoint | Method | Description | Response | Status |
|---|---|---|---|---|
| `/api/interview/:roomID` | GET | Validates auth and fetches session details, current code, and problem. | `{ data: { role, code, problem } }` | 200, 401, 404 |
| `/api/interview/:roomID/end` | PATCH | Marks the interview as completed. | `{ message: "Completed" }` | 200, 403 |

### Socket Events (Namespace: /)

| Event Name | Emit Type | Description | Payload |
|---|---|---|---|
| `join-room` | Client -> Server | Attempts to join a room. | `roomID` |
| `code-change` | Client -> Server | Broadcasts keystrokes. | `{ roomID, code }` |
| `select-problem` | Client -> Server | Interviewer assigns a problem. | `{ roomID, problemId }` |
| `offer` / `answer` | Client -> Server | WebRTC SDP exchange. | `{ target, offer/answer }` |
| `ice-candidate` | Client -> Server | WebRTC NAT traversal packet. | `{ target, candidate }` |
| `run_code` | Client -> Server | Triggers asynchronous code execution. | `{ roomID, language, code }` |
| `run_result` | Server -> Client | Returns execution output. | `{ stdout, stderr, status }` |
| `user-disconnected` | Server -> Client | Broadcasts when a user drops. | `{ socketId }` |

---

## 6. System Flow

Below is the step-by-step request flow from the client to the backend during an interview lifecycle.

```
[Client A (Interviewer)]               [Node.js + Socket.io Server]               [Client B (Candidate)]
       |                                          |                                         |
       |------- GET /api/interview/123 ---------->| (Auth & Fetch DB)                       |
       |<------ 200 OK (Session Data) ------------|                                         |
       |                                          |                                         |
       |------- Socket: join-room --------------->| (Validates JWT)                         |
       |                                          |------- Socket: user-joined ------------>|
       |                                          |                                         |
       |=== WebRTC Signaling (Via Server) ========|=========================================|
       |------- Socket: offer ------------------->|                                         |
       |                                          |------- Socket: offer-received --------->|
       |<------ Socket: answer-received ----------|                                         |
       |<------ Socket: answer -------------------|                                         |
       |                                          |                                         |
       |=== P2P WebRTC Established (Direct) ======|=========================================|
       |<~~~~~~~~~~~~~~~~~ Audio / Video Stream (No Server Relay) ~~~~~~~~~~~~~~~~~~~~~~~~~>|
       |                                          |                                         |
       |=== Collaborative Coding =================|=========================================|
       |------- Socket: code-change ------------->| (Updates Redis)                         |
       |                                          |------- Socket: code-changed ----------->|
       |                                          |                                         |
       |=== Code Execution =======================|=========================================|
       |------- Socket: run_code ---------------->| -> [Message Queue] -> [Judge Worker]    |
       |<------ Socket: run_result ---------------| <- [Redis Pub/Sub] <- [Judge Worker]    |
```

---

## 7. Performance Optimization

- **Transient State in Redis:** Instead of writing every keystroke to MongoDB, code and language states are stored in Redis with a 24-hour TTL. This reduces DB writes by 99.9%.
- **Socket.io Redis Adapter:** To support thousands of concurrent interviews across multiple Node.js instances, the Redis adapter is used. When a user on Server A updates code, Redis Pub/Sub routes the broadcast to Server B where the other user is connected.
- **Async Code Execution:** RCE is never processed on the main Node.js event loop. `run_code` pushes a job to a RabbitMQ/BullMQ queue. A separate isolated worker executes the code and publishes the result back to the Node.js server via Redis Pub/Sub.
- **Debouncing / Throttling:** Client-side updates (like Tldraw coordinates) are throttled to 50ms to prevent websocket flooding.

---

## 8. Fault Tolerance

- **WebRTC Fallbacks:** Currently utilizing 3 Google STUN servers. If symmetric NATs block P2P connections, the system gracefully degrades (video fails, but websocket-based coding continues uninterrupted).
- **Reconnection Handling:** If a websocket drops, Socket.io's built-in polling/reconnection kicks in. Upon reconnecting, the client re-fetches the latest code from Redis to heal any missed keystrokes.
- **Worker Crash (Judge):** If the code execution worker crashes (e.g., due to an Out-Of-Memory error from an infinite loop), the Queue pushes the message to a Dead Letter Queue (DLQ), and the frontend receives a generic "Execution Failed" event rather than hanging indefinitely.
- **Redis Failure:** If Redis goes down, code sync gracefully degrades to pure socket-broadcasting (though persistence across reloads is temporarily lost).

---

## 9. Consistency Model

- **Eventual Consistency (Code Sync):** The platform uses a Last-Write-Wins (LWW) model for keystrokes. While this is acceptable for basic pair programming, rapid simultaneous typing on the same line might result in momentary overwrites.
- **Strong Consistency (Session & Execution):** Starting an interview, ending an interview, and recording a final submission score require strict ACID transactions in MongoDB to ensure accurate hiring data.

---

## 10. Security Considerations

- **Authentication & Authorization:** WebSockets are authenticated via HTTP-only Cookies (JWT). The socket middleware intercepts the upgrade request, decodes the JWT, extracts the `userId`, and verifies against the `InterviewSession` document that the user is explicitly allowed in that `roomID`.
- **Abuse Prevention:**
  - **Rate Limiting:** WebSockets are rate-limited to prevent malicious flooding of `code-change` events.
  - **Execution Spam:** `run_code` events are throttled per user (e.g., max 1 execution per 5 seconds) to prevent queue overwhelming.
  - **RCE Sandboxing:** User code is strictly executed inside isolated Docker containers with dropped privileges, disabled network access, and strict memory/CPU limits.

---

## 11. Trade-offs

- **Last-Write-Wins vs. Operational Transformation (OT):** We chose simple Socket broadcasting (LWW) over complex OT/CRDT (Conflict-free Replicated Data Types like Yjs). Reasoning: It dramatically speeds up development time and lowers server CPU load. In an interview context, two people rarely type on the exact same line simultaneously.
- **P2P WebRTC vs. SFU:** We chose Peer-to-Peer (Mesh) architecture over a Selective Forwarding Unit (SFU) server. Reasoning: Interviews are strictly 1-on-1. P2P provides the absolute lowest latency and costs $0 in server bandwidth. An SFU is only necessary for 3+ participants.
- **Redis vs. DB for Code State:** We accepted the risk of losing code if Redis crashes, in exchange for massive performance gains over MongoDB write operations.

---

## 12. Future Improvements

To scale this to a LeetCode-level tier, the following evolutions are necessary:

- **CRDT Integration (Yjs):** Replace simple socket string broadcasting with Yjs over WebSockets to support perfect, conflict-free simultaneous editing.
- **TURN Server Implementation:** Deploy Coturn servers to guarantee video connection success for corporate users behind strict symmetric NAT firewalls.
- **Multi-Region Routing:** Deploy Node.js signaling servers in multiple AWS/GCP regions. Use Geo-DNS to route users to the closest server, syncing cross-region via Redis Enterprise.
- **SFU Architecture:** If the platform expands to panel interviews (e.g., 2 interviewers, 1 candidate), migrate from P2P WebRTC to an SFU (like LiveKit or Mediasoup) to reduce client-side CPU/bandwidth load.