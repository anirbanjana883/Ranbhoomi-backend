# Backend System Documentation: Contest Management & Lifecycle System

## 1. System Overview
The Contest Management System is the administrative and lifecycle orchestration core of Ranbhoomi's competitive arena. It governs how coding tournaments are created, secured, discovered, and joined.

In a production platform, contest management is not just standard CRUD operations; it requires strict timeline enforcement, problem leak prevention, and rigid access control arrays. This module natively supports tiered architectures: Official Tournaments (curated by Admins using unpublished problems) and Private Arenas (hosted by Premium users using invite codes).

## 2. Functional Requirements
- **Tiered Contest Creation**: Admins can create global official contests. Premium users can create isolated, private contests with auto-generated secure invite codes.
- **Problem Leak Protection**: Strict guards ensure that only `isPublished: false` and non-deleted problems can be added to official contests, preventing users from practicing the exact problems beforehand.
- **Lifecycle Categorization**: Automatically classify contests as "Upcoming," "Live," or "Past" based on server-side chronological evaluation against `startTime` and `endTime`.
- **Secure Registration**: Handle massive concurrent registration spikes with $O(1)$ deduplication, enforcing invite-code validation for private arenas.
- **Transactional State Mutation**: Ensure that cascading deletions (e.g., deleting a contest removes all its registrations and submissions) maintain strict database integrity.

## 3. Non-Functional Requirements
- **Performance**: The `/api/contests` public feed must resolve rapidly as it is the most frequently polled endpoint by the frontend.
- **Reliability (ACID)**: Deleting or modifying a contest mid-flight or post-flight must guarantee no orphaned submission records.
- **Data Safety**: Avoid unbound arrays (like embedding thousands of `userId`s inside a single contest document) to prevent breaking MongoDB's 16MB BSON limit.

## 4. Data Model Design
### Database Schema (MongoDB)
- **Contest**: Stores core metadata (title, slug, timeBounds, visibility, inviteCode). Problem lists are embedded as arrays of references `[{ problem: ObjectId }]` since contest problem counts are strictly bounded (usually < 10).
- **ContestRegistration**: A junction collection bridging `User` and `Contest`.
  - **Reasoning**: Instead of storing `registeredUsers: [ObjectId]` in the Contest document (which scales poorly and hits the 16MB limit during massive contests), a separate indexed collection allows infinite horizontal scaling for registrations.
- **ContestRanking**: Materialized view storing the final leaderboard state post-contest.

### Indexing Strategy
- **Unique Compound Index**: `{ user: 1, contest: 1 }` on `ContestRegistration` acts as a database-level lock against double-registrations.
- **Unique Slugs**: `{ slug: 1 }` on `Contest` for fast SEO-friendly routing.

## 5. API Design
| Endpoint | Method | Description | Auth Level |
|----------|--------|-------------|------------|
| `/api/contests/` | GET | Fetches all contests grouped by Upcoming, Live, and Past. | Public |
| `/api/contests/:slug/ranking` | GET | Fetches live or cached finalized leaderboard. | Public |
| `/api/contests/:slug` | GET | Fetches contest details and checks user registration status. | User |
| `/api/contests/:slug/register` | POST | Enrolls user in a contest (verifies invite code if private). | User |
| `/api/contests/private` | POST | Creates a Private Arena with a generated invite code. | Premium |
| `/api/contests/private/:slug` | PUT | Edits a Private Arena (locked once started). | Premium (Owner) |
| `/api/contests/` | POST | Creates an Official global contest. | Admin |
| `/api/contests/:slug` | PUT / DELETE | Modifies or completely purges a contest & its data. | Admin |

## 6. System Flow
### The Secure Registration Flow
```
[CLIENT] -> POST /api/contests/:slug/register { inviteCode? }
   │
   ▼
[API SERVER] -> Verify JWT & Extract `userId`
   │
   ├─► (1) Fetch Contest `startTime`, `visibility`, `inviteCode`
   ├─► (2) Chronological Check: 
   │         if (now >= startTime) -> Reject (400 "Registration Closed")
   │
   ├─► (3) Visibility Check:
   │         if (visibility === 'PRIVATE')
   │             if (providedCode !== inviteCode) -> Reject (403 "Invalid Code")
   │
   ▼
[MONGODB OPERATION]
   ├─► Attempt `ContestRegistration.create({ user, contest })`
   │
   ├─► SUCCESS: Return 200 OK -> UI Shows "Registered"
   │
   └─► ERROR (Code 11000 - Duplicate Key): 
             Graceful Catch -> Return 400 "Already Registered"
```
## 7. Performance Optimization
- **Finalized Leaderboard Caching**: Once a contest ends and rankings are calculated, the `getRanking` controller writes the massive populated JSON to a long-lived Redis cache (`leaderboard:{slug}:final`). This drops database read loads for past contests to near zero.
- **Payload Truncation**: During the `getContestDetails` read operation, sensitive and massive fields (like `registeredUsers` or `inviteCode` for non-owners) are explicitly deleted using `delete contestObject.registeredUsers` before sending the response over the wire.

## 8. Fault Tolerance
- **MongoDB Transactions**: Operations like `deleteContest` and `updateContest` are wrapped in `mongoose.startSession()`. If purging a contest succeeds, but deleting the associated submissions fails due to a network error, the entire transaction aborts. This prevents "zombie" submissions from polluting the database.
- **Idempotent Error Handling**: The registration controller catches MongoDB 11000 (Duplicate Key) errors gracefully, turning a fatal database crash into a polite client-facing 400 Bad Request.

## 9. Consistency Model
- **Strong Consistency**: Contest creation, problem validation, and contest registration demand absolute strong consistency. The user must know immediately if they secured a spot or if the invite code was valid.
- **ACID Compliance**: Enforced via MongoDB Replica Set transactions for cascading updates/deletes.

## 10. Security Considerations
- **The "Unpublished" Guard**: `createContest` strictly queries `Problem.find({ isPublished: false })`. If an admin accidentally attempts to add a public practice problem to a tournament, the backend rejects the entire payload, protecting the tournament's integrity.
- **Time-Locked Mutability**: Premium users can update their private contests via `updatePrivateContest`, but the API explicitly checks `if (now >= contest.startTime) throw ApiError`. Once an arena goes live, its parameters are locked in stone to prevent mid-contest rule shifting.
- **Authorization Scoping**: Routes are heavily segregated via middleware (`isAuth`, `isPremium`, `isAdmin`). A standard user cannot even hit the controller logic for premium endpoint paths.

## 11. Trade-offs
- **Registration Junction Collection vs. Embedded Array**:
  - **Decision**: Used `ContestRegistration` collection instead of `contest.participants.push(userId)`.
  - **Reasoning**: While embedding is faster for small arrays, a massive global tournament might attract 50,000+ users. An embedded array would exceed MongoDB's memory limits and cause massive document lock contention during the registration spike. The junction table handles concurrent writes infinitely better.

## 12. Future Improvements
- **ElasticSearch Integration**: As the platform grows, offloading the `getAllContests` query to ElasticSearch will allow for complex, lightning-fast text searching, tag filtering, and localized timezone queries without hitting the primary MongoDB instance.
- **Calendar Webhooks**: Integrate automatic .ics calendar generation and Google Calendar API webhooks upon successful user registration.