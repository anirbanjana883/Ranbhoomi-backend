# 🏹 Ranbhoomi — Scalable Competitive Programming & Interview Platform (Backend)

Ranbhoomi is a **production-grade backend** for a competitive-programming and technical-interview platform in the spirit of LeetCode / HackerRank — built to survive real traffic spikes (contest stampedes, viral discussion threads, thousands of simultaneous leaderboard reads) without falling over.

The system leans hard into **asynchronous, event-driven architecture**: code execution is decoupled from the API tier via BullMQ + Redis, hot data paths (problems, leaderboards, roadmaps) are cached and request-coalesced to survive thundering-herd traffic, and every write-heavy surface (voting, progress tracking, payments) is built around atomic MongoDB operators instead of full-document reads and re-saves.

Every module below was designed independently with its own performance budget, consistency model, and failure-mode analysis — documented in full under [`/docs`](./docs).

---

## 🧭 What's in this repo

| Area | Highlights |
|---|---|
| **Judged code execution** | Dual-path (ephemeral WebSocket "Run" vs. persistent BullMQ "Submit"), Judge0-backed, with circuit breakers, dead-letter queues, and SHA-256 submission-result caching |
| **Contests** | Tiered (Official / Private-invite) lifecycle management, Redis ZSET live leaderboards with request-coalesced reads, OCC-safe finalization |
| **Content curation** | Flat-dictionary (adjacency-list) roadmap CMS, normalized problem/test-case storage, cache-stampede-proof problem reads |
| **Community** | Materialized-path nested comments, gravity-ranked hot feed, weighted full-text search |
| **Remote interviews** | WebRTC signaling + Socket.IO code sync + sandboxed RCE, all in one collaborative room |
| **Payments** | Razorpay dual-layer (client ack + webhook source-of-truth) with ACID-transactional provisioning |
| **Progress tracking** | Atomic, race-condition-safe solve/bookmark/note toggles at sub-50ms latency |

---

## 🏗️ High-Level Architecture

```
Client (Web)
│
├── REST + WebSockets
▼
Express API Gateway
│
├── Modules
│   ├── Auth & RBAC
│   ├── Feature Gating
│   └── Problem / Contest / Community APIs
│
├── Data & State
│   ├── MongoDB
│   └── Redis
│       ├── Rate Limiting
│       ├── Caching
│       └── BullMQ Queues ──> Worker Processes ──> Judge0 Code Execution
│
└── Monitoring
    └── Prometheus Metrics
```

In production, this decoupled design is bootstrapped as a **"Majestic Monolith"** (API + workers + cron in one process) to run cost-free on Render/Upstash's tiers — see [Deployment Architecture](./docs/deployment-architecture.md) for why and how.

---

## 📚 Documentation Index

Each module has a full design doc under `/docs` covering functional & non-functional requirements, data model, API design, system flow, performance optimizations, fault tolerance, consistency model, security, trade-offs, and future improvements.

| # | Module | Docs | Summary |
|---|---|---|---|
| 1 | **Problem Management** | [View Doc →](./docs/Problem%20Management%20Module.md) | Core content-delivery engine for coding problems: cache-stampede-proof reads, transactional test-case writes, premium/AC-gated solutions. |
| 2 | **Auto-Compiler & Code Generation** | [View Doc →](./docs/Auto-Compiler%20%26%20Code%20Generation%20Engine.md) | DSL compiler that generates starter code and hidden driver code (C++/Java/Python) from a problem's function signature. |
| 3 | **Distributed Code Execution & Evaluation** | [View Doc →](./docs/Distributed%20Code%20Execution%20%26%20Evaluation%20Engine.md) | Judge0-backed, BullMQ-driven execution engine — the shared foundation for Run/Submit across the platform. |
| 4 | **Contest Management & Lifecycle** | [View Doc →](./docs/Contest%20Management%20%26%20Lifecycle%20System.md) | Official & private contest creation, secure registration, problem-leak prevention, ACID cascade deletes. |
| 5 | **Contest Code Execution & Run Engine** | [View Doc →](./docs/Contest%20Code%20Execution%20%26%20Run%20Engine.md) | Contest-specific fast-path/formal-path execution with dedicated queues, code-hash caching, and load shedding. |
| 6 | **Contest Ranking & Leaderboard** | [View Doc →](./docs/Contest%20Ranking%20%26%20Leaderboard%20System.md) | Redis ZSET/Hash-powered live rankings with Promise-memoized request coalescing to survive 100k+ concurrent reads. |
| 7 | **Admin Roadmap Management (CMS)** | [View Doc →](./docs/Admin%20Roadmap%20Management%20System.md) | Internal tool for building/editing curriculum trees (Roadmap → Topic → SubTopic → Question) via flat-dictionary atomic updates. |
| 8 | **Roadmap & User Progress Tracking** | [View Doc →](./docs/Roadmap%20%26%20User%20Progress%20Tracking%20Module.md) | User-facing solve/bookmark/note tracking with race-condition-safe, negative-counter-proof atomic updates. |
| 9 | **Community & Discussion Forum** | [View Doc →](./docs/Community%20%26%20Discussion%20Forum%20Engine.md) | Materialized-path nested comments, gravity-ranked hot feed, idempotent voting, weighted search. |
| 10 | **Remote Interview Engine** | [View Doc →](./docs/Remote%20Interview%20Engine.md) | Real-time collaborative interview rooms: WebRTC signaling, synced code editor, whiteboard, sandboxed RCE. |
| 11 | **Payment & Subscription Engine** | [View Doc →](./docs/Payment%20%26%20Subscription%20Engine.md) | Razorpay integration with dual-layer verification (client ack + webhook source-of-truth) and ACID-transactional provisioning. |
| 12 | **Deployment Architecture & Free-Tier Strategy** | [View Doc →](./docs/System%20Architecture%20%26%20Deployment%20Strategy.md) | Why the decoupled microservice design ships as a "Majestic Monolith" on Render/Upstash, and how to split it back out later. |

> 📁 Links assume the README lives at the repo root and the docs sit directly in `backend/docs/` — if your README is inside `backend/`, drop the `backend/` segment from each path (already done above); if it's one level higher, prefix each link with `backend/`.

---

## 🚀 Key Features

**🔐 Auth & Authorization** — Email/password + Google OAuth, JWT in HTTP-only cookies, RBAC (`user` / `admin` / `master`), OTP-based password reset.

**🧠 Problem Solving Engine** — Multi-language execution, starter/driver code generation, sample vs. hidden test cases, async execution via Judge0 + BullMQ + Redis.

**🏆 Contest System** — Public & private contests, live incremental leaderboards, post-contest finalization and auto-publishing.

**🎙️ Remote Interviews** — WebRTC sessions, Socket.IO signaling-only, shared collaborative editor, synced language/tabs.

**🤖 AI Assistance** — Gemini-powered help with daily quotas and subscription-aware gating.

**💳 Payments & Subscriptions** — Razorpay integration, Free / Warrior / Gladiator tiers, expiry-enforced access.

**📊 Observability** — Prometheus metrics, latency and throughput tracking.

---

## 🧠 Architectural Philosophy

- Async over sync for heavy workloads
- Stateless APIs for horizontal scaling
- Strong consistency where correctness demands it (payments, votes, registrations)
- Eventual consistency where it buys performance (leaderboards, hot feeds, caches)
- Backend-enforced security at every boundary
- Observability as a first-class concern, not an afterthought

---

## 🗂️ Project Structure

```
backend/
├── config/           # Environment, DB, Redis, OAuth configs
├── controller/       # Route controllers (thin layer)
├── middleware/       # Auth, RBAC, rate limiting, validation
├── models/           # Mongoose schemas
├── route/            # API route definitions
├── services/         # Business logic layer
├── workers/          # BullMQ async workers
├── docs/             # Full module design docs (see index above)
├── index.js          # Application entry point
├── prod-server.js    # Production "Majestic Monolith" bootstrap
├── Dockerfile
├── docker-compose.yml
└── prometheus.yml
```

---

## 🔗 API Endpoints (High-Level)

### 🔐 Auth (`/api/auth`)
| Method | Endpoint | Description |
|---|---|---|
| POST | `/signup` | Register user |
| POST | `/login` | Login |
| GET | `/logout` | Logout |
| POST | `/sendotp` | Send password reset OTP |
| POST | `/verifyotp` | Verify OTP |
| POST | `/resetpassword` | Reset password |
| POST | `/googleauth` | Google OAuth |

### 👤 Users (`/api/user`)
| Method | Endpoint | Description |
|---|---|---|
| GET | `/getcurrentuser` | Current logged-in user |
| GET | `/profile` | Own profile |
| GET | `/profile/:username` | Public profile |
| PUT | `/updateprofile` | Update profile |
| GET | `/solved` | Solved problems |

### 🧠 Problems (`/api/problems`)
| Method | Endpoint | Description |
|---|---|---|
| GET | `/` | Get all problems |
| GET | `/getoneproblem/:slug` | Problem details |
| GET | `/getoneproblem/:slug/solution` | Solution (auth) |
| POST | `/createproblem` | Create problem (admin) |
| PUT | `/updateproblem/:slug` | Update problem (admin) |
| DELETE | `/deleteproblem/:slug` | Delete problem (admin) |

### 🧪 Submissions (`/api/submissions`)
| Method | Endpoint | Description |
|---|---|---|
| POST | `/` | Submit solution |
| GET | `/problem/:slug` | User submissions |
| GET | `/status/:submissionId` | Submission status |

### 🏆 Contests (`/api/contests`)
| Method | Endpoint | Description |
|---|---|---|
| GET | `/` | All contests |
| POST | `/` | Create contest (admin) |
| POST | `/private` | Create private contest |
| GET | `/:slug` | Contest details |
| POST | `/:slug/register` | Register |
| GET | `/:slug/ranking` | Leaderboard |

### 🧮 Contest Submissions (`/api/contest-submissions`)
| Method | Endpoint | Description |
|---|---|---|
| POST | `/` | Submit in contest |
| GET | `/status/:submissionId` | Status |
| GET | `/problem/:slug` | Problem submissions |

### 🎙️ Interviews (`/api/interview`)
| Method | Endpoint | Description |
|---|---|---|
| POST | `/create` | Create session |
| GET | `/session/:roomID` | Get session |

### 🤖 AI (`/api/ai`)
| Method | Endpoint | Description |
|---|---|---|
| POST | `/ask` | AI help (quota enforced) |

### 💳 Payments (`/api/payment`)
| Method | Endpoint | Description |
|---|---|---|
| POST | `/create-order` | Create Razorpay order |
| POST | `/verify-payment` | Verify payment |

### 🧵 Community (`/api/community`)
| Method | Endpoint | Description |
|---|---|---|
| GET | `/feed` | Posts |
| POST | `/create` | Create post |
| POST | `/:postId/reply` | Reply |

---

## ⚙️ Setup Instructions (Local)

### 1️⃣ Prerequisites
- Node.js ≥ 18
- Docker & Docker Compose
- MongoDB Atlas (or local MongoDB)
- Redis

### 2️⃣ Environment Variables (`.env`)

```env
PORT=5000
MONGODB_URL=your_MONGODB_URL
JWT_SECRET=your_JWT_SECRET
USER_EMAIL=your_USER_EMAIL
USER_PASSWORD=your_USER_PASSWORD
CLOUDINARY_NAME=your_CLOUDINARY_NAME
CLOUDINARY_API_KEY=your_CLOUDINARY_API_KEY
CLOUDINARY_API_SECRET=your_CLOUDINARY_API_SECRET
MASTER_EMAIL=your_MASTER_EMAIL
MASTER_PASSWORD=your_MASTER_PASSWORD
JUDGE0_API_KEY=your_JUDGE0_API_KEY
JUDGE0_API_HOST=judge0-ce.p.rapidapi.com
GEMINI_API_KEY=your_GEMINI_API_KEY
RAZORPAY_KEY_ID=your_RAZORPAY_KEY_ID
RAZORPAY_KEY_SECRET=your_RAZORPAY_KEY_SECRET
REDIS_URL=your_REDIS_URL
```

### 3️⃣ Install Dependencies
```bash
npm install
```

### 4️⃣ Run with Docker (Recommended)
```bash
docker-compose up --build
```

### 5️⃣ Create Master Admin (One-Time)
```bash
node createMaster.js
```

### 6️⃣ Metrics
Prometheus scrape endpoint: `GET /metrics`

---

## ⚠️ Live Deployment Notes

This platform runs on Render's Free Tier with an Upstash Serverless Redis backend, so a couple of quirks apply:

- ⏳ **Cold starts** — Render spins down free web services after 15 minutes of inactivity. Allow 50–60 seconds for the first request to wake the server; everything after that is fast.
- 🏗️ **Consolidated architecture** — To fit the 512MB RAM ceiling and 10k-command/day Redis quota, the natively decoupled microservices (API, BullMQ workers, cron schedulers) currently run as a single "Majestic Monolith" process. Full rationale in [`docs/deployment-architecture.md`](./docs/deployment-architecture.md).

---

## 🔒 Security Notes
- JWT stored in HTTP-only cookies
- Strict RBAC enforcement across all admin/master routes
- Redis-backed rate limiting on hot write paths
- No business logic executed over raw WebSocket events — signaling and sync only

---

## 📈 Scalability & Design Talking Points
- Stateless APIs → horizontal scaling
- Async workers → workload isolation from the API tier
- Redis → caching, queues, rate limiting, and leaderboard state
- MongoDB indexing (ESR rule, compound & unique indexes) → predictable query performance
- Eventual consistency deliberately chosen where it buys throughput (hot feeds, leaderboards, caches), strong consistency enforced where correctness can't bend (payments, votes, registrations)

---

## 🧠 What This Project Demonstrates
✅ System design at production scale
✅ Asynchronous & distributed systems
✅ Real-time collaboration (WebRTC + Socket.IO)
✅ Secure backend architecture
✅ Observability-first engineering mindset

---

## 📌 Final Note
This backend is built as if it were serving real users at scale — every architectural decision in `/docs` reflects a real production trade-off, not a toy-project shortcut.