# Backend System Documentation: Admin Roadmap Management System

## 1. System Overview

The Admin Roadmap Management System is the internal content management engine that powers the Curriculum Matrix of the Ranbhoomi platform. It allows platform administrators and content creators to dynamically build, modify, and restructure complex learning paths (e.g., "RANBHOOMI 75", "RANBHOOMI DSA SHEET") without requiring manual database intervention.

In a scalable competitive programming platform, curriculum structures are highly volatile during the curation phase. This module is designed to handle deep tree-like data structures (Roadmaps → Topics → SubTopics → Questions) while avoiding the severe performance penalties and memory spikes typically associated with updating massive nested JSON documents in document-oriented databases like MongoDB.

---

## 2. Functional Requirements

- **Curriculum Initialization:** Administrators can initialize new, isolated learning roadmaps.
- **Hierarchical Node Insertion:** Ability to append Topics to a Roadmap, SubTopics to Topics, and Questions to SubTopics.
- **Node Mutation:** Admins can safely update text, external URLs, and difficulty tags of any specific node in the tree.
- **Cascading Deletion:** Deleting a parent node (e.g., a Topic) automatically and safely purges all child SubTopics and Questions from the database.
- **Data Integrity Enforcement:** The system strictly enforces structural rules (e.g., a Question cannot be added without a valid parent SubTopic).

---

## 3. Non-Functional Requirements

- **Data Integrity:** Strict input validation and sanitization to prevent NoSQL object injection.
- **Memory Efficiency:** Administrative operations must not saturate Node.js RAM, strictly capping the memory footprint even when parsing 100KB+ roadmap documents.
- **Database Performance:** Updates and deletions must execute in $O(1)$ database trips using atomic operators, rather than replacing the entire document.
- **Security:** Complete isolation of CMS capabilities to authorized personnel only.
- **Concurrency:** Prevent race conditions if multiple administrators edit the same roadmap simultaneously.

---

## 4. Data Model Design

We utilize a **Flat Dictionary (Adjacency-List-like) Model** embedded within a single MongoDB document, rather than traditional deeply nested arrays.

### Database Schema: `RoadmapTemplate`

```json
{
  "roadmapId": "blind-75",
  "sheet": { "topicOrder": ["topic-123", "topic-456"] },
  "topics": {
    "topic-123": { "title": "Arrays", "subTopicOrder": ["sub-789"] }
  },
  "subTopics": {
    "sub-789": { "title": "Two Pointers", "questionOrder": ["ques-abc"] }
  },
  "questions": {
    "ques-abc": { "title": "Two Sum", "link": "https...", "difficulty": "Easy" }
  }
}
```

### Reason Behind Schema Design

If we used deeply nested arrays (`topics[0].subTopics[2].questions[5]`), updating or deleting a specific question requires complex, slow `$[]` positional operators. By flattening the entities into hash maps (`topics`, `subTopics`, `questions`) and maintaining order via string arrays (`questionOrder`), we achieve $O(1)$ direct access to any node.

### Indexing Strategy

- `{ roadmapId: 1 }` (Unique) — Guarantees $O(1)$ retrieval of the curriculum and enforces global uniqueness for roadmap slugs.

---

## 5. API Design

All endpoints are mounted under `/api/v1/admin/roadmap` and protected by `isAuth` and `isAdmin` middlewares.

| Method | Endpoint | Description | Request Body |
|---|---|---|---|
| POST | `/` | Initializes a new empty roadmap. | `{ roadmapId, title }` |
| POST | `/:roadmapId/items` | Adds a Topic, SubTopic, or Question. | `{ type, title, parentId, link, difficulty }` |
| PATCH | `/:roadmapId/items/:itemId` | Edits an existing node's properties. | `{ type, title, link, difficulty }` |
| DELETE | `/:roadmapId/items/:itemId` | Performs an atomic cascade delete. | `{ type, parentId }` |

---

## 6. System Flow

### Cascading Delete Flow (Deleting a Topic)

```
[Admin Client]
   │ 1. DELETE /api/admin/roadmap/blind-75/items/topic-123
   ▼
[Express Router]
   │ 2. Authenticate JWT -> Verify Admin Role (RBAC)
   ▼
[Admin Controller]
   │ 3. Validate `type` against Whitelist ["topic", "subTopic", "question"]
   │ 4. Fetch roadmap structure via Projection (.select('sheet topics subTopics'))
   │ 5. Traverse tree in-memory: Find Topic -> Find child SubTopics -> Find child Questions
   │ 6. Construct massive $unset and $pull commands for all identified IDs
   ▼
[MongoDB Engine]
   │ 7. updateOne({ roadmapId }, { $unset: {...}, $pull: {...} })
   │ 8. DB atomically removes the topic, 5 subtopics, and 50 questions in ONE operation
   ▼
[Response]
   │ 9. Return 200 OK
```

---

## 7. Performance Optimization

- **Atomic Batching (`$unset` + `$pull`):** When cascade-deleting a topic with 50 questions, instead of issuing 51 separate DB delete commands or using `.save()`, the system constructs a single `$unset` query targeting all 51 dictionary keys, executing in a single network round-trip.
- **Memory Projection (`.select()`):** During a cascade delete, the actual question payload (titles, links) is irrelevant; we only need the structural IDs. We use `.select('sheet topics subTopics')` to entirely omit the questions dictionary from the DB read, reducing the RAM footprint of the operation by >70%.
- **Existence Checks (`.exists()`):** When creating a new roadmap, we use `RoadmapTemplate.exists()` instead of `.findOne()`. This returns a boolean over the wire instead of loading a potentially massive BSON document into memory just to check for a collision.

---

## 8. Fault Tolerance

- **Strict Whitelisting (NoSQL Injection Prevention):** The `type` parameter is strictly checked against `["topic", "subTopic", "question"]`. If an attacker passes `type: "admin"`, it is rejected immediately. This prevents dynamic key injection (`` [`${type}s.${itemId}`] ``) from overwriting unintended database fields.
- **Malformatted Data Prevention:**
  - Difficulty is coerced to `"Medium"` if it doesn't match the strict `ALLOWED_DIFFICULTIES` array.
  - External links are validated using the native `URL` constructor to prevent XSS payloads (`javascript:alert(1)`).
- **Defensive Queries:** When adding a child node, the parent's existence is enforced directly in the database filter query (`filterQuery['topics.' + parentId] = { $exists: true }`). If the parent was deleted milliseconds prior by another admin, the insert safely fails.

---

## 9. Consistency Model

- **Strong Consistency:** Administrative actions strictly require strong consistency. If an admin deletes a question, it must immediately be purged from the database so that subsequent user requests do not fetch orphaned question IDs. We achieve this by interacting directly with the MongoDB Primary node and awaiting write acknowledgment.
- **Single-Document Transactions:** Because the entire curriculum is contained within a single document, operations like cascade deletes are inherently atomic and transactional at the document level. No multi-document transaction overhead is required.

---

## 10. Security Considerations

- **Authentication & Authorization:** Guarded by a two-tier middleware system. `isAuth` validates the JWT signature, and `isAdmin` verifies the user's role payload.
- **Data Sanitization:** All text inputs (`title`, `link`) are aggressively trimmed to prevent whitespace padding attacks and database bloat.
- **UUIDv4 Generation:** Node IDs are generated securely via cryptographic UUIDs on the backend, ensuring predictable, collision-resistant dictionary keys, rather than relying on sequential IDs which are vulnerable to enumeration.

---

## 11. Trade-offs

**Single Document Topology vs Relational Tables:**
- **Trade-off:** Editing a single item requires targeting dynamic keys within a large document rather than doing a simple `UPDATE table WHERE id=X`.
- **Benefit:** Fetching the roadmap for users is lightning fast ($O(1)$). Since the system is overwhelmingly Read-Heavy (Users viewing the roadmap) and rarely Write-Heavy (Admins occasionally editing it), optimizing for read speed at the cost of slightly more complex write logic is the correct architectural choice.

**Memory Projection vs Full Hydration:** We manually traverse the JSON tree in Node.js to figure out what to delete, rather than letting a SQL database handle `CASCADE ON DELETE`. This requires careful mapping but keeps the NoSQL schema highly denormalized and fast.

---

## 12. Future Improvements

1. **Redis Cache Invalidation & Pub/Sub Synchronization:** As the platform scales, the `RoadmapTemplate` will be cached in Redis (e.g., `GET roadmap:template:blind-75`) to serve millions of user reads without hitting MongoDB. The Admin CMS must integrate a Cache-Aside or Write-Through pattern. Whenever an admin adds, updates, or deletes an item, the CMS will publish an event to a Redis Pub/Sub channel or explicitly delete the cache key (`DEL roadmap:template:blind-75`). This ensures users instantly see the updated curriculum while maintaining a 99% cache hit rate.

2. **Audit Logging:** Implement an `AdminAuditLog` collection to track which administrator made specific changes to the roadmap (who deleted what, and when) for accountability and rollback capabilities.

3. **Drafting / Versioning System:** Introduce a `status` flag (`Draft` vs `Published`). Admins could work on a "V2" of a roadmap in isolation, and "Publish" it atomically by swapping the document payload. This prevents users from seeing half-finished curriculums during a live editing session.

4. **Optimistic Concurrency Control (OCC):** If two admins edit the exact same question simultaneously, implement a version counter (`__v`) check in the `filterQuery` to reject the second admin's request, preventing lost updates (e.g., Admin A changes the link, Admin B changes the difficulty, but Admin B's save overwrites Admin A's link).