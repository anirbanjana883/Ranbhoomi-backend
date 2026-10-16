import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import { errorHandler } from "./shared/middlewares/errorHandler.middleware.js";

// Import Modular Routes
import authRoutes from "./modules/auth/auth.routes.js";
import userRoutes from "./modules/users/user.routes.js";
import problemRoutes from "./modules/problems/problem.routes.js";
import executionRoutes from "./modules/codeexecution/codeexecution.routes.js";
import contestRoutes from "./modules/contests/contest.routes.js";
import interviewRoutes from "./modules/interview/interview.routes.js";
import paymentRoutes from "./modules/payments/payment.routes.js";
import roadmapRoutes from "./modules/roadmaps/roadmap.routes.js";
import { razorpayWebhook } from "./modules/payments/payment.controller.js";

const app = express();

app.get('/api/health', (req, res) => res.status(200).send('Backend is awake'));

// Webhook MUST be before express.json()
app.post("/api/payment/webhook", express.raw({ type: "application/json" }), razorpayWebhook);

app.use(express.json());
app.use(cookieParser());

const rawOrigins = [process.env.FRONTEND_URL, "http://localhost:5173", "http://127.0.0.1:5173"];
const allowedOrigins = rawOrigins.map(url => url ? url.replace(/\/$/, "") : null).filter(Boolean);

app.use((req, res, next) => {
    const origin = req.headers.origin ? req.headers.origin.replace(/\/$/, "") : null;
    if (allowedOrigins.includes(origin)) res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS, POST, PUT, DELETE, PATCH");
    res.setHeader("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
    if (req.method === "OPTIONS") return res.status(200).end();
    next();
});

app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            connectSrc: ["'self'", ...allowedOrigins, "ws://localhost:5000", "wss://*.onrender.com"],
            imgSrc: ["'self'", "data:", "https://lh3.googleusercontent.com", "https://cdn-icons-png.flaticon.com"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
        },
    },
}));

// Route Definitions
app.use("/api/auth", authRoutes);
app.use("/api/user", userRoutes);
app.use("/api/problems", problemRoutes);
app.use("/api/code", executionRoutes); 
app.use("/api/contests", contestRoutes);
app.use("/api/interview", interviewRoutes);
app.use("/api/payment", paymentRoutes);
app.use("/api/roadmaps", roadmapRoutes);

app.get("/", (req, res) => res.send("RANBHOOMI API Operational ⚔️"));
app.use(errorHandler);

export default app;