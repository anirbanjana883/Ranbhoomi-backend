# Backend System Documentation: Payment & Subscription Engine

## 1. System Overview

The Ranbhoomi Payment & Subscription Engine is a highly secure financial transaction module designed to handle user upgrades and premium feature unlocking. It seamlessly integrates a dual-layer verification system combining fast client-side acknowledgments with server-to-server Webhooks (Razorpay) as the absolute source of truth.

In a scalable competitive programming platform, payment processing cannot rely on the client's network stability. If a user's browser crashes after paying but before the backend is notified (the "Drop-Off Problem"), the system must still automatically provision their access. This module guarantees financial ledger integrity using strict MongoDB ACID transactions.

---

## 2. Functional Requirements

- **Secure Order Provisioning:** Generates cryptographically secure payment intents (Orders) via the payment gateway before any UI popup is shown.
- **Pre-Enrollment Validation:** Rejects purchase attempts for subscriptions the user already actively owns, preventing accidental double-billing.
- **Webhook Source-of-Truth:** Processes asynchronous server-to-server confirmation from the payment gateway to finalize transactions, completely independent of the frontend state.
- **Fast Client Acknowledgment:** Provides immediate UI feedback upon payment gateway success to ensure a smooth user experience while the webhook processes in the background.
- **Automated Provisioning:** Upgrades user access tiers and calculates subscription expiry dates securely.

---

## 3. Non-Functional Requirements

- **Scalability:** The webhook endpoint must scale horizontally to handle concurrent gateway callbacks during promotional spikes.
- **Reliability (Idempotency):** The system must guarantee exactly-once processing. If the gateway fires the same success webhook 5 times due to network retries, the user is upgraded only once.
- **Availability:** 99.99% uptime for the `/webhook` endpoint to ensure no dropped financial confirmations.
- **Latency Constraints:** Order creation must return in < 200ms to ensure a frictionless checkout experience.
- **Concurrency:** Safely handle race conditions where a client-acknowledgment and a gateway webhook arrive at the exact same millisecond.

---

## 4. Data Model Design

### Database Schema (MongoDB)

We enforce a strict decoupling of the financial record from the user's state.

#### Collection: Transactions (The Ledger)
Stores the immutable financial history and current state of all payment intents.

| Field | Type | Notes |
|---|---|---|
| `userId` | ObjectId, Ref: User | Indexed |
| `orderId` | String | Indexed, Unique — The Razorpay Order ID |
| `paymentId` | String | The Razorpay Payment ID (populated post-capture) |
| `planType` | Enum: Pro, Elite | The purchased tier |
| `amount` | Number | Stored in the lowest denomination (e.g., paise) |
| `status` | Enum: Pending, Verifying, Success, Failed | |

#### Collection: Users (Target Upgrades)

| Field | Type |
|---|---|
| `subscriptionPlan` | String — The current active plan |
| `subscriptionExpiresAt` | Date — Calculated expiry timestamp |

### Indexing Strategy

MongoDB: Unique ascending index on `orderId` in the Transactions collection for O(1) constant-time lookups during webhook processing. Compound index on `{ userId: 1, status: 1 }` to quickly aggregate user billing history.

---

## 5. API Design

### REST Endpoints

| Endpoint | Method | Description | Request Body | Response | Status |
|---|---|---|---|---|---|
| `/api/payment/create-order` | POST | Initializes a secure payment intent. | `{ planType: "Pro" }` | `{ data: { orderId, amount, currency } }` | 200, 400, 401 |
| `/api/payment/verify-payment` | POST | Fast UI acknowledgment; marks status as Verifying. | `{ razorpay_order_id, razorpay_payment_id, signature }` | `{ message: "Acknowledged" }` | 200, 400, 404 |
| `/api/payment/webhook` | POST | Gateway callback for absolute confirmation. | Raw Buffer (HMAC validation) | `"Webhook processed"` | 200, 400, 500 |

---

## 6. System Flow

Below is the step-by-step request flow representing the Dual-Layer Authentication architecture.

```
[Client (Frontend)]              [Node.js API Server]              [Razorpay Gateway]
       |                                  |                                 |
       |------- POST /create-order ------>| (Pre-Enrollment Check)          |
       |                                  |------- Create Order API ------->|
       |                                  |<------ Order ID (rzp_123) ------|
       |                                  | (Save Txn: PENDING)             |
       |<------ 200 OK (Order ID) --------|                                 |
       |                                  |                                 |
       |======= User Pays via Popup ======|================================>|
       |                                  |                                 |
       |------- POST /verify-payment ---->| (Crypto Check)                  |
       |                                  | (Update Txn: VERIFYING)         |
       |<------ 200 OK (Fast UI Ack) -----|                                 |
       |                                  |                                 |
       |                                  |<------ Webhook (payment.auth) --|
       |                                  | (Verify HMAC SHA-256)           |
       |                                  |                                 |
       |                                  | [ START ACID TRANSACTION ]      |
       |                                  | 1. Check Idempotency            |
       |                                  | 2. Update User (Plan + Expiry)  |
       |                                  | 3. Update Txn (SUCCESS)         |
       |                                  | [ COMMIT ACID TRANSACTION ]     |
       |                                  |                                 |
       |                                  |------- 200 OK (Ack Webhook) --->|
```

---

## 7. Performance Optimization

- **Express Middleware Ordering:** The `/webhook` route utilizes `express.raw({ type: "application/json" })` and is strategically placed before the global `express.json()` middleware. This prevents payload mutation, ensuring O(1) string hashing operations for cryptographic signature verification.
- **Pre-Enrollment Fast-Fail:** The `/create-order` endpoint checks the user's current subscription expiry in MongoDB before calling the Razorpay API, saving ~300ms of external network latency if the user is already subscribed.

---

## 8. Fault Tolerance

- **Database Write Conflicts (ACID Transactions):** Upgrading the user and updating the transaction ledger are wrapped in a MongoDB Session (`session.startTransaction()`). If the server loses connection to the database halfway through the update, the entire block is rolled back to prevent a scenario where a user pays but is not granted access, or vice versa.
- **Idempotency (Duplicate Webhooks):** Payment gateways operate on an "at-least-once" delivery guarantee. If a network timeout causes Razorpay to send the same webhook thrice, the system queries the ledger `if (transaction.status === "Success")` and safely returns a `200 OK` instantly for the duplicates, preventing subscription stacking.
- **Gateway Retries:** If the Ranbhoomi API goes down, Razorpay implements an exponential backoff policy, retrying the webhook over 24 hours until our server recovers and acknowledges it.

---

## 9. Consistency Model

**Strong Consistency (Financial Ledger & Access):** Strict consistency is enforced during the webhook phase. A user is only upgraded if the transaction ledger is successfully marked as `Success` within the exact same atomic database transaction. This ensures financial data and user state never drift.

---

## 10. Security Considerations

- **Cryptographic Payload Integrity:** Webhooks are verified using HMAC SHA-256 signatures (`x-razorpay-signature`) against a secure offline secret. Any tampered payload or spoofed request is immediately rejected (Status 400).
- **Project Bouncing:** The webhook inspects `payment.notes.project`. If a payload belongs to another project sharing the same Razorpay account, the backend safely ignores it, preventing cross-project contamination.
- **Authorization:** `/create-order` and `/verify-payment` require a valid JWT via HTTP-only cookies. The `/webhook` endpoint is public but impenetrable without the cryptographic secret.
- **Rate Limiting:** The `/create-order` intent endpoint is strictly rate-limited per IP/User to prevent malicious actors from exhausting the platform's API quota with the payment gateway.

---

## 11. Trade-offs

**Webhook vs. Active Polling:** We opted for passive Webhooks over having the backend actively poll the gateway for order status. Trade-off: Webhooks require a publicly exposed endpoint, but they vastly reduce server CPU load, DB reads, and external API rate-limit exhaustion.

**Two-Step Acknowledgment vs. Webhook-Only:** The client makes a `/verify-payment` call before the webhook arrives. Trade-off: The UI might display "Success" a fraction of a second before the database is fully updated, but this provides a vastly superior UX (instant feedback) compared to forcing the frontend to long-poll the database waiting for the webhook to travel across the internet.

---

## 12. Future Improvements

To scale this to a tier-1 enterprise level, the following evolutions are necessary:

- **Asynchronous Post-Processing (Message Queues):** Integrate a distributed message queue (e.g., BullMQ/Redis) to handle post-payment workflows like PDF invoice generation and email dispatch without blocking the main webhook execution thread.
- **Subscription Auto-Renewal:** Migrate from static one-time payments to recurring mandate tokens, introducing handling for `subscription.charged` and `subscription.halted` webhook events.
- **Microservice Extraction:** As the platform scales, extract the Payment Module into an independent Node.js microservice communicating with the core API via gRPC or Kafka, ensuring main platform traffic spikes do not impact payment processing.
- **Multi-Gateway Routing:** Integrate Stripe alongside Razorpay, dynamically routing traffic based on the user's IP/geolocation for optimal regional acceptance rates.