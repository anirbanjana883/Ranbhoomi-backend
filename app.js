import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";

// Routes
import authRouter from "./route/authRoute.js";
import userRouter from "./route/userRoute.js";
import communityRouter from "./route/communityRoutes.js";
import adminRequestRouter from "./route/adminRequestRoute.js";
import problemRouter from "./route/problemRoute.js";
import tagRouter from "./route/tagRoutes.js";
import submissionRouter from "./route/submissionRoutes.js";
import contestRouter from "./route/contestRoutes.js";
import contestSubmissionRouter from "./route/contestSubmissionRoute.js";
import interviewRouter from "./route/interviewRoute.js";
import commentRouter from "./route/commentRoute.js";
import aiRouter from "./route/aiRoute.js";
import paymentRouter from "./route/paymentRoute.js";
import { errorHandler } from "./middleware/errorHandler.js";
import roadmapAdminRouter from "./route/roadmapAdminRoute.js";
import roadmapRouter from "./route/roadmapRoute.js";
import { razorpayWebhook } from "./controller/webhookController.js";

const app = express();

app.get('/api/health', (req, res) => res.send('Backend is awake'));

// Webhook MUST be before express.json()
app.post("/api/payment/webhook", express.raw({ type: "application/json" }), razorpayWebhook);

app.use(express.json());
app.use(cookieParser());

// 1. Define Origins & Strip Trailing Slashes (Bulletproof safety)
const rawOrigins = [
    process.env.FRONTEND_URL, 
    "http://localhost:5173",
    "http://127.0.0.1:5173"
];
const allowedOrigins = rawOrigins.map(url => url ? url.replace(/\/$/, "") : null).filter(Boolean);

// 2. The Invincible Custom CORS Middleware
app.use((req, res, next) => {
    // Strip trailing slash from incoming origin just to be safe
    const origin = req.headers.origin ? req.headers.origin.replace(/\/$/, "") : null;
    
    // If the request comes from an origin in our list, bounce that exact origin back!
    if (allowedOrigins.includes(origin)) {
        res.setHeader("Access-Control-Allow-Origin", origin);
    }
    
    // CRITICAL FOR AUTH: Allow cookies to be sent
    res.setHeader("Access-Control-Allow-Credentials", "true");
    
    // Standard allowed methods and headers
    res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS, POST, PUT, DELETE, PATCH");
    res.setHeader("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");

    // Handle preflight requests instantly
    if (req.method === "OPTIONS") {
        return res.status(200).end();
    }
    
    next();
});

// 3. Helmet Security
app.use(
    helmet({
        crossOriginResourcePolicy: { policy: "cross-origin" },
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                connectSrc: [
                    "'self'", 
                    ...allowedOrigins,         
                    "ws://localhost:5000",     
                    "wss://*.onrender.com"     
                ],
                imgSrc: ["'self'", "data:", "https://lh3.googleusercontent.com", "https://cdn-icons-png.flaticon.com"],
                scriptSrc: ["'self'", "'unsafe-inline'"],
            },
        },
    })
);

app.use((req, res, next) => {
    console.log(`[API] ${req.method} ${req.originalUrl} | Origin: ${req.headers.origin}`);
    next();
});

// --- ROUTES ---
app.use("/api/auth", authRouter);
app.use("/api/user", userRouter);
app.use("/api/admin", adminRequestRouter);
app.use("/api/problems", problemRouter);
app.use("/api/tags", tagRouter);
app.use("/api/submissions", submissionRouter);
app.use("/api/contests", contestRouter);
app.use("/api/contest-submissions", contestSubmissionRouter);
app.use("/api/interview", interviewRouter);
app.use('/api/comments', commentRouter);
app.use("/api/ai", aiRouter);
app.use("/api/payment", paymentRouter);
app.use("/api/community", communityRouter);
app.use("/api/admin/roadmap", roadmapAdminRouter);
app.use("/api/roadmap", roadmapRouter);

app.get("/", (req, res) => res.send("RANBHOOMI API Operational ⚔️"));

app.use(errorHandler);

export default app;