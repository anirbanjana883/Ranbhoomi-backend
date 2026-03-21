# 🏗️ System Architecture & Deployment Strategy

## The Design: Decoupled Microservices

Ranbhoomi was originally architected as a highly scalable, decoupled microservice system to handle intensive asynchronous workloads (like live competitive programming contests). The ideal production environment consists of:

1. **Express API Server:** Handles standard REST traffic and Socket.io connections.
2. **BullMQ Worker Nodes:** Isolated processes for handling Judge0 dispatches and asynchronous polling.
3. **Cron Scheduler:** A standalone process running the HackerNews-style gravity decay algorithm to rank the community feed.

---

## The Challenge: Free-Tier Infrastructure Limits

To deploy this project with zero infrastructure cost, I utilized Render (Free Tier) and Upstash (Serverless Redis). However, this introduced strict constraints:

- **Render limits:** 1 Free Web Service, 512MB RAM ceiling, spins down after 15 mins of inactivity.
- **Upstash limits:** 10,000 Redis commands per day.
- **The Problem:** Running the API, Workers, and Cron jobs as separate Node.js processes requires spinning up multiple V8 Javascript engines. This instantly exceeds the 512MB RAM limit (causing an OOM crash) and aggressively polls Redis, exhausting the 10k daily quota in hours.

---

## The Solution: The "Majestic Monolith"

To survive the free tier without rewriting the application logic, I implemented the **Majestic Monolith Pattern**.

In production, the application is bootstrapped via `prod-server.js`. This single entry point mounts the Express API, binds the WebSockets, initializes the BullMQ workers, and starts the Cron jobs all within a single Node.js event loop.

### Key Free-Tier Optimizations

- **Shared Memory Pool:** By running in one process, all subsystems share a single V8 memory heap, keeping RAM usage safely below 400MB.
- **Shared Connection Pooling:** A single MongoDB connection pool is multiplexed across the API, workers, and scheduled jobs, preventing connection limits.
- **BullMQ Polling Throttling:** BullMQ is notoriously aggressive with Redis polling. To protect the Upstash 10k daily limit, worker polling aggression was severely throttled:

```javascript
{
    concurrency: 10,
    stalledInterval: 60000, // Reduced from 30s to 60s
    lockDuration: 60000,    // Reduced lock renewal frequency
    metrics: null           // Disabled metric tracking overhead
}
```

- **Memory Ceiling Enforcement:** The Node.js Garbage Collector is forced to run aggressively by modifying the start script: `node --max-old-space-size=400 prod-server.js`.

---

## Future Scalability

Because the codebase remains structurally decoupled (`/workers`, `/jobs`, `/controllers`), transitioning this monolith back into a true distributed microservice architecture on AWS ECS or Kubernetes requires zero code changes. It only requires updating the Dockerfiles/deployment scripts to boot the modules independently.


# ⚠️ Notice: Live Deployment & Free Tier Limitations

This platform is currently deployed on Render's Free Tier with an Upstash Serverless Redis backend.

- ⏳ **Cold Starts:** Render spins down free web services after 15 minutes of inactivity. Please allow 50–60 seconds for the initial page load if the server is waking up from sleep. Subsequent requests will be lightning fast.
- 🏗️ **Architecture Adaptation:** To survive strict free-tier limits (512MB RAM ceiling and 10k daily Redis commands), the natively decoupled Microservice architecture (API, BullMQ Workers, Cron Schedulers) has been temporarily consolidated to run as a single process.