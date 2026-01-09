# 🏹 Ranbhoomi – Scalable Competitive Programming & Interview Platform (Backend)

Ranbhoomi is a **production-grade, scalable backend system** for a competitive programming and interview-preparation platform.  


This backend is emphasizing:
- Scalability
- Correctness
- Security
- Observability
- Real-world architectural trade-offs  


---

## 🚀 Key Features

### 🔐 Authentication & Authorization
- Email/password authentication
- Google OAuth login
- JWT-based authentication with **HTTP-only cookies**
- Role-Based Access Control (RBAC): `user`, `admin`, `master`
- Secure admin-promotion approval workflow
- OTP-based password reset

---

### 🧠 Problem Solving Engine
- Multi-language code execution
- Starter code + driver code per language
- Sample vs hidden test cases
- Asynchronous execution using **Judge0**
- Non-blocking architecture using **BullMQ + Redis**

---

### 🏆 Contest System
- Public contests (admin-created)
- Private contests (premium users)
- Live leaderboard with incremental updates
- Final leaderboard computation post-contest
- Automatic post-contest problem publishing

---

### 🎙️ Real-Time Interview System
- WebRTC-based interview sessions
- Socket.IO used **only for signaling**
- Shared collaborative code editor
- Language & tab synchronization

---

### 🤖 AI Assistance
- Gemini-powered AI help
- Daily usage quotas
- Subscription-aware feature gating

---

### 💳 Payments & Subscriptions
- Razorpay integration
- Subscription plans:
  - Free
  - Warrior
  - Gladiator
- Expiry-based access enforcement

---

### 📊 Observability
- Prometheus metrics
- Request latency tracking
- Throughput monitoring

---

## 🧠 Architectural Philosophy
- **Async over sync** for heavy workloads
- **Stateless APIs** for horizontal scaling
- **Strong consistency** where required
- **Eventual consistency** where optimal
- Backend-enforced security
- Observability as a first-class concern

---

## 🏗️ High-Level Architecture

Client (Web)
|
| REST + WebSockets
v
Express API Gateway
|
├── Auth & RBAC
├── Feature Gating
├── Problem / Contest / Community APIs
|
├── Redis
| ├── Rate Limiting
| ├── Caching
| └── BullMQ Queues
|
├── Worker Processes
| └── Judge0 Code Execution
|
├── MongoDB
|
└── Prometheus Metrics

yaml
Copy code

---

## 🗂️ Project Structure

backend/
├── config/ # Environment, DB, Redis, OAuth configs
├── controller/ # Route controllers (thin layer)
├── middleware/ # Auth, RBAC, rate limiting, validation
├── models/ # Mongoose schemas
├── route/ # API route definitions
├── services/ # Business logic layer
├── workers/ # BullMQ async workers
├── index.js # Application entry point
├── Dockerfile
├── docker-compose.yml
└── prometheus.yml

yaml
Copy code

---

## 🔗 API Endpoints (High-Level)

### 🔐 Auth (`/api/auth`)
| Method | Endpoint | Description |
|------|---------|-------------|
| POST | `/signup` | Register user |
| POST | `/login` | Login |
| GET | `/logout` | Logout |
| POST | `/sendotp` | Send password reset OTP |
| POST | `/verifyotp` | Verify OTP |
| POST | `/resetpassword` | Reset password |
| POST | `/googleauth` | Google OAuth |

---

### 👤 Users (`/api/user`)
| Method | Endpoint | Description |
|------|---------|-------------|
| GET | `/getcurrentuser` | Current logged-in user |
| GET | `/profile` | Own profile |
| GET | `/profile/:username` | Public profile |
| PUT | `/updateprofile` | Update profile |
| GET | `/solved` | Solved problems |

---

### 🧠 Problems (`/api/problems`)
| Method | Endpoint | Description |
|------|---------|-------------|
| GET | `/` | Get all problems |
| GET | `/getoneproblem/:slug` | Problem details |
| GET | `/getoneproblem/:slug/solution` | Solution (auth) |
| POST | `/createproblem` | Create problem (admin) |
| PUT | `/updateproblem/:slug` | Update problem (admin) |
| DELETE | `/deleteproblem/:slug` | Delete problem (admin) |

---

### 🧪 Submissions (`/api/submissions`)
| Method | Endpoint | Description |
|------|---------|-------------|
| POST | `/` | Submit solution |
| GET | `/problem/:slug` | User submissions |
| GET | `/status/:submissionId` | Submission status |

---

### 🏆 Contests (`/api/contests`)
| Method | Endpoint | Description |
|------|---------|-------------|
| GET | `/` | All contests |
| POST | `/` | Create contest (admin) |
| POST | `/private` | Create private contest |
| GET | `/:slug` | Contest details |
| POST | `/:slug/register` | Register |
| GET | `/:slug/ranking` | Leaderboard |

---

### 🧮 Contest Submissions (`/api/contest-submissions`)
| Method | Endpoint | Description |
|------|---------|-------------|
| POST | `/` | Submit in contest |
| GET | `/status/:submissionId` | Status |
| GET | `/problem/:slug` | Problem submissions |

---

### 🎙️ Interviews (`/api/interview`)
| Method | Endpoint | Description |
|------|---------|-------------|
| POST | `/create` | Create session |
| GET | `/session/:roomID` | Get session |

---

### 🤖 AI (`/api/ai`)
| Method | Endpoint | Description |
|------|---------|-------------|
| POST | `/ask` | AI help (quota enforced) |

---

### 💳 Payments (`/api/payment`)
| Method | Endpoint | Description |
|------|---------|-------------|
| POST | `/create-order` | Create Razorpay order |
| POST | `/verify-payment` | Verify payment |

---

### 🧵 Community (`/api/community`)
| Method | Endpoint | Description |
|------|---------|-------------|
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

---

### 2️⃣ Environment Variables (`.env`)
PORT=5000
MONGODB_URL=your_mongodb_url
JWT_SECRET=your_jwt_secret

CLIENT_URL=http://localhost:5173

REDIS_URL=redis://localhost:6379

JUDGE0_API_KEY=your_judge0_key
JUDGE0_API_HOST=judge0-ce.p.rapidapi.com

GEMINI_API_KEY=your_gemini_key

RAZORPAY_KEY_ID=your_key
RAZORPAY_KEY_SECRET=your_secret

MASTER_EMAIL=admin@email.com
MASTER_PASSWORD=strongpassword

yaml
Copy code

---

### 3️⃣ Install Dependencies
npm install

yaml
Copy code

---

### 4️⃣ Run with Docker (Recommended)
docker-compose up --build

yaml
Copy code

---

### 5️⃣ Create Master Admin (One-Time)
node createMaster.js

yaml
Copy code

---

### 6️⃣ Metrics
Prometheus scrape endpoint:
GET /metrics

yaml
Copy code

---

## 🔒 Security Notes
- JWT stored in **HTTP-only cookies**
- Strict RBAC enforcement
- Redis-backed rate limiting
- No business logic over WebSockets

---

## 📈 Scalability & Interview Talking Points
- Stateless APIs → horizontal scaling
- Async workers → workload isolation
- Redis → caching, queues, rate limits
- MongoDB indexing → performance
- Eventual consistency where optimal

---

## 🧠 What This Project Demonstrates
✅ System design  
✅ Async & distributed systems  
✅ Real-time collaboration  
✅ Secure backend architecture  
✅ Observability-first mindset  

---

## 📌 Final Note
This backend is built **as if it were serving real users at scale**.  
Every architectural decision reflects **real-world production trade-offs** — exactly what **FAANG int